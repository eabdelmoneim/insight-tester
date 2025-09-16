
/*
Minimal benchmarking script for Insight API endpoints.
- Reads X_CLIENT_ID and BASE_URL from .env (fallback to process.env)
- Parses collections.csv for contracts and types
- Benchmarks:
  - ERC721 owners: GET /v1/nfts/owners/{collectionAddress}
  - ERC20 owners:  GET /v1/tokens/owners
  - ERC721 transfers: GET /v1/nfts/transfers

Run with ts-node or tsx, e.g.:
  npx tsx benchmark.ts --collections collections.csv --mode incremental --sinceHours 24 --limit 1000 --sort desc
*/

/* eslint-disable no-console */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { performance } from 'perf_hooks';

// Types
interface CollectionRow {
	chainId: number;
	address: string;
	type: 'erc721' | 'erc20';
	name?: string;
}

interface BenchmarkPageTiming {
	page: number;
	items: number;
	ms: number;
	url: string;
}

interface BenchmarkResult {
	contract: string;
	chainId: number;
	endpoint: string;
	description: string;
	totalItems: number;
	pages: number;
	totalMs: number;
	perPage: BenchmarkPageTiming[];
	meta?: Record<string, unknown>;
	validation?: ValidationResult;
}

interface SummaryMetrics {
	totalQueries: number;
	totalTime: number;
	averageTimePerQuery: number;
	longestQuery: {
		contract: string;
		endpoint: string;
		ms: number;
		url: string;
	};
	endpointStats: Record<string, {
		count: number;
		totalTime: number;
		averageTime: number;
		items: number;
		pages: number;
	}>;
}

interface ExpectedData {
	tokenOwners: Record<string, number>; // contract -> expected owner count
	nftTransfers: Record<string, number>; // contract -> expected transfer count
}

interface ValidationResult {
	expected: number;
	actual: number;
	isValid: boolean;
	difference: number;
}

// Simple .env loader (no dependency on dotenv)
function loadDotEnv(dotenvPath: string): void {
	if (!existsSync(dotenvPath)) return;
	const content = readFileSync(dotenvPath, 'utf8');
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

// Querystring helper
function toQuery(params: Record<string, unknown>): string {
	const usp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null) continue;
		usp.append(k, String(v));
	}
	return usp.toString();
}

// Fetch wrapper with headers and error handling
async function httpGet(
	baseUrl: string,
	path: string,
	params: Record<string, unknown>,
	headers: Record<string, string>,
): Promise<{ json: any; url: string }> {
	const qs = toQuery(params);
	const url = `${baseUrl.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`;
	const res = await fetch(url, { headers });
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${body}`);
	}
	const json = await res.json();
	return { json, url };
}

// Sleep utility
function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

// Debug helper
function debugApiResponse(json: any, url: string): void {
	console.log(`  🔍 DEBUG: Response structure for ${url}`);
	console.log(`  Response keys: ${Object.keys(json || {}).join(', ')}`);
	if (json?.result) {
		console.log(`  Result keys: ${Object.keys(json.result).join(', ')}`);
		console.log(`  Result type: ${typeof json.result}, isArray: ${Array.isArray(json.result)}`);
		if (json.result.owners) console.log(`  Owners count: ${json.result.owners?.length || 'N/A'}`);
		if (json.result.transfers) console.log(`  Transfers count: ${json.result.transfers?.length || 'N/A'}`);
	}
	if (json?.error) {
		console.log(`  ❌ API Error: ${JSON.stringify(json.error)}`);
	}
	if (json?.message) {
		console.log(`  📄 Message: ${json.message}`);
	}
}

// CSV parser for a simple, header-based CSV (no quoted commas handling)
function parseCsvSimple(csv: string): Record<string, string>[] {
	const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
	if (lines.length === 0) return [];
	const header = lines[0].split(',').map((h) => h.trim());
	const rows: Record<string, string>[] = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split(',');
		const row: Record<string, string> = {};
		header.forEach((h, idx) => {
			row[h] = (cols[idx] ?? '').trim();
		});
		rows.push(row);
	}
	return rows;
}

function normalizeCollectionRow(row: Record<string, string>, index: number): CollectionRow | null {
	// Accept flexible headers
	const chainIdStr = row.chain_id ?? row.chainId ?? row.chainID ?? row['Chain ID'] ?? row['CHAIN_ID'];
	const address = (row.contract_address ?? row.address ?? row.contractAddress ?? row['Address'] ?? '').trim();
	const typeRaw = (row.erc_standard ?? row.contract_type ?? row.type ?? row['Contract Type'] ?? '').trim().toLowerCase();
	const name = row.name ?? row.collection_name ?? row['Collection Name'];

	const chainId = Number(chainIdStr);
	if (!Number.isFinite(chainId) || !address) {
		console.warn(`Skipping invalid CSV row #${index + 2}: missing chain_id or address`);
		return null;
	}

	let type: CollectionRow['type'];
	if (typeRaw.includes('721')) type = 'erc721';
	else if (typeRaw.includes('20')) type = 'erc20';
	else {
		console.warn(`Skipping row for ${address} (unknown type: ${typeRaw})`);
		return null;
	}

	return { chainId, address, type, name };
}

