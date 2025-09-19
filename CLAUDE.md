# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript benchmarking tool for testing thirdweb's Insight API endpoints. The tool measures API performance, validates data accuracy, and provides detailed analytics for NFT (ERC721) and token (ERC20) contracts across different blockchain networks.

## Core Architecture

- **Single-file application**: `benchmark.ts` contains all logic for API testing, data validation, and reporting
- **CSV-driven configuration**: Contract addresses and expected results are stored in CSV files
- **Environment-based authentication**: Uses thirdweb client ID from `.env` file
- **TypeScript interfaces**: Well-defined types for collections, benchmark results, and validation

## Key Commands

```bash
# Development and validation
npm run build          # TypeScript type checking (tsc --noEmit)
npm run lint           # ESLint code linting

# Running benchmarks
npm run benchmark      # Default: incremental mode, 24h lookback
npm run benchmark:fast # Quick test with 100 items, no sleep
npm run benchmark:initial    # Full historical scan from block 1
npm run benchmark:incremental # Incremental mode with 24h default

# Custom execution with parameters
npx tsx benchmark.ts --mode incremental --sinceHours 48 --limit 500 --sort asc
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Set `X_CLIENT_ID` with your thirdweb client ID
3. Optionally configure `BASE_URL` and `SLEEP_MS`

## Data Files Structure

- **collections.csv**: Contract addresses to test (chain_id, contract_address, erc_standard)
- **token-owner-data.csv**: Expected owner counts for ERC20 validation (contract, number_of_owners)
- **nft-transfers.csv**: Expected transfer counts for ERC721 validation (contract, num_transfers)

## API Endpoints Tested

1. **NFT Owners**: `/v1/nfts/owners/{address}` - Gets all owners of ERC721 contracts
2. **Token Owners**: `/v1/tokens/owners` - Gets all holders of ERC20 contracts
3. **NFT Transfers**: `/v1/nfts/transfers` - Gets all transfer events for ERC721 contracts

## Command Line Options

- `--collections`: Path to collections CSV file (default: collections.csv)
- `--mode`: `initial` or `incremental` (default: incremental)
- `--sinceHours`: Hours to look back for incremental mode (default: 24)
- `--limit`: Page size, max 1000 (default: 1000)
- `--sort`: Sort order `asc` or `desc` (default: desc)
- `--sleepMs`: Sleep between pages in milliseconds (default: 0)

## Key TypeScript Interfaces

- `CollectionRow`: Represents contract data from CSV (chainId, address, type)
- `BenchmarkResult`: Complete benchmark results with timings and validation
- `BenchmarkPageTiming`: Individual page performance metrics
- `ValidationResult`: Data accuracy validation results

## Testing Approach

The tool runs in two modes:
- **Initial mode**: Full historical scan from block 1 for complete validation
- **Incremental mode**: Recent activity scan (last N hours) for monitoring

Each test validates API responses against expected counts from CSV files and reports performance metrics including response times, pagination efficiency, and data accuracy.