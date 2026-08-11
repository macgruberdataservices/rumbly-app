import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearPerfSamples,
  getPerfSamples,
  measurePerf,
  measurePerfAsync,
  recordPerfSample,
  resetPerfSamples,
  subscribePerf,
  summarizePerf,
} from '../src/perf/perfLog.ts';

// resetPerfSamples, not clearPerfSamples: Clear deliberately preserves launch
// phases, so it does not isolate one test from the next.
test.beforeEach(() => resetPerfSamples());

test('summaries group by phase and report median, min and max', () => {
  for (const ms of [10, 30, 20]) recordPerfSample('search.query', ms, 'pork');
  recordPerfSample('search.index-load', 400);

  const summary = summarizePerf();
  const query = summary.find((row) => row.name === 'search.query');
  assert.equal(query.count, 3);
  assert.equal(query.median, 20);
  assert.equal(query.min, 10);
  assert.equal(query.max, 30);
  // `last` is insertion order, not sorted order -- it answers "what did the
  // thing I just did cost", which is how the panel is read in practice.
  assert.equal(query.last, 20);
  assert.equal(query.lastDetail, 'pork');

  assert.equal(summary.find((row) => row.name === 'search.index-load').count, 1);
});

test('feed builds split by index size instead of averaging into one row', () => {
  // Cold launch runs buildFindFeed over an empty index, then over the real
  // one. A single row would report a median describing neither.
  recordPerfSample('feed.build', 0.4, '0 entries');
  recordPerfSample('feed.build', 980, '31321 entries');

  const summary = summarizePerf();
  assert.equal(summary.length, 2);
  const byDetail = new Map(summary.map((row) => [row.lastDetail, row]));
  assert.equal(byDetail.get('0 entries').median, 0.4);
  assert.equal(byDetail.get('31321 entries').median, 980);
});

test('searches group per query, not into one row for the phase', () => {
  recordPerfSample('search.query', 6, 'chicken');
  recordPerfSample('search.query', 8, 'chicken');
  recordPerfSample('search.query', 300, 'citricos');

  const summary = summarizePerf();
  assert.equal(summary.length, 2, 'two distinct queries should be two rows');

  const byQuery = new Map(summary.map((row) => [row.lastDetail, row]));
  assert.equal(byQuery.get('chicken').count, 2);
  assert.equal(byQuery.get('chicken').median, 7);
  assert.equal(byQuery.get('citricos').count, 1);
  assert.equal(byQuery.get('citricos').median, 300);
});

test('search rows sort slowest first so the expensive query surfaces', () => {
  recordPerfSample('search.query', 6, 'chicken');
  recordPerfSample('search.query', 300, 'citricos');
  recordPerfSample('search.query', 40, 'pork');

  assert.deepEqual(
    summarizePerf().map((row) => row.lastDetail),
    ['citricos', 'pork', 'chicken']
  );
});

test('an even number of samples medians across the middle pair', () => {
  for (const ms of [10, 20, 30, 40]) recordPerfSample('search.query', ms, 'pork');
  assert.equal(summarizePerf()[0].median, 25);
});

test('launch phases keep first-appearance order and stay above search rows', () => {
  recordPerfSample('startup.cache-hydrate', 12);
  recordPerfSample('search.query', 500, 'citricos');
  recordPerfSample('startup.to-interactive', 140);
  recordPerfSample('startup.cache-hydrate', 14);

  // Launch rows in the order they first happened, then searches -- a slow
  // search must not push the launch phases down the panel.
  assert.deepEqual(
    summarizePerf().map((row) => row.name),
    ['startup.cache-hydrate', 'startup.to-interactive', 'search.query']
  );
});

test('clear keeps launch rows and drops the regenerable ones', () => {
  // markStartupInteractive/markSearchReady are idempotent per process, so
  // wiping their samples would lose them until a cold relaunch -- a trap for
  // the very workflow Clear serves (reset between batches of test queries,
  // keep the launch numbers as fixed context).
  recordPerfSample('startup.cache-hydrate', 52);
  recordPerfSample('startup.to-interactive', 140, 'since JS init');
  recordPerfSample('search.ready-after-launch', 610, 'after interactive');
  recordPerfSample('search.index-load', 454);
  recordPerfSample('search.index-prepare', 10.6, '31321 entries in');
  recordPerfSample('search.query', 300, 'citricos');
  recordPerfSample('feed.build', 980, '31321 entries');

  clearPerfSamples();

  assert.deepEqual(
    getPerfSamples().map((sample) => sample.name),
    [
      'startup.cache-hydrate',
      'startup.to-interactive',
      'search.ready-after-launch',
      'search.index-load',
      'search.index-prepare',
    ]
  );
});

test('the buffer is bounded and evicts oldest first', () => {
  for (let i = 0; i < 200; i++) recordPerfSample('search.query', i);

  const samples = getPerfSamples();
  assert.equal(samples.length, 120);
  // Oldest dropped, newest kept.
  assert.equal(samples[0].ms, 80);
  assert.equal(samples[samples.length - 1].ms, 199);
});

test('each record publishes a new array reference for useSyncExternalStore', () => {
  const before = getPerfSamples();
  recordPerfSample('search.query', 1);
  const after = getPerfSamples();

  assert.notEqual(before, after, 'a change must produce a new reference');
  assert.equal(after, getPerfSamples(), 'an unchanged store must be reference-stable');
});

test('subscribers are notified after a microtask, and can unsubscribe', async () => {
  let notifications = 0;
  const unsubscribe = subscribePerf(() => {
    notifications += 1;
  });

  // Deferred, not inline: feed.build records from inside a useMemo (during
  // render), where a synchronous notify would schedule a React update while
  // another component is rendering.
  recordPerfSample('search.query', 1);
  assert.equal(notifications, 0, 'must not notify synchronously');
  await Promise.resolve();
  assert.equal(notifications, 1);

  unsubscribe();
  recordPerfSample('search.query', 1);
  await Promise.resolve();
  assert.equal(notifications, 1, 'no notification after unsubscribe');
});

test('a burst of records coalesces into one notification', async () => {
  let notifications = 0;
  const unsubscribe = subscribePerf(() => {
    notifications += 1;
  });

  for (let i = 0; i < 10; i++) recordPerfSample('search.query', i, 'pork');
  await Promise.resolve();
  assert.equal(notifications, 1, 'ten records should repaint the panel once');

  unsubscribe();
});

test('measurePerf returns the value and still records when the body throws', () => {
  assert.equal(measurePerf('search.query', () => 'result'), 'result');
  assert.equal(getPerfSamples().length, 1);

  assert.throws(() => measurePerf('search.query', () => {
    throw new Error('boom');
  }));
  // A throwing search must not silently vanish from the measurements --
  // an error path that is slow is exactly the kind of thing worth seeing.
  assert.equal(getPerfSamples().length, 2);
});

test('measurePerfAsync awaits the body before recording', async () => {
  let resolved = false;
  const value = await measurePerfAsync('search.index-load', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolved = true;
    return 'done';
  });

  assert.equal(value, 'done');
  assert.ok(resolved);
  const [sample] = getPerfSamples();
  assert.equal(sample.name, 'search.index-load');
  assert.ok(sample.ms >= 9, `expected the await to be included, got ${sample.ms}ms`);
});
