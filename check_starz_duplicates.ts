import * as fs from 'fs';

interface StarzHolder {
  address: string;
  balance: string;
  lineNumber: number;
}

function parseStarzWrappedApecoinWithDuplicates(filePath: string): {
  holders: Map<string, StarzHolder[]>;
  totalItems: number;
  uniqueAddresses: number;
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const holders = new Map<string, StarzHolder[]>();
  let totalItems = 0;

  // Find the holder balances CSV section for wrapped apecoin
  const lines = content.split('\n');
  let inHolderSection = false;
  let foundHeader = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;

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
        totalItems++;

        const holder: StarzHolder = {
          address: parts[0], // Keep original case
          balance: balance,
          lineNumber: lineNumber
        };

        // Track all occurrences of each address
        if (!holders.has(address)) {
          holders.set(address, []);
        }
        holders.get(address)!.push(holder);
      }
    }
  }

  return {
    holders,
    totalItems,
    uniqueAddresses: holders.size
  };
}

function extractMetadata(filePath: string): {
  reportedTotal: number;
  reportedPages: number;
  totalItemsFromPages: number;
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let reportedTotal = 0;
  let reportedPages = 0;
  let totalItemsFromPages = 0;

  // Find the summary line
  for (const line of lines) {
    const totalMatch = line.match(/=== Holder Balances CSV for 0x48b62137edfa95a428d35c09e44256a739f6b557 \((\d+) total holders/);
    if (totalMatch) {
      reportedTotal = parseInt(totalMatch[1]);
    }

    // Look for page information
    const pageMatch = line.match(/got (\d+) items, unique holders: \d+, total items so far: (\d+)/);
    if (pageMatch) {
      totalItemsFromPages = parseInt(pageMatch[2]);
    }

    // Count pages
    if (line.includes('Page ') && line.includes('completed in')) {
      reportedPages++;
    }
  }

  return { reportedTotal, reportedPages, totalItemsFromPages };
}

function checkStarzDuplicates() {
  console.log('🔍 Checking for duplicate wallets in starz9.txt...');

  const { holders, totalItems, uniqueAddresses } = parseStarzWrappedApecoinWithDuplicates('starz9.txt');
  const metadata = extractMetadata('starz9.txt');

  console.log('\n' + '='.repeat(80));
  console.log('📋 STARZ9 DUPLICATE ANALYSIS');
  console.log('='.repeat(80));

  console.log(`\n📊 Summary:`);
  console.log(`- Reported total holders: ${metadata.reportedTotal.toLocaleString()}`);
  console.log(`- Total items from pages: ${metadata.totalItemsFromPages.toLocaleString()}`);
  console.log(`- Parsed total items: ${totalItems.toLocaleString()}`);
  console.log(`- Unique addresses: ${uniqueAddresses.toLocaleString()}`);
  console.log(`- Expected duplicates: ${totalItems - uniqueAddresses}`);
  console.log(`- Pages processed: ${metadata.reportedPages}`);

  // Find duplicates
  const duplicates = new Map<string, StarzHolder[]>();
  for (const [address, occurrences] of holders) {
    if (occurrences.length > 1) {
      duplicates.set(address, occurrences);
    }
  }

  console.log(`\n🔄 Duplicate addresses found: ${duplicates.size}`);

  if (duplicates.size > 0) {
    console.log(`\n📝 Duplicate details:`);
    console.log('Address,Occurrences,Balances,Line Numbers');

    // Sort by number of occurrences (highest first)
    const sortedDuplicates = Array.from(duplicates.entries())
      .sort((a, b) => b[1].length - a[1].length);

    sortedDuplicates.forEach(([address, occurrences]) => {
      const balances = occurrences.map(h => h.balance).join(' | ');
      const lineNumbers = occurrences.map(h => h.lineNumber).join(' | ');
      console.log(`${address},${occurrences.length},"${balances}","${lineNumbers}"`);
    });

    // Check if balances are identical for duplicates
    console.log(`\n🔍 Balance consistency check:`);
    let allBalancesConsistent = true;

    sortedDuplicates.forEach(([address, occurrences]) => {
      const firstBalance = occurrences[0].balance;
      const allSame = occurrences.every(h => h.balance === firstBalance);

      if (!allSame) {
        console.log(`❌ ${address}: Different balances - ${occurrences.map(h => h.balance).join(', ')}`);
        allBalancesConsistent = false;
      } else {
        console.log(`✅ ${address}: Consistent balance - ${firstBalance}`);
      }
    });

    if (allBalancesConsistent) {
      console.log(`\n✅ All duplicate addresses have consistent balances`);
    } else {
      console.log(`\n❌ Some duplicate addresses have inconsistent balances!`);
    }

    // Calculate total impact
    const totalDuplicateEntries = Array.from(duplicates.values())
      .reduce((sum, occurrences) => sum + occurrences.length - 1, 0);

    console.log(`\n💎 Impact:`);
    console.log(`- Total duplicate entries: ${totalDuplicateEntries}`);
    console.log(`- Expected total without duplicates: ${totalItems - totalDuplicateEntries}`);
    console.log(`- Matches unique addresses: ${totalItems - totalDuplicateEntries === uniqueAddresses ? 'YES' : 'NO'}`);

  } else {
    console.log(`\n✅ No duplicate addresses found - this is unexpected!`);
    console.log(`\n🤔 Possible explanations:`);
    console.log(`- Parsing error in our script`);
    console.log(`- API counting includes some other data`);
    console.log(`- API total includes metadata or headers`);
  }

  // Verify our math
  console.log(`\n🧮 Verification:`);
  console.log(`- Items parsed: ${totalItems}`);
  console.log(`- Unique addresses: ${uniqueAddresses}`);
  console.log(`- Difference: ${totalItems - uniqueAddresses}`);
  console.log(`- Expected from question: 29886 - 29877 = 9`);
  console.log(`- Our calculation matches: ${(totalItems - uniqueAddresses) === 9 ? 'YES' : 'NO'}`);
}

checkStarzDuplicates();