import * as fs from 'fs';

interface WrappedApecoinHolder {
  address: string;
  balance: string;
  pendingBalanceUpdate: string;
}

function parseBalance(balanceStr: string): number {
  return parseFloat(balanceStr.replace(/,/g, ''));
}

function parseWrappedApecoinHolders(filePath: string): WrappedApecoinHolder[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const holders: WrappedApecoinHolder[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line with quoted values
    const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)"$/);
    if (match) {
      holders.push({
        address: match[1],
        balance: match[2],
        pendingBalanceUpdate: match[3]
      });
    }
  }

  return holders;
}

function analyzeSmallBalances() {
  console.log('🔍 Analyzing small balance holders in wrapped_apecoin.csv...');

  const holders = parseWrappedApecoinHolders('wrapped_apecoin.csv');

  // Filter for < 1 token holders
  const smallBalanceHolders = holders.filter(h => parseBalance(h.balance) < 1);

  // Get their balances and sort from smallest to largest
  const balances = smallBalanceHolders.map(h => parseBalance(h.balance));
  balances.sort((a, b) => a - b);

  console.log(`📊 Total holders: ${holders.length.toLocaleString()}`);
  console.log(`📊 Holders with < 1 token: ${smallBalanceHolders.length.toLocaleString()} (${(smallBalanceHolders.length / holders.length * 100).toFixed(1)}%)`);

  if (balances.length === 0) {
    console.log('No holders with < 1 token found.');
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 SMALL BALANCE ANALYSIS (< 1 TOKEN)');
  console.log('='.repeat(80));

  // Basic statistics
  const total = balances.reduce((sum, bal) => sum + bal, 0);
  const average = total / balances.length;
  const median = balances[Math.floor(balances.length / 2)];

  console.log(`\n📈 Statistics:`);
  console.log(`- Count: ${balances.length.toLocaleString()}`);
  console.log(`- Total balance: ${total.toFixed(6)} tokens`);
  console.log(`- Average balance: ${average.toFixed(6)} tokens`);
  console.log(`- Median balance: ${median.toFixed(6)} tokens`);
  console.log(`- Smallest balance: ${balances[0].toFixed(18)} tokens`);
  console.log(`- Largest balance: ${balances[balances.length - 1].toFixed(6)} tokens`);

  // Detailed breakdown by size ranges
  const ranges = [
    { min: 0.1, max: 0.999999, label: '0.1 - 1 tokens', format: 6 },
    { min: 0.01, max: 0.099999, label: '0.01 - 0.1 tokens', format: 6 },
    { min: 0.001, max: 0.009999, label: '0.001 - 0.01 tokens', format: 6 },
    { min: 0.0001, max: 0.000999, label: '0.0001 - 0.001 tokens', format: 8 },
    { min: 0.00001, max: 0.00009999, label: '0.00001 - 0.0001 tokens', format: 8 },
    { min: 0.000001, max: 0.000009999, label: '0.000001 - 0.00001 tokens', format: 10 },
    { min: 0.0000001, max: 0.0000009999, label: '0.0000001 - 0.000001 tokens', format: 12 },
    { min: 0.00000001, max: 0.00000009999, label: '0.00000001 - 0.0000001 tokens', format: 14 },
    { min: 0.000000001, max: 0.000000009999, label: '0.000000001 - 0.00000001 tokens', format: 16 },
    { min: 0, max: 0.000000000999, label: '< 0.000000001 tokens (dust)', format: 18 }
  ];

  console.log(`\n📊 Balance Range Distribution:`);
  ranges.forEach(range => {
    const count = balances.filter(bal => bal >= range.min && bal <= range.max).length;
    const percentage = (count / balances.length * 100).toFixed(1);
    console.log(`- ${range.label}: ${count.toLocaleString()} holders (${percentage}%)`);
  });

  // Show zero balance holders specifically
  const zeroBalanceCount = balances.filter(bal => bal === 0).length;
  const nearZeroCount = balances.filter(bal => bal > 0 && bal < 0.000000000001).length;

  console.log(`\n💰 Ultra-small balances:`);
  console.log(`- Exactly 0 tokens: ${zeroBalanceCount.toLocaleString()} holders`);
  console.log(`- Near-zero (< 0.000000000001): ${nearZeroCount.toLocaleString()} holders`);

  // Show some examples of the smallest balances
  console.log(`\n🔬 Smallest 20 balances (with addresses):`);
  console.log('Address,Balance');
  smallBalanceHolders
    .sort((a, b) => parseBalance(a.balance) - parseBalance(b.balance))
    .slice(0, 20)
    .forEach(holder => {
      console.log(`${holder.address},${parseBalance(holder.balance).toFixed(18)}`);
    });

  // Show some examples of the largest < 1 token balances
  console.log(`\n📊 Largest 20 balances under 1 token:`);
  console.log('Address,Balance');
  smallBalanceHolders
    .sort((a, b) => parseBalance(b.balance) - parseBalance(a.balance))
    .slice(0, 20)
    .forEach(holder => {
      console.log(`${holder.address},${holder.balance}`);
    });

  // Calculate what portion of total supply these small holders represent
  const totalSupplyFromAllHolders = holders.reduce((sum, h) => sum + parseBalance(h.balance), 0);
  const percentageOfSupply = (total / totalSupplyFromAllHolders * 100);

  console.log(`\n💎 Impact Analysis:`);
  console.log(`- Small balance holders represent ${percentageOfSupply.toFixed(6)}% of total token supply`);
  console.log(`- Average holder in this group: ${average.toFixed(8)} tokens`);
  console.log(`- These ${smallBalanceHolders.length.toLocaleString()} holders collectively own ${total.toFixed(6)} tokens`);
}

analyzeSmallBalances();