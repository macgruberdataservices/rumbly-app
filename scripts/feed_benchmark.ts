// Repeatable measurement for buildFindFeed, the largest single cost in the
// app: ~1,980 ms on device (see Docs/SEARCH_PERFORMANCE.md), against ~380 ms
// for the search index parse it was long assumed to sit behind.
//
//   npm run measure:feed
//   npm run measure:feed -- /path/to/Documents
//
// Same caveat as scripts/search_benchmark.ts: this runs on Node/V8 and the
// app runs Hermes on a phone. Device numbers have come in ~10-15x these, and
// twice now an extrapolation from here has understated the device by about
// 2x. Use this to compare engine variants against each other on identical
// input, and the in-app Performance panel for anything absolute.
//
// Two activity profiles are measured because they exercise different paths:
// an empty profile skips the taste-profile scoring, while a populated one is
// what a real user actually pays.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildFindFeed, buildFindFeedSteps } from '../src/recommendations/engine.ts';
import type { Restaurant, SearchIndexEntry } from '../src/data/types.ts';

const WARMUP = 3;
const RUNS = 10;

function findDataDir(explicit?: string): string {
  if (explicit) return explicit;
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
    if (entries.includes('search_index.json') && entries.includes('restaurant_data.json')) {
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
  if (found.length === 0) throw new Error('No cached data found; run the app once.');
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

function emptyActivity() {
  return {
    lovedRestaurants: [],
    lovedItems: [],
    neededRestaurants: [],
    neededItems: [],
    gotItHistory: [],
    totalGotItCount: 0,
    ratedGotItCount: 0,
    restaurantRatingAverages: new Map(),
    itemRatingAverages: new Map(),
  };
}

// A plausible real profile: some Loves, some Need Its, some rated Got Its.
// Built from the actual data so restaurant/item ids resolve.
function populatedActivity(index: SearchIndexEntry[], restaurants: Restaurant[]) {
  const event = (i: number, type: string, rating: number | null) => ({
    clientId: `client-${type}-${i}`,
    targetType: 'item' as const,
    restaurantId: index[i].restaurant_id,
    itemId: index[i].item_id,
    activityType: type,
    rating,
    occurredAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  });
  const step = Math.max(1, Math.floor(index.length / 40));
  const pick = (n: number, type: string, rating: number | null) =>
    Array.from({ length: n }, (_, k) => event(k * step, type, rating));
  return {
    ...emptyActivity(),
    lovedItems: pick(12, 'love_it', null),
    neededItems: pick(6, 'need_it', null),
    neededRestaurants: restaurants.slice(0, 4).map((r, i) => ({
      clientId: `client-needr-${i}`,
      targetType: 'restaurant' as const,
      restaurantId: r.restaurant_id,
      itemId: null,
      activityType: 'need_it',
      rating: null,
      occurredAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    })),
    gotItHistory: pick(10, 'got_it', 5),
    totalGotItCount: 10,
    ratedGotItCount: 10,
  };
}

const dataDir = findDataDir(process.argv[2]);
const restaurants: Restaurant[] = JSON.parse(
  readFileSync(join(dataDir, 'restaurant_data.json'), 'utf8')
);
const rawIndex: SearchIndexEntry[] = JSON.parse(
  readFileSync(join(dataDir, 'search_index.json'), 'utf8')
);
const seen = new Set<string>();
const searchIndex = rawIndex.filter((item) => {
  const key = `${item.restaurant_id}:${item.item_id}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Magic Kingdom, so the distance-filtered rails actually produce candidates
// rather than short-circuiting on an absent origin.
const ORIGIN = { latitude: 28.4177, longitude: -81.5812 };

// new_bites resolves change-log rows back to menu items, and it now indexes
// only the restaurants the change log mentions. An empty changes array makes
// that rail short-circuit entirely and report as free, which is exactly the
// kind of gap that hides a regression -- so feed it a realistic recent window
// drawn from the actual data.
const CHANGES = (() => {
  const today = new Date();
  const recent = new Date(today);
  recent.setDate(recent.getDate() - 7);
  const date = recent.toISOString().slice(0, 10);
  const seen = new Set<string>();
  const changes = [];
  for (const item of searchIndex) {
    if (seen.has(item.restaurant_id)) continue;
    seen.add(item.restaurant_id);
    changes.push({
      category: 'menu_item_added',
      restaurant_id: item.restaurant_id,
      item: item.item,
      dining_period: item.dining_period,
      menu_category: item.category,
      date,
    });
    if (changes.length >= 40) break;
  }
  return changes;
})();

console.log(`data: ${dataDir}`);
console.log(
  `${searchIndex.length.toLocaleString()} index entries, ${restaurants.length} restaurants\n`
);
console.log(`buildFindFeed (median of ${RUNS} after ${WARMUP} warmup)`);
console.log('-'.repeat(64));

const scenarios = [
  { label: 'empty activity, no location', activity: emptyActivity(), origin: null },
  { label: 'empty activity, with location', activity: emptyActivity(), origin: ORIGIN },
  {
    label: 'populated activity, no location',
    activity: populatedActivity(searchIndex, restaurants),
    origin: null,
  },
  {
    label: 'populated activity, with location',
    activity: populatedActivity(searchIndex, restaurants),
    origin: ORIGIN,
  },
] as const;

for (const { label, activity, origin } of scenarios) {
  const args = {
    restaurants,
    searchIndex,
    activity,
    events: [],
    changes: CHANGES,
    content: [],
    configs: [],
    origin,
    isEntitled: () => true,
  };
  const times: number[] = [];
  let moduleCount = 0;
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const elapsed = ms(() => {
      moduleCount = buildFindFeed(args as never).length;
    });
    if (i >= WARMUP) times.push(elapsed);
  }
  console.log(
    `  ${label.padEnd(34)} ${median(times).toFixed(1).padStart(7)} ms  (${moduleCount} modules)`
  );
}

// Per-step cost of the chunked path. This is the number that decides whether
// chunking actually helps: the longest single step is what blocks a frame, so
// a build that is fast in total but has one dominant step is still a stall.
// Rail boundaries are only the right seam if no single rail exceeds a frame.
console.log(`\nper-step cost, chunked path (median of ${RUNS})`);
console.log('-'.repeat(64));

const worstCase = {
  restaurants,
  searchIndex,
  activity: populatedActivity(searchIndex, restaurants),
  events: [],
  changes: CHANGES,
  content: [],
  configs: [],
  origin: ORIGIN,
  isEntitled: () => true,
};

// Grouped by the label the generator reports, so repeated batches of one rail
// collapse into a single row with a count rather than a wall of step indices.
const perLabel = new Map<string, number[]>();
const stepCounts = new Map<string, number>();
const labelOrder: string[] = [];
for (let run = 0; run < WARMUP + RUNS; run++) {
  const steps = buildFindFeedSteps(worstCase as never);
  const runTotals = new Map<string, number>();
  const runCounts = new Map<string, number>();
  for (;;) {
    let label = 'final';
    let done = false;
    const elapsed = ms(() => {
      const next = steps.next();
      done = next.done === true;
      if (!done) label = next.value.label;
    });
    runTotals.set(label, (runTotals.get(label) ?? 0) + elapsed);
    runCounts.set(label, (runCounts.get(label) ?? 0) + 1);
    if (run === WARMUP && !labelOrder.includes(label)) labelOrder.push(label);
    if (done) break;
  }
  if (run >= WARMUP) {
    for (const [label, value] of runTotals) {
      const existing = perLabel.get(label);
      if (existing) existing.push(value);
      else perLabel.set(label, [value]);
    }
    if (run === WARMUP) {
      for (const [label, count] of runCounts) stepCounts.set(label, count);
    }
  }
}

let total = 0;
let worst = 0;
let worstLabel = '';
for (const label of labelOrder) {
  const times = perLabel.get(label) ?? [0];
  const value = median(times);
  const count = stepCounts.get(label) ?? 1;
  // Longest single pause is what blocks a frame, so for a rail split across
  // batches report the per-batch cost, not the rail's total.
  const perStepCost = value / count;
  total += value;
  if (perStepCost > worst) {
    worst = perStepCost;
    worstLabel = label;
  }
  const suffix = count > 1 ? ` (${count} batches, ${perStepCost.toFixed(1)} ms each)` : '';
  const bar = '#'.repeat(Math.max(0, Math.round(value)));
  console.log(`  ${label.padEnd(22)} ${value.toFixed(1).padStart(6)} ms${suffix.padEnd(30)} ${bar}`);
}
console.log('-'.repeat(64));
console.log(`  ${'total'.padEnd(30)} ${total.toFixed(1).padStart(6)} ms`);
console.log(
  `  ${`longest pause (${worstLabel})`.padEnd(30)} ${worst.toFixed(1).padStart(6)} ms` +
    `   ~${(worst * 9).toFixed(0)} ms on device`
);