function loadExpectedData(): ExpectedData {
	const tokenOwners: Record<string, number> = {};
	const nftTransfers: Record<string, number> = {};

	// Load token owner data
	const tokenOwnerPath = resolve(process.cwd(), 'token-owner-data.csv');
	if (existsSync(tokenOwnerPath)) {
		const csvRaw = readFileSync(tokenOwnerPath, 'utf8');
		const rows = parseCsvSimple(csvRaw);
		for (const row of rows) {
			const contract = (row.contract ?? '').trim().toLowerCase();
			const owners = Number(row.number_of_owners ?? '0');
			if (contract && Number.isFinite(owners)) {
				tokenOwners[contract] = owners;
			}
		}
		console.log(`Loaded ${Object.keys(tokenOwners).length} expected token owner counts`);
	}

	// Load NFT transfer data
	const nftTransferPath = resolve(process.cwd(), 'nft-transfers.csv');
	if (existsSync(nftTransferPath)) {
		const csvRaw = readFileSync(nftTransferPath, 'utf8');
		const rows = parseCsvSimple(csvRaw);
		for (const row of rows) {
			const contract = (row.contract ?? '').trim().toLowerCase();
			const transfers = Number(row.num_transfers ?? '0');
			if (contract && Number.isFinite(transfers)) {
				nftTransfers[contract] = transfers;
			}
		}
		console.log(`Loaded ${Object.keys(nftTransfers).length} expected NFT transfer counts`);
	}

	return { tokenOwners, nftTransfers };
}

function validateCount(expected: number, actual: number): ValidationResult {
	const difference = actual - expected;
	const isValid = actual === expected;
	return { expected, actual, isValid, difference };
}

