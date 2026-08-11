// Baseline measurements for the search path, so the SQLite port can be
// judged against numbers rather than intuition.
//
// Run against the real cached data an installed build has already written
// (restaurant_data.json + search_index.json), not fixtures -- the costs
// being measured here are dominated by real payload size and real match
// counts, both of which fixtures get wrong.
//
//   npm run measure:search
//   npm run measure:search -- /path/to/Documents
//
// rank.ts and its dependencies use extensionless relative imports, which
// Node's ESM resolver rejects, so the npm script runs this under the same
// resolve-ts-hooks loader test:ask-rumbly already uses. That keeps the
// benchmark pointed at the real modules instead of a transcription of them.
//
// IMPORTANT -- what these numbers are and are not:
// This runs on Node/V8. The app runs on Hermes, which is materially slower
// at exactly the two things the current path leans on hardest: JSON.parse
// of a large payload, and megamorphic property access across a big object
// array. So every JS-side figure here is optimistic relative to the device,
// and the measured cost of the JSON path in particular should be read as a
// floor, not an estimate. Use these to compare implementations against each
// other on identical input, not to predict device milliseconds.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { search } from '../src/search/rank.ts';
import { normalizeForSearch } from '../src/data/diacritics.ts';
import { itemVisibleInSearch } from '../src/search/filters.ts';
import type { Restaurant, SearchIndexEntry } from '../src/data/types.ts';

