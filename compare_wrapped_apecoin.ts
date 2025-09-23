import * as fs from 'fs';

interface WrappedApecoinHolder {
  address: string;
  balance: string;
  pendingBalanceUpdate: string;
}

interface StarzHolder {
  address: string;
  balance: string;
}

function parseBalance(balanceStr: string): number {
  // Remove commas and convert to number
  return parseFloat(balanceStr.replace(/,/g, ''));
}

function parseWrappedApecoinHolders(filePath: string): Map<string, WrappedApecoinHolder> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const holders = new Map<string, WrappedApecoinHolder>();

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line with quoted values
    const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)"$/);
    if (match) {
      const address = match[1].toLowerCase();
      holders.set(address, {
        address: match[1],
        balance: match[2],
        pendingBalanceUpdate: match[3]
      });
    }
  }

  return holders;
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

function analyzeBalanceDistribution(holders: Map<string, any>, name: string) {
  const balances = Array.from(holders.values()).map(h => parseBalance(h.balance));
  balances.sort((a, b) => b - a);

  const total = balances.reduce((sum, bal) => sum + bal, 0);
  const median = balances[Math.floor(balances.length / 2)];
  const top10 = balances.slice(0, 10);
  const bottom10 = balances.slice(-10);

  console.log(`\n📊 ${name} Balance Distribution:`);
  console.log(`- Total holders: ${holders.size.toLocaleString()}`);
  console.log(`- Total balance: ${total.toLocaleString()} tokens`);
  console.log(`- Average balance: ${(total / holders.size).toFixed(6)} tokens`);
  console.log(`- Median balance: ${median.toFixed(6)} tokens`);
  console.log(`- Largest balance: ${balances[0].toLocaleString()} tokens`);
  console.log(`- Smallest balance: ${balances[balances.length - 1].toFixed(6)} tokens`);

  // Balance distribution analysis
  const ranges = [
    { min: 1000000, label: '> 1M tokens' },
    { min: 100000, max: 999999.99, label: '100K - 1M tokens' },
    { min: 10000, max: 99999.99, label: '10K - 100K tokens' },
    { min: 1000, max: 9999.99, label: '1K - 10K tokens' },
    { min: 100, max: 999.99, label: '100 - 1K tokens' },
    { min: 10, max: 99.99, label: '10 - 100 tokens' },
    { min: 1, max: 9.99, label: '1 - 10 tokens' },
    { min: 0, max: 0.99, label: '< 1 token' }
  ];

  console.log(`\n📈 Balance Ranges:`);
  ranges.forEach(range => {
    const count = balances.filter(bal => {
      if (range.max !== undefined) {
        return bal >= range.min && bal <= range.max;
      } else {
        return bal >= range.min;
      }
    }).length;
    const percentage = (count / balances.length * 100).toFixed(1);
    console.log(`- ${range.label}: ${count.toLocaleString()} holders (${percentage}%)`);
  });
}