async function benchmarkErc721Owners(
	baseUrl: string,
	headers: Record<string, string>,
	chainId: number,
	collectionAddress: string,
	limit: number,
	sleepMsBetweenPages: number,
	expectedData: ExpectedData,
): Promise<BenchmarkResult> {
	let page = 0;
	let totalItems = 0;
	let pages = 0;
	const perPage: BenchmarkPageTiming[] = [];
	const started = performance.now();
	for (;;) {
		const t0 = performance.now();
		const { json, url } = await httpGet(baseUrl, `/nfts/owners/${collectionAddress}`, {
			chain_id: chainId,
			limit,
			page,
			include_balances: true,
		}, headers);
		const t1 = performance.now();
		
		// Count owners based on API response structure
		// NFT owners endpoint returns object with data array (same as token owners)
		let items = 0;
		if (json?.data && Array.isArray(json.data)) {
			items = json.data.length;
		} else {
			// Debug unexpected response structure
			debugApiResponse(json, url);
		}
		
		perPage.push({ page: page + 1, items, ms: t1 - t0, url }); // Display as 1-based for user
		totalItems += items;
		pages += 1;
		// Check for next page based on endpoint response structure
		let hasNext = false;
		if (json?.data?.meta) {
			// NFT transfers with meta pagination info
			const meta = json.data.meta;
			hasNext = meta.page < (meta.total_pages - 1); // 0-based pagination
		} else if (json?.data && Array.isArray(json.data)) {
			// Simple data array (owners endpoints) - continue if we got a full page
			hasNext = items === limit;
		} else {
			// Fallback - continue if we got a full page
			hasNext = items === limit;
		}
		if (!hasNext || items === 0) break;
		page += 1;
		if (sleepMsBetweenPages > 0) await sleep(sleepMsBetweenPages);
	}
	const ended = performance.now();
	
	// Validate against expected data
	const contractKey = collectionAddress.toLowerCase();
	const expectedCount = expectedData.tokenOwners[contractKey];
	let validation: ValidationResult | undefined;
	if (expectedCount !== undefined) {
		validation = validateCount(expectedCount, totalItems);
	}
	
	return {
		contract: collectionAddress,
		chainId,
		endpoint: '/nfts/owners/{address}',
		description: 'ERC721 collection owners with balances',
		totalItems,
		pages,
		totalMs: ended - started,
		perPage,
		validation,
	};
}

async function benchmarkErc20Owners(
	baseUrl: string,
	headers: Record<string, string>,
	chainId: number,
	contractAddress: string,
	limit: number,
	sleepMsBetweenPages: number,
	expectedData: ExpectedData,
): Promise<BenchmarkResult> {
	let page = 0;
	let totalItems = 0;
	let pages = 0;
	const perPage: BenchmarkPageTiming[] = [];
	const started = performance.now();
	for (;;) {
		const t0 = performance.now();
		const { json, url } = await httpGet(baseUrl, '/tokens/owners', {
			chain_id: chainId,
			contract_address: contractAddress,
			limit,
			page,
		}, headers);
		const t1 = performance.now();
		
		// Count owners based on API response structure from OpenAPI spec
		// Token owners endpoint returns object with data array
		let items = 0;
		if (json?.data && Array.isArray(json.data)) {
			items = json.data.length;
		} else {
			// Debug unexpected response structure
			debugApiResponse(json, url);
		}
		
		perPage.push({ page: page + 1, items, ms: t1 - t0, url }); // Display as 1-based for user
		totalItems += items;
		pages += 1;
		// Check for next page based on endpoint response structure
		let hasNext = false;
		if (json?.data?.meta) {
			// NFT transfers with meta pagination info
			const meta = json.data.meta;
			hasNext = meta.page < (meta.total_pages - 1); // 0-based pagination
		} else if (json?.data && Array.isArray(json.data)) {
			// Simple data array (owners endpoints) - continue if we got a full page
			hasNext = items === limit;
		} else {
			// Fallback - continue if we got a full page
			hasNext = items === limit;
		}
		if (!hasNext || items === 0) break;
		page += 1;
		if (sleepMsBetweenPages > 0) await sleep(sleepMsBetweenPages);
	}
	const ended = performance.now();
	
	// Validate against expected data
	const contractKey = contractAddress.toLowerCase();
	const expectedCount = expectedData.tokenOwners[contractKey];
	let validation: ValidationResult | undefined;
	if (expectedCount !== undefined) {
		validation = validateCount(expectedCount, totalItems);
	}
	
	return {
		contract: contractAddress,
		chainId,
		endpoint: '/tokens/owners',
		description: 'ERC20 token holders',
		totalItems,
		pages,
		totalMs: ended - started,
		perPage,
		validation,
	};
}

type TransferMode = 'initial' | 'incremental';

