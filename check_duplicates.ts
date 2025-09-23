import * as fs from 'fs';

function checkDuplicates() {
  console.log('🔍 Checking for duplicates in curtis_holders.csv...');

  const content = fs.readFileSync('curtis_holders.csv', 'utf-8');
  const lines = content.split('\n');

  const addressCounts = new Map<string, number>();
  const duplicateLines: string[] = [];
  let totalLines = 0;

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    totalLines++;

    // Parse CSV line with quoted values
    const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)"$/);
    if (match) {
      const address = match[1].toLowerCase();

      // Count occurrences
      const currentCount = addressCounts.get(address) || 0;
      addressCounts.set(address, currentCount + 1);

      // Track duplicate lines
      if (currentCount > 0) {
        duplicateLines.push(`Line ${i + 1}: ${line}`);
      }
    } else {
      console.log(`⚠️  Could not parse line ${i + 1}: ${line}`);
    }
  }

  // Find all duplicates
  const duplicates = new Map<string, number>();
  for (const [address, count] of addressCounts) {
    if (count > 1) {
      duplicates.set(address, count);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 DUPLICATE CHECK RESULTS');
  console.log('='.repeat(80));

  console.log(`\n📊 Summary:`);
  console.log(`- Total lines processed: ${totalLines.toLocaleString()}`);
  console.log(`- Unique addresses: ${addressCounts.size.toLocaleString()}`);
  console.log(`- Duplicate addresses: ${duplicates.size.toLocaleString()}`);

  if (duplicates.size > 0) {
    console.log(`\n🔄 Duplicate addresses found:`);
    console.log('Address,Count');

    // Sort by count (highest first)
    const sortedDuplicates = Array.from(duplicates.entries())
      .sort((a, b) => b[1] - a[1]);

    sortedDuplicates.forEach(([address, count]) => {
      console.log(`${address},${count}`);
    });

    if (duplicateLines.length > 0 && duplicateLines.length <= 20) {
      console.log(`\n📝 Duplicate lines:`);
      duplicateLines.forEach(line => console.log(line));
    } else if (duplicateLines.length > 20) {
      console.log(`\n📝 First 20 duplicate lines:`);
      duplicateLines.slice(0, 20).forEach(line => console.log(line));
      console.log(`... and ${duplicateLines.length - 20} more`);
    }
  } else {
    console.log(`\n✅ No duplicates found! All addresses are unique.`);
  }

  // Calculate expected vs actual
  const expectedTotal = addressCounts.size;
  const actualTotal = totalLines;
  const duplicateCount = actualTotal - expectedTotal;

  if (duplicateCount > 0) {
    console.log(`\n📈 Impact:`);
    console.log(`- Expected total (if no duplicates): ${expectedTotal.toLocaleString()}`);
    console.log(`- Actual total: ${actualTotal.toLocaleString()}`);
    console.log(`- Extra entries due to duplicates: ${duplicateCount.toLocaleString()}`);
  }
}

checkDuplicates();