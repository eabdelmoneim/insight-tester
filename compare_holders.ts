import * as fs from 'fs';
import * as path from 'path';

interface CurtisHolder {
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

function parseCurtisHolders(filePath: string): Map<string, CurtisHolder> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const holders = new Map<string, CurtisHolder>();

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

function parseStarzHolders(filePath: string): Map<string, StarzHolder> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const holders = new Map<string, StarzHolder>();

  // Find the holder balances CSV section
  const lines = content.split('\n');
  let inHolderSection = false;
  let foundHeader = false;

  for (const line of lines) {
    if (line.includes('=== Holder Balances CSV for 0xFC2744A6Db0f97c606Df786b97255DFf6F27E320')) {
      inHolderSection = true;
      continue;
    }

    if (inHolderSection && line.trim() === 'holder_address,token_balance') {
      foundHeader = true;
      continue;
    }

    if (inHolderSection && foundHeader) {
      // Stop when we hit the summary section
      if (line.includes('Contract: 0xFC2744A6Db0f97c606Df786b97255DFf6F27E320') ||
          line.includes('--') ||
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

function compareHolders() {
  console.log('🔍 Loading holder data...');

  const curtisHolders = parseCurtisHolders('curtis_holders.csv');
  const starzHolders = parseStarzHolders('starz5.txt');

  console.log(`📊 Curtis holders: ${curtisHolders.size}`);
  console.log(`📊 Starz holders: ${starzHolders.size}`);

  // Find missing holders (in Starz but not in Curtis)
  const missingInCurtis: StarzHolder[] = [];
  for (const [address, holder] of starzHolders) {
    if (!curtisHolders.has(address)) {
      missingInCurtis.push(holder);
    }
  }

  // Find extra holders (in Curtis but not in Starz)
  const extraInCurtis: CurtisHolder[] = [];
  for (const [address, holder] of curtisHolders) {
    if (!starzHolders.has(address)) {
      extraInCurtis.push(holder);
    }
  }

  // Find balance differences
  const balanceDifferences: Array<{
    address: string;
    curtisBalance: string;
    starzBalance: string;
    difference: number;
  }> = [];

  for (const [address, curtisHolder] of curtisHolders) {
    const starzHolder = starzHolders.get(address);
    if (starzHolder) {
      const curtisBalance = parseBalance(curtisHolder.balance);
      const starzBalance = parseBalance(starzHolder.balance);
      const difference = Math.abs(curtisBalance - starzBalance);

      // Only report significant differences (> 0.001 tokens)
      if (difference > 0.001) {
        balanceDifferences.push({
          address: curtisHolder.address,
          curtisBalance: curtisHolder.balance,
          starzBalance: starzHolder.balance,
          difference: difference
        });
      }
    }
  }

  // Generate report
  console.log('\n' + '='.repeat(80));
  console.log('📋 HOLDER COMPARISON REPORT');
  console.log('='.repeat(80));

  console.log(`\n🔍 Missing holders in curtis_holders.csv (${missingInCurtis.length}):`);
  if (missingInCurtis.length > 0) {
    console.log('Address,Balance');
    missingInCurtis
      .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
      .slice(0, 50) // Show top 50
      .forEach(holder => {
        console.log(`${holder.address},${holder.balance}`);
      });

    if (missingInCurtis.length > 50) {
      console.log(`... and ${missingInCurtis.length - 50} more`);
    }
  }

  console.log(`\n➕ Extra holders in curtis_holders.csv (${extraInCurtis.length}):`);
  if (extraInCurtis.length > 0) {
    console.log('Address,Balance');
    extraInCurtis
      .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
      .slice(0, 20) // Show top 20
      .forEach(holder => {
        console.log(`${holder.address},${holder.balance}`);
      });

    if (extraInCurtis.length > 20) {
      console.log(`... and ${extraInCurtis.length - 20} more`);
    }
  }

  console.log(`\n⚖️  Balance differences (${balanceDifferences.length}):`);
  if (balanceDifferences.length > 0) {
    console.log('Address,Curtis Balance,Starz Balance,Difference');
    balanceDifferences
      .sort((a, b) => b.difference - a.difference)
      .slice(0, 20) // Show top 20 differences
      .forEach(diff => {
        console.log(`${diff.address},${diff.curtisBalance},${diff.starzBalance},${diff.difference.toFixed(6)}`);
      });

    if (balanceDifferences.length > 20) {
      console.log(`... and ${balanceDifferences.length - 20} more`);
    }
  }

  console.log('\n📈 Summary:');
  console.log(`- Curtis holders: ${curtisHolders.size.toLocaleString()}`);
  console.log(`- Starz holders: ${starzHolders.size.toLocaleString()}`);
  console.log(`- Missing in Curtis: ${missingInCurtis.length.toLocaleString()}`);
  console.log(`- Extra in Curtis: ${extraInCurtis.length.toLocaleString()}`);
  console.log(`- Balance differences: ${balanceDifferences.length.toLocaleString()}`);

  const totalMissingBalance = missingInCurtis.reduce((sum, holder) => sum + parseBalance(holder.balance), 0);
  console.log(`- Total balance of missing holders: ${totalMissingBalance.toLocaleString()} tokens`);

  // Write extra holders to CSV file
  if (extraInCurtis.length > 0) {
    const csvContent = 'Address,Balance,PendingBalanceUpdate\n' +
      extraInCurtis
        .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
        .map(holder => `"${holder.address}","${holder.balance}","${holder.pendingBalanceUpdate}"`)
        .join('\n');

    fs.writeFileSync('curtis_extra_holders_starz5.csv', csvContent);
    console.log(`\n📁 Exported ${extraInCurtis.length} extra holders to curtis_extra_holders_starz5.csv`);
  }
}

compareHolders();