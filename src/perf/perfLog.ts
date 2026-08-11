// Device-side timing for the phases that decide how the app feels on launch
// and in search.
//
// This exists because scripts/search_benchmark.ts cannot answer the question
// it looks like it answers. That harness runs on Node/V8 and desktop
// hardware; the app runs on Hermes and a phone. The two diverge most on
// exactly the large-JSON.parse path the SQLite search port is replacing, so
// the harness reports a floor rather than an estimate. These numbers are the
// real ones, and they are recorded now, while the JSON path is still live,
// because once the port lands the "before" is gone.
//
// Always-on rather than __DEV__-gated, deliberately: the only surface that
// reads it (DevelopmentSettingsScreen) is already owner-gated, and a release
// build on real hardware is the most useful place to read these -- a debug
// build's timings are not the ones users feel. The cost is two clock reads
// per measured phase and a bounded array.

export interface PerfSample {
  name: string;
  ms: number;
  detail: string | null;
  at: number;
}

export interface PerfSummary {
  name: string;
  count: number;
  median: number;
  min: number;
  max: number;
  last: number;
  lastDetail: string | null;
}

// Phase names live here rather than as string literals at the call sites so
// they stay greppable and consistent once the SQL path is measured beside
// the JSON one.
export const PERF = {
  // Disk read + JSON.parse of restaurant_data.json and hours_data.json.
  // Gates first paint -- the splash covers exactly this.
  startupCacheHydrate: 'startup.cache-hydrate',
  // First moment the app renders something interactive. See the caveat on
  // markStartupInteractive() about what this is measured from.
  startupToInteractive: 'startup.to-interactive',
  // The one the port deletes: read + JSON.parse + dedupe of
  // search_index.json. Synchronous parse, so the JS thread is dead for it.
  searchIndexLoad: 'search.index-load',
  // Dedupe only. Subtract from the above for read + parse alone.
  searchIndexPrepare: 'search.index-prepare',
  // One debounced rank.ts search(). Detail carries the query, since cost
  // depends far more on which query it is than on how many results come
  // back -- see Docs/SEARCH_PERFORMANCE.md.
  searchQuery: 'search.query',
  // Total CPU across every chunk of one feed build. Directly comparable to
  // the old single-block figure, which is the point -- it says whether the
  // work got cheaper, independent of how it is now spread out.
  feedBuild: 'feed.build',
  // One pause-to-pause interval of the chunked build, labelled with the rail
  // that ran. This is the number that decides whether the feed can still eat
  // a tap: total cost matters far less than the longest single block, so read
  // the MAX column here, not the median.
  feedChunk: 'feed.chunk',
  // THE metric for "tap in -> search results": how long after the app
  // becomes interactive before a typed query would return complete results.
  // Everything competing for the JS thread during warmup -- the index parse,
  // the feed build -- lands in this number, which is what makes it the one
  // to watch when deciding whether the feed is on the search path.
  searchReadyAfterLaunch: 'search.ready-after-launch',
} as const;

const MAX_SAMPLES = 120;

let samples: PerfSample[] = [];
const listeners = new Set<() => void>();

interface PerformanceLike {
  now?: () => number;
}

function now(): number {
  const perf = (globalThis as { performance?: PerformanceLike }).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

// Exposed for callers that time work spread across several scheduled chunks,
// where the measurement cannot be expressed as wrapping a single function.
export const perfNow = now;

// Captured when this module is first imported. That is early -- the provider
// tree pulls it in before any screen renders -- but it is NOT process start:
// native launch, dylib loading and JS bundle evaluation all happen before it
// and are not counted. Treat startup.to-interactive as "JS-side time to
// interactive", not as cold-launch wall clock.
const moduleInitAt = now();
let startupMarked = false;
let startupInteractiveAt: number | null = null;
let searchReadyMarked = false;

let notifyScheduled = false;

// Notification is deferred to a microtask rather than fired inline. The
// feed.build measurement records from inside a useMemo -- i.e. during render
// -- and a synchronous notify there would drive useSyncExternalStore into
// scheduling an update while another component is rendering. Deferring also
// coalesces bursts, so a run of debounced searches repaints the panel once.
function scheduleNotify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    for (const listener of listeners) listener();
  });
}

export function recordPerfSample(name: string, ms: number, detail: string | null = null): void {
  const next = samples.length >= MAX_SAMPLES ? samples.slice(1) : samples.slice();
  next.push({ name, ms, detail, at: Date.now() });
  // Replaced rather than mutated so useSyncExternalStore sees a new
  // reference exactly when something changed, and a stable one otherwise.
  samples = next;
  scheduleNotify();
}

export function measurePerf<T>(name: string, run: () => T, detail: string | null = null): T {
  const start = now();
  try {
    return run();
  } finally {
    recordPerfSample(name, now() - start, detail);
  }
}

