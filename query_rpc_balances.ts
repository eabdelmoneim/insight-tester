import fetch from 'node-fetch';

const RPC_URL = 'https://33139.rpc.thirdweb.com';
const SECRET_KEY = 'LSHKmKV3_xBpofktcx9wkh0niQFUHL7ZHj9BAxOdNnELRVm7ajkE87TecKEPOZuJ5pSLJO-a_d9tZGHyX5a4Tw';
const TOKEN_CONTRACT = '0x48b62137edfa95a428d35c09e44256a739f6b557';

// Smallest non-zero addresses from our analysis
const smallestAddresses = [
  '0x2dafae51dfa8a773a47074324ceec1f8881aeda3', // 1 wei
  '0x040d041a3b148dfdbf272b68e6530ddbcea65958', // 1 wei
  '0xb2c048950d38b2456d51b1298e0681d149d4b5f0', // 1 wei
  '0xc96f4de58ad0d92c523623d19001b0f3b244156a', // 1 wei
  '0xecd6bcafcd10b460bf7236e688b43f4ba4163616'  // 1 wei
];

function padAddress(address: string): string {
  // Remove 0x prefix and pad to 32 bytes (64 hex chars)
  const cleanAddress = address.replace('0x', '');
  return cleanAddress.padStart(64, '0');
}

async function queryBalance(address: string): Promise<string | null> {
  const paddedAddress = padAddress(address);
  const data = `0x70a08231${paddedAddress}`;

  const payload = {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [
      {
        to: TOKEN_CONTRACT,
        data: data
      },
      "latest"
    ],
    id: 1
  };

  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SECRET_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.log(`❌ HTTP Error ${response.status}: ${response.statusText}`);
      return null;
    }

    const result = await response.json();

    if (result.error) {
      console.log(`❌ RPC Error: ${result.error.message}`);
      return null;
    }

    return result.result;
  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
    return null;
  }
}

function hexToDecimal(hex: string): string {
  if (!hex || hex === '0x' || hex === '0x0') return '0';

  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

  // Convert to decimal
  const decimal = BigInt('0x' + cleanHex);
  return decimal.toString();
}

function weiToTokens(wei: string, decimals: number = 18): string {
  const weiAmount = BigInt(wei);
  const divisor = BigInt(10 ** decimals);

  // Get integer part
  const integerPart = weiAmount / divisor;

  // Get fractional part
  const remainder = weiAmount % divisor;
  const fractionalPart = remainder.toString().padStart(decimals, '0');

  // Remove trailing zeros from fractional part
  const trimmedFractional = fractionalPart.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return integerPart.toString();
  } else {
    return `${integerPart}.${trimmedFractional}`;
  }
}

async function checkSmallestBalances() {
  console.log('🔍 Querying RPC for smallest wallet balances...');
  console.log(`📍 RPC: ${RPC_URL}`);
  console.log(`🪙 Token: ${TOKEN_CONTRACT}`);
  console.log('');

  for (const address of smallestAddresses) {
    console.log(`\n📍 Checking: ${address}`);
    console.log(`📦 Data: 0x70a08231${padAddress(address)}`);

    const result = await queryBalance(address);

    if (result) {
      const weiBalance = hexToDecimal(result);
      const tokenBalance = weiToTokens(weiBalance);

      console.log(`✅ Raw result: ${result}`);
      console.log(`💰 Wei balance: ${weiBalance}`);
      console.log(`🪙 Token balance: ${tokenBalance}`);
    } else {
      console.log(`❌ Failed to get balance`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

checkSmallestBalances().catch(console.error);