// Mirrors searchIndexLoader.ts's prepareSearchIndex(). Duplicated rather
// than imported because that module reaches fileStore.ts -> expo-file-system,
// which will not load outside the app runtime. Keep the two in step; the
// keep-first semantics are the part that matters.
function prepareSearchIndex(data: SearchIndexEntry[]): SearchIndexEntry[] {
  const seen = new Set<string>();
  return data.filter((item) => {
    const key = `${item.restaurant_id}:${item.item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Chosen to cover the distinct cost regimes in rank.ts's search(), not to
// look fast. The regime that actually decides cost is whether the fuzzy
// fallback opens, so these deliberately straddle it -- see the `strict`
// column, which is the number the gate reads.
const QUERIES = [
  { query: 'churro bites', note: 'exact item name' },
  { query: 'pork', note: 'prefix' },
  { query: 'chicken', note: 'broad substring' },
  { query: 'ch', note: '2-char minimum' },
  { query: 'chickn', note: 'typo, fills the cap' },
  { query: 'citricos', note: 'restaurant name' },
  { query: 'zzzznotathing', note: 'no match at all' },
];

// Replicates ONLY rank.ts's strict pass -- the count its fuzzy gate reads
// (`results.length < FUZZY_TRIGGER_RESULT_COUNT`). Reported because it, not
// the final result count, is what explains the timings: a query whose strict
// pass comes up short triggers a second full-index scan running tokenization
// and edit distance per entry. Diagnostic only; if it drifts from rank.ts the
// timings stay correct and merely lose their explanation.
function strictPassCount(
  query: string,
  restaurants: Restaurant[],
  index: SearchIndexEntry[]
): number {
  const q = normalizeForSearch(query).trim();
  const byId = new Map(restaurants.map((r) => [r.restaurant_id, r]));
  let count = 0;
  for (const r of restaurants) {
    const norm = normalizeForSearch(r.restaurant);
    const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
    if (norm === q || norm.startsWith(q) || tokens.some((t) => t.startsWith(q)) || norm.includes(q)) {
      count++;
    }
  }
  const seen = new Set<string>();
  for (const item of index) {
    if (!itemVisibleInSearch(item, new Set(), false)) continue;
    if (!byId.has(item.restaurant_id)) continue;
    const key = `${item.restaurant_id}:${item.item_id}`;
    if (seen.has(key)) continue;
    const norm = item._norm;
    if (norm === q || norm.startsWith(q) || norm.includes(q)) {
      seen.add(key);
      count++;
    }
  }
  return count;
}

const FUZZY_TRIGGER_RESULT_COUNT = 25;

const WARMUP = 3;
const RUNS = 10;

function findDataDir(explicit?: string): string {
  if (explicit) {
    if (!existsSync(join(explicit, 'search_index.json'))) {
      throw new Error(`No search_index.json in ${explicit}`);
    }
    return explicit;
  }
  // Fall back to scanning the simulator containers for the most recently
  // written copy -- whichever build the owner ran last is the interesting one.
  const root = join(homedir(), 'Library/Developer/CoreSimulator/Devices');
  if (!existsSync(root)) throw new Error('No simulator devices found; pass a data directory.');
  const found: { dir: string; mtime: number }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes('search_index.json')) {
      found.push({ dir, mtime: statSync(join(dir, 'search_index.json')).mtimeMs });
      return;
    }
    for (const entry of entries) {
      const next = join(dir, entry);
      try {
        if (statSync(next).isDirectory()) walk(next, depth + 1);
      } catch {
        // Unreadable container -- skip.
      }
    }
  };
  walk(root, 0);
  if (found.length === 0) throw new Error('No cached search_index.json found; run the app once.');
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0].dir;
}

function ms(fn: () => unknown): number {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function heapUsed(): number {
  globalThis.gc?.();
  return process.memoryUsage().heapUsed;
}

const dataDir = findDataDir(process.argv[2]);
const indexPath = join(dataDir, 'search_index.json');
const restaurantPath = join(dataDir, 'restaurant_data.json');

console.log(`data: ${dataDir}\n`);

const rawIndex = readFileSync(indexPath, 'utf8');
const restaurants: Restaurant[] = JSON.parse(readFileSync(restaurantPath, 'utf8'));

// --- Index load: the cost SQLite deletes outright -------------------------
// Measured as the app performs it: parse the whole file, then dedupe. The
// second variant is the same content after importPipeline.ts's import-time
// dedupe, i.e. what a device holds once it has reimported on schema v9.
const parsedOnce: SearchIndexEntry[] = JSON.parse(rawIndex);
const dedupedIndex = prepareSearchIndex(parsedOnce);
const rawDeduped = JSON.stringify(dedupedIndex);

console.log('INDEX LOAD  (blocks the JS thread; nothing else runs during it)');
console.log('-'.repeat(74));

for (const [label, payload] of [
  ['pre-dedupe file  (schema v8)', rawIndex],
  ['post-dedupe file (schema v9)', rawDeduped],
] as const) {
  const parseTimes: number[] = [];
  const dedupeTimes: number[] = [];
  for (let i = 0; i < WARMUP + RUNS; i++) {
    let parsed: SearchIndexEntry[] = [];
    const parseMs = ms(() => {
      parsed = JSON.parse(payload);
    });
    const dedupeMs = ms(() => prepareSearchIndex(parsed));
    if (i >= WARMUP) {
      parseTimes.push(parseMs);
      dedupeTimes.push(dedupeMs);
    }
  }
  const entries = (JSON.parse(payload) as SearchIndexEntry[]).length;
  console.log(
    `  ${label}  ${mb(payload.length).padStart(8)}  ${entries.toLocaleString().padStart(7)} entries`
  );
  console.log(
    `    JSON.parse ${median(parseTimes).toFixed(1).padStart(6)} ms` +
      `   + dedupe ${median(dedupeTimes).toFixed(1).padStart(5)} ms` +
      `   = ${(median(parseTimes) + median(dedupeTimes)).toFixed(1).padStart(6)} ms`
  );
}

// --- Retained memory ------------------------------------------------------
const before = heapUsed();
const retained = prepareSearchIndex(JSON.parse(rawIndex));
const after = heapUsed();
console.log(
  `\n  retained heap for the live index: ~${mb(after - before)} ` +
    `(${retained.length.toLocaleString()} objects x ${Object.keys(retained[0]).length} fields)`
);

// --- Per-query search cost ------------------------------------------------
console.log(`\nSEARCH  (median of ${RUNS} runs, after ${WARMUP} warmup)`);
console.log('-'.repeat(74));
console.log(
  `  ${'query'.padEnd(15)} ${'note'.padEnd(22)} ${'strict'.padStart(7)} ${'final'.padStart(6)}` +
    ` ${'median'.padStart(9)}  fuzzy gate`
);

const dietary = new Set<string>();
for (const { query, note } of QUERIES) {
  const times: number[] = [];
  let count = 0;
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const elapsed = ms(() => {
      count = search(query, restaurants, dedupedIndex, dietary, false).length;
    });
    if (i >= WARMUP) times.push(elapsed);
  }
  const strict = strictPassCount(query, restaurants, dedupedIndex);
  const gate = strict < FUZZY_TRIGGER_RESULT_COUNT ? 'OPENS -> full rescan' : 'closed';
  console.log(
    `  ${query.padEnd(15)} ${note.padEnd(22)} ${String(strict).padStart(7)} ${String(count).padStart(6)}` +
      ` ${median(times).toFixed(1).padStart(7)} ms  ${gate}`
  );
}

console.log(
  `\n  restaurants: ${restaurants.length.toLocaleString()}` +
    `   index entries scanned per query: ${dedupedIndex.length.toLocaleString()}`
);