async function benchmarkErc721Transfers(
	baseUrl: string,
	headers: Record<string, string>,
	chainId: number,
	contractAddress: string,
	limit: number,
	sleepMsBetweenPages: number,
	sortOrder: 'asc' | 'desc',
	mode: TransferMode,
	sinceHours: number,
	expectedData: ExpectedData,
): Promise<BenchmarkResult> {
	let page = 0;
	let totalItems = 0;
	let pages = 0;
	const perPage: BenchmarkPageTiming[] = [];
	const started = performance.now();

	// Calculate filters
	const baseParams: Record<string, unknown> = {
		chain_id: chainId,
		contract_address: contractAddress,
		limit,
		sort_order: sortOrder,
	};
	if (mode === 'initial') {
		baseParams.block_number_from = 1;
	} else {
		const fromTs = Math.floor(Date.now() / 1000) - Math.max(1, Math.floor(sinceHours * 3600));
		baseParams.block_timestamp_from = fromTs;
	}

	for (;;) {
		const params = { ...baseParams, page };
		const t0 = performance.now();
		const { json, url } = await httpGet(baseUrl, '/nfts/transfers', params, headers);
		const t1 = performance.now();
		
		// Count transfers based on API response structure
		// NFT transfers endpoint returns nested data: { data: { data: [...], meta: {...} } }
		let items = 0;
		if (json?.data?.data && Array.isArray(json.data.data)) {
			items = json.data.data.length;
		} else {
			// Debug unexpected response structure
			debugApiResponse(json, url);
		}
		
		perPage.push({ page: page + 1, items, ms: t1 - t0, url }); // Display as 1-based for user
		totalItems += items;
		pages += 1;
		// Check for next page based on endpoint response structure
		let hasNext = false;
		if (json?.data?.meta) {
			// NFT transfers with meta pagination info
			const meta = json.data.meta;
			hasNext = meta.page < (meta.total_pages - 1); // 0-based pagination
		} else if (json?.data && Array.isArray(json.data)) {
			// Simple data array (owners endpoints) - continue if we got a full page
			hasNext = items === limit;
		} else {
			// Fallback - continue if we got a full page
			hasNext = items === limit;
		}
		if (!hasNext || items === 0) break;
		page += 1;
		if (sleepMsBetweenPages > 0) await sleep(sleepMsBetweenPages);
	}
	const ended = performance.now();
	
	// For transfers, only validate if mode is 'initial' since incremental will be partial
	const contractKey = contractAddress.toLowerCase();
	let validation: ValidationResult | undefined;
	if (mode === 'initial') {
		const expectedCount = expectedData.nftTransfers[contractKey];
		if (expectedCount !== undefined) {
			validation = validateCount(expectedCount, totalItems);
		}
	}
	
	return {
		contract: contractAddress,
		chainId,
		endpoint: '/nfts/transfers',
		description: `ERC721 all transfers (${mode})`,
		totalItems,
		pages,
		totalMs: ended - started,
		perPage,
		meta: { sortOrder, mode, sinceHours },
		validation,
	};
}

function printResult(result: BenchmarkResult): void {
	console.log('\n============================================================');
	console.log(`Contract: ${result.contract}  Chain: ${result.chainId}`);
	console.log(`Endpoint: ${result.endpoint}`);
	console.log(`Description: ${result.description}`);
	console.log(`Total items: ${result.totalItems}  Pages: ${result.pages}  Total time: ${result.totalMs.toFixed(2)} ms`);
	
	// Show validation results
	if (result.validation) {
		const v = result.validation;
		if (v.isValid) {
			console.log(`✅ VALIDATION PASSED: Expected ${v.expected}, got ${v.actual}`);
		} else {
			console.log(`❌ VALIDATION FAILED: Expected ${v.expected}, got ${v.actual} (difference: ${v.difference > 0 ? '+' : ''}${v.difference})`);
		}
	} else {
		console.log(`⚪ VALIDATION SKIPPED: No expected data available`);
	}
	
	if (result.meta) console.log(`Meta: ${JSON.stringify(result.meta)}`);
	for (const p of result.perPage) {
		console.log(`  Page ${p.page}: items=${p.items} time=${p.ms.toFixed(2)} ms  url=${p.url}`);
	}
}

