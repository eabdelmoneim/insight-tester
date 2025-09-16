# Insight API Benchmarking Tool

A comprehensive TypeScript benchmarking tool for testing and validating thirdweb's Insight API endpoints. This tool measures API performance, validates data accuracy, and provides detailed analytics across different contract types and blockchain networks.

## 🎯 What This Tool Does

The benchmarking script performs automated testing of three core Insight API endpoints:

1. **NFT Owners** (`/v1/nfts/owners/{address}`) - Gets all owners of ERC721 contracts
2. **Token Owners** (`/v1/tokens/owners`) - Gets all holders of ERC20 contracts  
3. **NFT Transfers** (`/v1/nfts/transfers`) - Gets all transfer events for ERC721 contracts

## 📊 What It Measures

### Performance Metrics
- **Response times** for each API call (per page and total)
- **Pagination efficiency** across large datasets
- **Throughput** (items per second)
- **API reliability** and error rates

### Data Validation
- **Accuracy verification** against expected counts from CSV files
- **Data completeness** across paginated results
- **Response structure validation** per OpenAPI specification

### Summary Analytics
- **Average response time** per endpoint
- **Slowest queries** identification
- **Endpoint comparison** statistics
- **Validation success/failure rates**

## 🏗️ Project Structure

```
insight-tester/
├── benchmark.ts          # Main benchmarking script
├── collections.csv       # Contract addresses and metadata to test
├── token-owner-data.csv  # Expected owner counts for validation
├── nft-transfers.csv     # Expected transfer counts for validation
├── .env.example          # Environment variables template
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env and add your thirdweb client ID:
# X_CLIENT_ID=your_client_id_here
```

### 3. Run Benchmarks

```bash
# Default run (incremental mode, 24h lookback)
npm run benchmark

# Test with smaller page size
npm run benchmark:fast

# Full historical scan (from block 1)
npm run benchmark:initial

# Custom parameters
npx tsx benchmark.ts --mode incremental --sinceHours 48 --limit 500 --sort asc
```

## 📋 Configuration

### CSV Files

#### `collections.csv`
Contains the contracts to benchmark:
```csv
chain_id,contract_address,erc_standard
2741,0x1c26da604221466976beeb509698152ba8a3a13f,ERC20
2741,0x2b21d07c98905f48a71100af2b58c069be4d0a2a,ERC721
```

#### `token-owner-data.csv`
Expected owner counts for validation:
```csv
contract,number_of_owners
0x1c26da604221466976beeb509698152ba8a3a13f,4993
```

#### `nft-transfers.csv`
Expected transfer counts for validation:
```csv
contract,num_transfers
0x2b21d07c98905f48a71100af2b58c069be4d0a2a,13239
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--collections` | Path to collections CSV file | `collections.csv` |
| `--mode` | `initial` or `incremental` | `incremental` |
| `--sinceHours` | Hours to look back (incremental mode) | `24` |
| `--limit` | Page size (max 1000) | `1000` |
| `--sort` | Sort order: `asc` or `desc` | `desc` |
| `--sleepMs` | Sleep between pages (ms) | `0` |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `X_CLIENT_ID` | thirdweb client ID | ✅ |
| `BASE_URL` | API base URL | ❌ (defaults to insight API) |
| `SLEEP_MS` | Default sleep between requests | ❌ |

## 📈 Output and Analysis

### Individual Results
For each contract and endpoint, you'll see:
```
============================================================
Contract: 0x2b21d07c98905f48a71100af2b58c069be4d0a2a  Chain: 2741
Endpoint: /nfts/owners/{address}
Description: ERC721 collection owners with balances
Total items: 1930  Pages: 2  Total time: 245.32 ms
✅ VALIDATION PASSED: Expected 1930, got 1930
  Page 1: items=1000 time=123.45 ms  url=https://...
  Page 2: items=930 time=121.87 ms  url=https://...
```

### Summary Report
```
🔬 BENCHMARK SUMMARY
==================================================
Total API calls: 48
Total time: 12543.21 ms (12.54s)
Average time per call: 261.32 ms

🐌 Slowest query: 1205.67 ms
   Contract: 0x2b21d07c98905f48a71100af2b58c069be4d0a2a
   Endpoint: /nfts/transfers

🔍 VALIDATION SUMMARY:
   Total validations: 24
   ✅ Passed: 22
   ❌ Failed: 2
   ⚪ Skipped: 0

📊 Endpoint Statistics:
  /nfts/owners/{address}:
    Contracts tested: 8
    Total pages: 12
    Total items: 15,487
    Avg time per contract: 234.56 ms
```

## 🔧 Technical Details

### API Endpoint Testing

#### ERC721 Contracts
- **Owners**: Retrieves all unique owners with token balances
- **Transfers**: Gets all transfer events (sales, mints, transfers)

#### ERC20 Contracts  
- **Owners**: Retrieves all token holders with balances

### Transfer Modes

#### Initial Mode (`--mode initial`)
- Scans from block 1 (full historical data)
- Used for complete data validation
- Validates against expected total counts

#### Incremental Mode (`--mode incremental`)
- Scans recent activity (last N hours)
- Simulates daily/regular monitoring
- Faster execution for recent data

### Data Validation

The tool validates API responses against expected counts:
- ✅ **Pass**: Actual count matches expected
- ❌ **Fail**: Discrepancy found (shows difference)
- ⚪ **Skip**: No expected data available

### Pagination Handling

- **0-based pagination**: All endpoints use 0-based page indexing
- **Smart pagination**: Uses API metadata when available
- **Fallback logic**: Falls back to page size detection
- **Error handling**: Graceful handling of partial pages

## 🛠️ Development

### Dependencies

- **tsx**: Fast TypeScript execution
- **@types/node**: Node.js type definitions
- **eslint**: Code linting
- **typescript**: TypeScript compiler

### Scripts

```bash
npm run benchmark          # Run benchmarks
npm run benchmark:fast     # Quick test run
npm run build             # Type check
npm run lint              # Lint code
```

## 📝 Use Cases

### Performance Testing
- Monitor API response times across different chains
- Identify performance bottlenecks
- Track performance over time

### Data Validation
- Verify API accuracy against known datasets
- Detect data inconsistencies
- Validate new chain integrations

### Load Testing
- Test API behavior with large datasets
- Validate pagination performance
- Monitor rate limiting behavior

### Integration Testing
- Verify API contract compliance
- Test different response structures
- Validate error handling

## 🚨 Troubleshooting

### Common Issues

**Empty Results (0 items)**
- Check `X_CLIENT_ID` is valid
- Verify contract addresses exist on specified chains
- Ensure chain IDs are supported

**Validation Failures**
- Check expected data CSV files are up to date
- Verify contract addresses match exactly (case-sensitive)
- Consider data timing differences

**Rate Limiting**
- Add `--sleepMs 100` to add delays between requests
- Reduce `--limit` to smaller page sizes
- Set `SLEEP_MS` environment variable

### Debug Mode

The script automatically shows debug information for unexpected responses:
```
🔍 DEBUG: Response structure for https://...
Response keys: data, error
❌ API Error: {"code": 400, "message": "Invalid chain_id"}
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

For questions or issues, please open a GitHub issue or contact the development team.
