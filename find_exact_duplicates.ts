import * as fs from 'fs';

function findExactDuplicates() {
  console.log('🔍 Finding exact duplicates in wrapped apecoin data from starz9.txt...');

  const content = fs.readFileSync('starz9.txt', 'utf-8');
  const lines = content.split('\n');

  // Find the wrapped apecoin section (second contract)
  let inWrappedApecoinSection = false;
  let foundHeader = false;
  let addressCounts = new Map<string, number>();
  let addressLines = new Map<string, number[]>();
  let lineNumber = 0;
  let totalItems = 0;

  for (const line of lines) {
    lineNumber++;

    // Look for the second occurrence (wrapped apecoin)
    if (line.includes('=== Holder Balances CSV for 0x48b62137edfa95a428d35c09e44256a739f6b557')) {
      if (inWrappedApecoinSection) {
        // This is the second occurrence, stop here
        break;
      }
      inWrappedApecoinSection = true;
      continue;
    }

    if (inWrappedApecoinSection && line.trim() === 'holder_address,token_balance') {
      foundHeader = true;
      continue;
    }

    if (inWrappedApecoinSection && foundHeader) {
      // Stop when we hit the summary section
      if (line.includes('Contract: 0x48b62137edfa95a428d35c09e44256a739f6b557') ||
          line.includes('--') ||
          line.trim() === '') {
        break;
      }

      const parts = line.split(',');
      if (parts.length >= 2) {
        const address = parts[0].toLowerCase();
        totalItems++;

        // Count occurrences
        const currentCount = addressCounts.get(address) || 0;
        addressCounts.set(address, currentCount + 1);

        // Track line numbers
        if (!addressLines.has(address)) {
          addressLines.set(address, []);
        }
        addressLines.get(address)!.push(lineNumber);
      }
    }
  }

  // Find duplicates
  const duplicates = new Map<string, { count: number; lines: number[] }>();
  for (const [address, count] of addressCounts) {
    if (count > 1) {
      duplicates.set(address, {
        count: count,
        lines: addressLines.get(address) || []
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 EXACT DUPLICATE ANALYSIS - WRAPPED APECOIN');
  console.log('='.repeat(80));

  console.log(`\n📊 Summary:`);
  console.log(`- Total items processed: ${totalItems.toLocaleString()}`);
  console.log(`- Unique addresses: ${addressCounts.size.toLocaleString()}`);
  console.log(`- Duplicate addresses: ${duplicates.size.toLocaleString()}`);
  console.log(`- Total duplicate entries: ${totalItems - addressCounts.size}`);

  if (duplicates.size > 0) {
    console.log(`\n🔄 Duplicate addresses found:`);
    console.log('Address,Count,Line Numbers');

    // Sort by count (highest first)
    const sortedDuplicates = Array.from(duplicates.entries())
      .sort((a, b) => b[1].count - a[1].count);

    sortedDuplicates.forEach(([address, data]) => {
      const lineNumbersStr = data.lines.join(' | ');
      console.log(`${address},${data.count},"${lineNumbersStr}"`);
    });

    // Get the actual balance data for these duplicates
    console.log(`\n📝 Duplicate balance details:`);

    for (const [address, data] of sortedDuplicates) {
      console.log(`\n🔍 Address: ${address}`);
      console.log(`   Occurrences: ${data.count}`);

      data.lines.forEach((lineNum, index) => {
        if (lineNum <= lines.length) {
          const lineContent = lines[lineNum - 1];
          const parts = lineContent.split(',');
          if (parts.length >= 2) {
            console.log(`   ${index + 1}. Line ${lineNum}: ${parts[0]}, ${parts[1]}`);
          }
        }
      });
    }

  } else {
    console.log(`\n✅ No duplicates found in our parsing`);
    console.log(`This suggests the duplicates might be in a different format or section`);
  }

  console.log(`\n🧮 Verification:`);
  console.log(`- Expected total items: 29,886`);
  console.log(`- Our parsed items: ${totalItems}`);
  console.log(`- Expected unique: 29,877`);
  console.log(`- Our unique: ${addressCounts.size}`);
  console.log(`- Expected duplicates: 9`);
  console.log(`- Our duplicates: ${totalItems - addressCounts.size}`);
}

findExactDuplicates();