function calculateSummaryMetrics(results: BenchmarkResult[]): SummaryMetrics {
	let totalQueries = 0;
	let totalTime = 0;
	let longestQuery = { contract: '', endpoint: '', ms: 0, url: '' };
	const endpointStats: Record<string, { count: number; totalTime: number; averageTime: number; items: number; pages: number }> = {};

	for (const result of results) {
		// Track endpoint stats
		if (!endpointStats[result.endpoint]) {
			endpointStats[result.endpoint] = { count: 0, totalTime: 0, averageTime: 0, items: 0, pages: 0 };
		}
		const stat = endpointStats[result.endpoint];
		stat.count += 1;
		stat.totalTime += result.totalMs;
		stat.items += result.totalItems;
		stat.pages += result.pages;

		// Track individual page queries
		for (const page of result.perPage) {
			totalQueries += 1;
			totalTime += page.ms;
			
			// Check for longest query
			if (page.ms > longestQuery.ms) {
				longestQuery = {
					contract: result.contract,
					endpoint: result.endpoint,
					ms: page.ms,
					url: page.url
				};
			}
		}
	}

	// Calculate averages for endpoints
	for (const stat of Object.values(endpointStats)) {
		stat.averageTime = stat.totalTime / stat.count;
	}

	return {
		totalQueries,
		totalTime,
		averageTimePerQuery: totalQueries > 0 ? totalTime / totalQueries : 0,
		longestQuery,
		endpointStats
	};
}

function printSummaryMetrics(metrics: SummaryMetrics, allResults: BenchmarkResult[]): void {
	console.log('\n\n🔬 BENCHMARK SUMMARY');
	console.log('==================================================');
	console.log(`Total API calls: ${metrics.totalQueries}`);
	console.log(`Total time: ${metrics.totalTime.toFixed(2)} ms (${(metrics.totalTime / 1000).toFixed(2)}s)`);
	console.log(`Average time per call: ${metrics.averageTimePerQuery.toFixed(2)} ms`);
	
	console.log(`\n🐌 Slowest query: ${metrics.longestQuery.ms.toFixed(2)} ms`);
	console.log(`   Contract: ${metrics.longestQuery.contract}`);
	console.log(`   Endpoint: ${metrics.longestQuery.endpoint}`);
	console.log(`   URL: ${metrics.longestQuery.url}`);

	// Validation Summary
	const validationResults = allResults.filter(r => r.validation);
	const passedValidations = validationResults.filter(r => r.validation?.isValid);
	const failedValidations = validationResults.filter(r => !r.validation?.isValid);
	
	console.log('\n🔍 VALIDATION SUMMARY:');
	console.log(`   Total validations: ${validationResults.length}`);
	console.log(`   ✅ Passed: ${passedValidations.length}`);
	console.log(`   ❌ Failed: ${failedValidations.length}`);
	console.log(`   ⚪ Skipped: ${allResults.length - validationResults.length}`);
	
	if (failedValidations.length > 0) {
		console.log('\n❌ VALIDATION FAILURES:');
		for (const result of failedValidations) {
			const v = result.validation!;
			console.log(`   ${result.contract} (${result.endpoint}): Expected ${v.expected}, got ${v.actual} (${v.difference > 0 ? '+' : ''}${v.difference})`);
		}
	}

	console.log('\n📊 Endpoint Statistics:');
	for (const [endpoint, stats] of Object.entries(metrics.endpointStats)) {
		console.log(`\n  ${endpoint}:`);
		console.log(`    Contracts tested: ${stats.count}`);
		console.log(`    Total pages: ${stats.pages}`);
		console.log(`    Total items: ${stats.items.toLocaleString()}`);
		console.log(`    Avg time per contract: ${stats.averageTime.toFixed(2)} ms`);
		console.log(`    Total time: ${stats.totalTime.toFixed(2)} ms`);
	}
}

