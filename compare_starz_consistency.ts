import * as fs from 'fs';

interface StarzHolder {
  address: string;
  balance: string;
}

function parseStarzWrappedApecoinHolders(filePath: string): Map<string, StarzHolder> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const holders = new Map<string, StarzHolder>();

  // Find the holder balances CSV section for wrapped apecoin
  const lines = content.split('\n');
  let inHolderSection = false;
  let foundHeader = false;

  for (const line of lines) {
    if (line.includes('=== Holder Balances CSV for 0x48b62137edfa95a428d35c09e44256a739f6b557')) {
      inHolderSection = true;
      continue;
    }

    if (inHolderSection && line.trim() === 'holder_address,token_balance') {
      foundHeader = true;
      continue;
    }

    if (inHolderSection && foundHeader) {
      // Stop when we hit the summary section or next contract
      if (line.includes('Contract: 0x48b62137edfa95a428d35c09e44256a739f6b557') ||
          line.includes('--') ||
          line.includes('===') ||
          line.trim() === '') {
        break;
      }

      const parts = line.split(',');
      if (parts.length >= 2) {
        const address = parts[0].toLowerCase();
        const balance = parts[1];
        holders.set(address, {
          address: parts[0],
          balance: balance
        });
      }
    }
  }

  return holders;
}

function getWrappedApecoinSummary(filePath: string): { totalHolders: number; decimals: number } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/=== Holder Balances CSV for 0x48b62137edfa95a428d35c09e44256a739f6b557 \((\d+) total holders, (\d+) decimals\) ===/);
    if (match) {
      return {
        totalHolders: parseInt(match[1]),
        decimals: parseInt(match[2])
      };
    }
  }

  return { totalHolders: 0, decimals: 0 };
}

function parseBalance(balanceStr: string): number {
  return parseFloat(balanceStr.replace(/,/g, ''));
}