export async function measurePerfAsync<T>(
  name: string,
  run: () => Promise<T>,
  detail: string | null = null
): Promise<T> {
  const start = now();
  try {
    return await run();
  } finally {
    recordPerfSample(name, now() - start, detail);
  }
}

// Idempotent: the readiness effect that calls this can re-run, and only the
// first transition into an interactive tree is the one worth recording.
export function markStartupInteractive(): void {
  if (startupMarked) return;
  startupMarked = true;
  startupInteractiveAt = now();
  recordPerfSample(PERF.startupToInteractive, startupInteractiveAt - moduleInitAt, 'since JS init');
}

// Called when the search index becomes usable, i.e. when a typed query would
// return complete results rather than restaurants only.
//
// Recorded once per launch, deliberately. The index also reloads when a data
// refresh invalidates it mid-session, and that reload is not the launch
// warmup -- folding it in would quietly turn the headline number into an
// average of two unrelated things. No-ops before startup is marked, so it can
// never report a negative or a duration measured from nothing.
export function markSearchReady(): void {
  if (searchReadyMarked || startupInteractiveAt === null) return;
  searchReadyMarked = true;
  recordPerfSample(PERF.searchReadyAfterLaunch, now() - startupInteractiveAt, 'after interactive');
}

export function getPerfSamples(): PerfSample[] {
  return samples;
}

export function subscribePerf(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Phases that happen once during launch and cannot be re-triggered by using
// the app. markStartupInteractive() and markSearchReady() are idempotent per
// process, so wiping their samples would lose them for the rest of the
// session with no way to get them back short of a cold relaunch -- a trap
// for exactly the workflow Clear exists to serve, where you reset between
// batches of test queries and keep the launch numbers as the fixed context.
const UNREPEATABLE_PHASES = new Set<string>([
  PERF.startupCacheHydrate,
  PERF.startupToInteractive,
  PERF.searchReadyAfterLaunch,
  PERF.searchIndexLoad,
  PERF.searchIndexPrepare,
]);

// Clears what you can regenerate (searches, feed builds) and keeps what you
// cannot. See UNREPEATABLE_PHASES. This is what the Clear control calls.
export function clearPerfSamples(): void {
  samples = samples.filter((sample) => UNREPEATABLE_PHASES.has(sample.name));
  // Same deferred path as recordPerfSample, so there is one notification
  // mechanism rather than two with different timing.
  scheduleNotify();
}

// Drops everything, launch phases included. Not wired to any control: on a
// real device those samples are unrecoverable without a relaunch, so there is
// no good reason to offer it. It exists so tests can isolate from each other,
// which clearPerfSamples() deliberately no longer does.
export function resetPerfSamples(): void {
  samples = [];
  scheduleNotify();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Grouped by phase and ordered by first appearance, so the launch phases stay
// at the top where they happened rather than reordering as searches come in.
//
// Rows group by phase AND detail, not by phase alone. Where a detail varies
// it IS the measurement rather than a label on it, and collapsing across it
// yields a median describing nothing that ever happened:
//
//   search.query -- a query that opens rank.ts's fuzzy fallback costs an
//     order of magnitude more than one that does not.
//   feed.build   -- cold launch runs buildFindFeed once over an empty index
//     and once over 31k entries. Averaging those two is meaningless.
//
// Phases whose detail is constant or absent are unaffected and stay a single
// row, so this generalises rather than special-cases any one phase. NUL is
// the key separator because it cannot occur in a name or detail, where a
// space or colon could and would silently merge two distinct rows.
export function summarizePerf(source: PerfSample[] = samples): PerfSummary[] {
  const groups = new Map<string, PerfSample[]>();
  for (const sample of source) {
    const key = `${sample.name}\u0000${sample.detail ?? ''}`;
    const existing = groups.get(key);
    if (existing) existing.push(sample);
    else groups.set(key, [sample]);
  }
  const rows = Array.from(groups.values(), (group) => {
    const times = group.map((sample) => sample.ms);
    return {
      name: group[0].name,
      count: group.length,
      median: median(times),
      min: Math.min(...times),
      max: Math.max(...times),
      last: times[times.length - 1],
      lastDetail: group[group.length - 1].detail,
    };
  });

  // Launch phases keep first-appearance order; search rows sort slowest
  // first. Typing one word produces a row per debounced prefix, so insertion
  // order buries the expensive query among cheap ones -- and the expensive
  // query is the entire reason to look.
  const launch = rows.filter((row) => row.name !== PERF.searchQuery);
  const searches = rows
    .filter((row) => row.name === PERF.searchQuery)
    .sort((a, b) => b.median - a.median);
  return [...launch, ...searches];
}