function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const [k, v] = a.slice(2).split('=');
			if (v !== undefined) args[k] = v;
			else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
				args[k] = argv[i + 1];
				i++;
			} else {
				args[k] = 'true';
			}
		}
	}
	return args;
}

async function main(): Promise<void> {
	// Load .env
	const dotenvPath = resolve(process.cwd(), '.env');
	loadDotEnv(dotenvPath);

	const args = parseArgs(process.argv);
	const collectionsPath = resolve(process.cwd(), args.collections ?? 'collections.csv');
	const limit = Math.max(1, Math.min(1000, Number(args.limit ?? '1000')));
	const mode: TransferMode = (args.mode === 'initial' ? 'initial' : 'incremental');
	const sinceHours = Number(args.sinceHours ?? '24');
	const sortOrder: 'asc' | 'desc' = (args.sort === 'asc' ? 'asc' : 'desc');
	const sleepMsBetweenPages = Number(args.sleepMs ?? (process.env.SLEEP_MS ?? '0'));

	const baseUrl = (process.env.BASE_URL ?? '').trim() || 'https://insight.thirdweb.com/v1';
	const clientId = (process.env.X_CLIENT_ID ?? process.env.X_CLIENT_ID_HEADER ?? '').trim();
	if (!clientId) {
		console.error('Missing X_CLIENT_ID in environment (.env).');
		process.exit(1);
	}
	const headers = { 'x-client-id': clientId };

	// Read collections
	if (!existsSync(collectionsPath)) {
		console.error(`collections.csv not found at ${collectionsPath}`);
		process.exit(1);
	}
	const csvRaw = readFileSync(collectionsPath, 'utf8');
	const rows = parseCsvSimple(csvRaw)
		.map((r, idx) => normalizeCollectionRow(r, idx))
		.filter((x): x is CollectionRow => Boolean(x));

	if (rows.length === 0) {
		console.error('No valid rows found in collections.csv');
		process.exit(1);
	}

	console.log(`Loaded ${rows.length} collections from ${collectionsPath}`);
	console.log(`Base URL: ${baseUrl}`);
	console.log(`Mode: ${mode}  sinceHours: ${sinceHours}  limit: ${limit}  sort: ${sortOrder}  sleepMs: ${sleepMsBetweenPages}`);

	// Load expected data for validation
	const expectedData = loadExpectedData();

	const allResults: BenchmarkResult[] = [];

	for (const c of rows) {
		console.log(`\n---- Processing ${c.type.toUpperCase()} ${c.address} on chain ${c.chainId}${c.name ? ` (${c.name})` : ''} ----`);
		try {
			if (c.type === 'erc721') {
				const owners = await benchmarkErc721Owners(baseUrl, headers, c.chainId, c.address, limit, sleepMsBetweenPages, expectedData);
				printResult(owners);
				allResults.push(owners);

				const transfers = await benchmarkErc721Transfers(
					baseUrl,
					headers,
					c.chainId,
					c.address,
					limit,
					sleepMsBetweenPages,
					sortOrder,
					mode,
					sinceHours,
					expectedData,
				);
				printResult(transfers);
				allResults.push(transfers);
			} else if (c.type === 'erc20') {
				const owners = await benchmarkErc20Owners(baseUrl, headers, c.chainId, c.address, limit, sleepMsBetweenPages, expectedData);
				printResult(owners);
				allResults.push(owners);
			}
		} catch (err: any) {
			console.error(`Error benchmarking ${c.address} on chain ${c.chainId}:`, err?.message ?? err);
		}
	}

	// Calculate and display summary metrics
	const summaryMetrics = calculateSummaryMetrics(allResults);
	printSummaryMetrics(summaryMetrics, allResults);

	console.log('\nAll benchmarks completed.');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