function compareStarzConsistency() {
  console.log('🔍 Comparing Starz8 and Starz9 for wrapped apecoin consistency...');

  const starz8Holders = parseStarzWrappedApecoinHolders('starz8.txt');
  const starz9Holders = parseStarzWrappedApecoinHolders('starz9.txt');

  const starz8Summary = getWrappedApecoinSummary('starz8.txt');
  const starz9Summary = getWrappedApecoinSummary('starz9.txt');

  console.log(`📊 Starz8 holders: ${starz8Holders.size} (reported: ${starz8Summary.totalHolders})`);
  console.log(`📊 Starz9 holders: ${starz9Holders.size} (reported: ${starz9Summary.totalHolders})`);
  console.log(`📊 Decimals - Starz8: ${starz8Summary.decimals}, Starz9: ${starz9Summary.decimals}`);

  // Find differences
  const onlyInStarz8: StarzHolder[] = [];
  const onlyInStarz9: StarzHolder[] = [];
  const balanceDifferences: Array<{
    address: string;
    starz8Balance: string;
    starz9Balance: string;
    difference: number;
  }> = [];

  // Check for holders only in Starz8
  for (const [address, holder] of starz8Holders) {
    if (!starz9Holders.has(address)) {
      onlyInStarz8.push(holder);
    }
  }

  // Check for holders only in Starz9
  for (const [address, holder] of starz9Holders) {
    if (!starz8Holders.has(address)) {
      onlyInStarz9.push(holder);
    }
  }

  // Check for balance differences
  for (const [address, starz8Holder] of starz8Holders) {
    const starz9Holder = starz9Holders.get(address);
    if (starz9Holder) {
      const starz8Balance = parseBalance(starz8Holder.balance);
      const starz9Balance = parseBalance(starz9Holder.balance);
      const difference = Math.abs(starz8Balance - starz9Balance);

      if (difference > 0.000001) { // Very small threshold for floating point differences
        balanceDifferences.push({
          address: starz8Holder.address,
          starz8Balance: starz8Holder.balance,
          starz9Balance: starz9Holder.balance,
          difference: difference
        });
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 STARZ8 vs STARZ9 CONSISTENCY CHECK');
  console.log('='.repeat(80));

  console.log(`\n📊 Summary Stats:`);
  console.log(`- Starz8 total holders: ${starz8Summary.totalHolders.toLocaleString()}`);
  console.log(`- Starz9 total holders: ${starz9Summary.totalHolders.toLocaleString()}`);
  console.log(`- Difference in reported totals: ${Math.abs(starz8Summary.totalHolders - starz9Summary.totalHolders)}`);
  console.log(`- Starz8 parsed holders: ${starz8Holders.size.toLocaleString()}`);
  console.log(`- Starz9 parsed holders: ${starz9Holders.size.toLocaleString()}`);
  console.log(`- Difference in parsed holders: ${Math.abs(starz8Holders.size - starz9Holders.size)}`);

  console.log(`\n🔍 Differences Found:`);
  console.log(`- Only in Starz8: ${onlyInStarz8.length.toLocaleString()}`);
  console.log(`- Only in Starz9: ${onlyInStarz9.length.toLocaleString()}`);
  console.log(`- Balance differences: ${balanceDifferences.length.toLocaleString()}`);

  if (onlyInStarz8.length > 0) {
    console.log(`\n➖ Holders only in Starz8 (${onlyInStarz8.length}):`);
    console.log('Address,Balance');
    onlyInStarz8
      .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
      .slice(0, 20)
      .forEach(holder => {
        console.log(`${holder.address},${holder.balance}`);
      });
    if (onlyInStarz8.length > 20) {
      console.log(`... and ${onlyInStarz8.length - 20} more`);
    }
  }

  if (onlyInStarz9.length > 0) {
    console.log(`\n➕ Holders only in Starz9 (${onlyInStarz9.length}):`);
    console.log('Address,Balance');
    onlyInStarz9
      .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
      .slice(0, 20)
      .forEach(holder => {
        console.log(`${holder.address},${holder.balance}`);
      });
    if (onlyInStarz9.length > 20) {
      console.log(`... and ${onlyInStarz9.length - 20} more`);
    }
  }

  if (balanceDifferences.length > 0) {
    console.log(`\n⚖️  Balance differences (${balanceDifferences.length}):`);
    console.log('Address,Starz8 Balance,Starz9 Balance,Difference');
    balanceDifferences
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 20)
      .forEach(diff => {
        console.log(`${diff.address},${diff.starz8Balance},${diff.starz9Balance},${diff.difference.toFixed(6)}`);
      });
    if (balanceDifferences.length > 20) {
      console.log(`... and ${balanceDifferences.length - 20} more`);
    }
  }

  // Calculate total balance differences
  const starz8Total = Array.from(starz8Holders.values()).reduce((sum, holder) => sum + parseBalance(holder.balance), 0);
  const starz9Total = Array.from(starz9Holders.values()).reduce((sum, holder) => sum + parseBalance(holder.balance), 0);

  console.log(`\n💰 Total Balance Comparison:`);
  console.log(`- Starz8 total balance: ${starz8Total.toLocaleString()} tokens`);
  console.log(`- Starz9 total balance: ${starz9Total.toLocaleString()} tokens`);
  console.log(`- Total balance difference: ${Math.abs(starz8Total - starz9Total).toLocaleString()} tokens`);

  // Overall consistency verdict
  const isConsistent = (
    onlyInStarz8.length === 0 &&
    onlyInStarz9.length === 0 &&
    balanceDifferences.length === 0 &&
    starz8Summary.totalHolders === starz9Summary.totalHolders
  );

  console.log(`\n🎯 Consistency Verdict: ${isConsistent ? '✅ IDENTICAL' : '❌ DIFFERENCES FOUND'}`);

  if (!isConsistent) {
    console.log('\n⚠️  API results are NOT consistent between runs. This suggests:');
    console.log('   - Data is being updated between API calls');
    console.log('   - API has timing/caching issues');
    console.log('   - Different data snapshots are being served');
  }
}

compareStarzConsistency();