function compareWrappedApecoin() {
  console.log('🔍 Loading wrapped apecoin holder data...');

  const wrappedApecoinHolders = parseWrappedApecoinHolders('wrapped_apecoin.csv');
  const starzHolders = parseStarzWrappedApecoinHolders('starz8.txt');

  console.log(`📊 Wrapped Apecoin CSV holders: ${wrappedApecoinHolders.size}`);
  console.log(`📊 Starz8 holders: ${starzHolders.size}`);

  // Find missing holders (in Starz but not in Wrapped Apecoin)
  const missingInWrappedApecoin: StarzHolder[] = [];
  for (const [address, holder] of starzHolders) {
    if (!wrappedApecoinHolders.has(address)) {
      missingInWrappedApecoin.push(holder);
    }
  }

  // Find extra holders (in Wrapped Apecoin but not in Starz)
  const extraInWrappedApecoin: WrappedApecoinHolder[] = [];
  for (const [address, holder] of wrappedApecoinHolders) {
    if (!starzHolders.has(address)) {
      extraInWrappedApecoin.push(holder);
    }
  }

  // Find balance differences
  const balanceDifferences: Array<{
    address: string;
    wrappedApecoinBalance: string;
    starzBalance: string;
    difference: number;
  }> = [];

  for (const [address, wrappedApecoinHolder] of wrappedApecoinHolders) {
    const starzHolder = starzHolders.get(address);
    if (starzHolder) {
      const wrappedApecoinBalance = parseBalance(wrappedApecoinHolder.balance);
      const starzBalance = parseBalance(starzHolder.balance);
      const difference = Math.abs(wrappedApecoinBalance - starzBalance);

      // Only report significant differences (> 0.001 tokens)
      if (difference > 0.001) {
        balanceDifferences.push({
          address: wrappedApecoinHolder.address,
          wrappedApecoinBalance: wrappedApecoinHolder.balance,
          starzBalance: starzHolder.balance,
          difference: difference
        });
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 WRAPPED APECOIN COMPARISON REPORT');
  console.log('='.repeat(80));

  // Analyze balance distributions
  analyzeBalanceDistribution(wrappedApecoinHolders, 'Wrapped Apecoin CSV');
  analyzeBalanceDistribution(starzHolders, 'Starz8');

  console.log(`\n🔍 Missing holders in wrapped_apecoin.csv (${missingInWrappedApecoin.length}):`);
  if (missingInWrappedApecoin.length > 0) {
    console.log('Address,Balance');
    missingInWrappedApecoin
      .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
      .slice(0, 50) // Show top 50
      .forEach(holder => {
        console.log(`${holder.address},${holder.balance}`);
      });

    if (missingInWrappedApecoin.length > 50) {
      console.log(`... and ${missingInWrappedApecoin.length - 50} more`);
    }
  }

  console.log(`\n➕ Extra holders in wrapped_apecoin.csv (${extraInWrappedApecoin.length}):`);
  if (extraInWrappedApecoin.length > 0) {
    console.log('Address,Balance');
    extraInWrappedApecoin
      .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
      .slice(0, 50) // Show top 50
      .forEach(holder => {
        console.log(`${holder.address},${holder.balance}`);
      });

    if (extraInWrappedApecoin.length > 50) {
      console.log(`... and ${extraInWrappedApecoin.length - 50} more`);
    }
  }

  console.log(`\n⚖️  Balance differences (${balanceDifferences.length}):`);
  if (balanceDifferences.length > 0) {
    console.log('Address,Wrapped Apecoin Balance,Starz Balance,Difference');
    balanceDifferences
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 20) // Show top 20 differences
      .forEach(diff => {
        console.log(`${diff.address},${diff.wrappedApecoinBalance},${diff.starzBalance},${diff.difference.toFixed(6)}`);
      });

    if (balanceDifferences.length > 20) {
      console.log(`... and ${balanceDifferences.length - 20} more`);
    }
  }

  console.log('\n📈 Summary:');
  console.log(`- Wrapped Apecoin holders: ${wrappedApecoinHolders.size.toLocaleString()}`);
  console.log(`- Starz8 holders: ${starzHolders.size.toLocaleString()}`);
  console.log(`- Missing in Wrapped Apecoin: ${missingInWrappedApecoin.length.toLocaleString()}`);
  console.log(`- Extra in Wrapped Apecoin: ${extraInWrappedApecoin.length.toLocaleString()}`);
  console.log(`- Balance differences: ${balanceDifferences.length.toLocaleString()}`);

  const totalMissingBalance = missingInWrappedApecoin.reduce((sum, holder) => sum + parseBalance(holder.balance), 0);
  const totalExtraBalance = extraInWrappedApecoin.reduce((sum, holder) => sum + parseBalance(holder.balance), 0);
  console.log(`- Total balance of missing holders: ${totalMissingBalance.toLocaleString()} tokens`);
  console.log(`- Total balance of extra holders: ${totalExtraBalance.toLocaleString()} tokens`);

  // Export results
  if (missingInWrappedApecoin.length > 0) {
    const csvContent = 'Address,Balance\n' +
      missingInWrappedApecoin
        .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
        .map(holder => `"${holder.address}","${holder.balance}"`)
        .join('\n');

    fs.writeFileSync('wrapped_apecoin_missing_holders.csv', csvContent);
    console.log(`\n📁 Exported ${missingInWrappedApecoin.length} missing holders to wrapped_apecoin_missing_holders.csv`);
  }

  if (extraInWrappedApecoin.length > 0) {
    const csvContent = 'Address,Balance,PendingBalanceUpdate\n' +
      extraInWrappedApecoin
        .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
        .map(holder => `"${holder.address}","${holder.balance}","${holder.pendingBalanceUpdate}"`)
        .join('\n');

    fs.writeFileSync('wrapped_apecoin_extra_holders.csv', csvContent);
    console.log(`📁 Exported ${extraInWrappedApecoin.length} extra holders to wrapped_apecoin_extra_holders.csv`);
  }
}

compareWrappedApecoin();