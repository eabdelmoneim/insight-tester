import * as fs from 'fs';

interface ExtraHolder {
  address: string;
  balance: string;
  pendingBalanceUpdate: string;
}

function parseExtraHoldersCSV(filePath: string): Map<string, ExtraHolder> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const holders = new Map<string, ExtraHolder>();

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

function compareExtraHolders() {
  console.log('🔍 Loading extra holders data...');

  const starz4Holders = parseExtraHoldersCSV('curtis_extra_holders_starz4.csv');
  const starz5Holders = parseExtraHoldersCSV('curtis_extra_holders_starz5.csv');

  console.log(`📊 Starz4 extra holders: ${starz4Holders.size}`);
  console.log(`📊 Starz5 extra holders: ${starz5Holders.size}`);

  // Find holders in Starz5 but not in Starz4 (new missing holders)
  const newInStarz5: ExtraHolder[] = [];
  for (const [address, holder] of starz5Holders) {
    if (!starz4Holders.has(address)) {
      newInStarz5.push(holder);
    }
  }

  // Find holders in Starz4 but not in Starz5 (holders that appeared in Starz5)
  const removedInStarz5: ExtraHolder[] = [];
  for (const [address, holder] of starz4Holders) {
    if (!starz5Holders.has(address)) {
      removedInStarz5.push(holder);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 EXTRA HOLDERS COMPARISON (Starz4 vs Starz5)');
  console.log('='.repeat(80));

  console.log(`\n➕ New in Starz5 extra holders (${newInStarz5.length}):`);
  if (newInStarz5.length > 0) {
    console.log('Address,Balance,PendingBalanceUpdate');
    newInStarz5.forEach(holder => {
      console.log(`${holder.address},${holder.balance},${holder.pendingBalanceUpdate}`);
    });
  }

  console.log(`\n➖ Removed from Starz5 extra holders (${removedInStarz5.length}):`);
  if (removedInStarz5.length > 0) {
    console.log('Address,Balance,PendingBalanceUpdate');
    removedInStarz5.forEach(holder => {
      console.log(`${holder.address},${holder.balance},${holder.pendingBalanceUpdate}`);
    });
  }

  console.log('\n📈 Summary:');
  console.log(`- Starz4 extra holders: ${starz4Holders.size.toLocaleString()}`);
  console.log(`- Starz5 extra holders: ${starz5Holders.size.toLocaleString()}`);
  console.log(`- New in Starz5: ${newInStarz5.length.toLocaleString()}`);
  console.log(`- Removed in Starz5: ${removedInStarz5.length.toLocaleString()}`);
  console.log(`- Net change: ${(newInStarz5.length - removedInStarz5.length > 0 ? '+' : '')}${newInStarz5.length - removedInStarz5.length}`);

  // Check for the new high-balance holder
  const newHighBalance = '0x24c3bd589a81839322a31d95856314017e341575';
  const oldHighBalance = '0xe65167ccf12394a49a1ff8794ebea8eece3e49d4';
  console.log(`\n🔍 Checking high-balance holders:`);
  console.log(`- ${oldHighBalance} (30 tokens from Starz4): ${starz5Holders.has(oldHighBalance.toLowerCase()) ? 'YES' : 'NO'}`);
  console.log(`- ${newHighBalance} (30 tokens in Starz5): ${starz5Holders.has(newHighBalance.toLowerCase()) ? 'YES' : 'NO'}`);

  if (starz5Holders.has(newHighBalance.toLowerCase())) {
    const holder = starz5Holders.get(newHighBalance.toLowerCase())!;
    console.log(`- New holder balance: ${holder.balance}`);
  }
}

compareExtraHolders();