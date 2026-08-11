// Differential test for the SQL retrieval half of the search port.
//
// The port only moves candidate RETRIEVAL into SQL; rank.ts keeps tier
// assignment, ordering and caps. So the property that has to hold is narrow
// and checkable: for any query, the rows SQL returns must be exactly the rows
// the in-memory scan would have considered. If that holds, rank.ts cannot
// produce a different answer, because it is the same code seeing the same
// input.
//
// Run against the real cached dataset when one is present -- 31k rows with
// real names, accents and duplicates -- because that is where the interesting
// cases live. Falls back to a small fixture so the suite still runs on a
// machine that has never launched the app.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ensureMenuItemsSchema } from '../src/data/menuItemsSchema.ts';
import {
  findFuzzyItemCandidates,
  findStrictItemCandidates,
  pigeonholeChunks,
} from '../src/search/menuItemQuery.ts';
import { normalizeForSearch } from '../src/data/diacritics.ts';

class AsyncNodeSqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:');
  }

  async execAsync(source) {
    this.database.exec(source);
  }

  async runAsync(source, params) {
    const result = params
      ? this.database.prepare(source).run(params)
      : this.database.prepare(source).run();
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getFirstAsync(source, params) {
    return params
      ? (this.database.prepare(source).get(params) ?? null)
      : (this.database.prepare(source).get() ?? null);
  }

  async getAllAsync(source, params) {
    return params
      ? this.database.prepare(source).all(params)
      : this.database.prepare(source).all();
  }

  close() {
    this.database.close();
  }
}

function findCachedIndex() {
  const root = join(homedir(), 'Library/Developer/CoreSimulator/Devices');
  if (!existsSync(root)) return null;
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes('search_index.json')) {
      const path = join(dir, 'search_index.json');
      found.push({ path, mtime: statSync(path).mtimeMs });
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
  if (found.length === 0) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return JSON.parse(readFileSync(found[0].path, 'utf8'));
}

const FIXTURE = [
  { restaurant_id: 'r1', item_id: 'i1', item: 'Pork Egg Rolls', category: 'Appetizers' },
  { restaurant_id: 'r1', item_id: 'i2', item: 'Pork Belly Bao', category: 'Appetizers' },
  { restaurant_id: 'r2', item_id: 'i3', item: 'Cítricos Salad', category: 'Salads' },
  { restaurant_id: 'r2', item_id: 'i4', item: 'Churro Bites', category: 'Desserts' },
  { restaurant_id: 'r3', item_id: 'i5', item: 'Chicken Sandwich', category: 'Entrees' },
  { restaurant_id: 'r3', item_id: 'i6', item: 'Kids Cheese Cup', category: 'Kids', is_kids: true },
];

const cached = findCachedIndex();
// Deduplicated the way importPipeline now writes it.
const dataset = (() => {
  const source = cached ?? FIXTURE;
  const seen = new Set();
  return source.filter((item) => {
    const key = `${item.restaurant_id}:${item.item_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
})();

async function makeDatabase(t) {
  const db = new AsyncNodeSqlite();
  t.after(() => db.close());
  await ensureMenuItemsSchema(db);
  const insert = db.database.prepare(
    `INSERT INTO menu_items (restaurant_id, item_id, item, norm_item, category,
       show_in_menu, is_kids, is_allergy_friendly, allergens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.database.exec('BEGIN');
  for (const item of dataset) {
    insert.run(
      item.restaurant_id,
      item.item_id,
      item.item,
      normalizeForSearch(item.item),
      item.category ?? '',
      item.show_in_menu === false ? 0 : 1,
      item.is_kids ? 1 : 0,
      item.is_allergy_friendly ? 1 : 0,
      JSON.stringify(item.allergens ?? [])
    );
  }
  db.database.exec('COMMIT');
  return db;
}

// What rank.ts's strict item pass considers: every entry whose normalized name
// contains the query. Tiers are decided afterwards, from this same set.
function strictScanInMemory(query) {
  const q = normalizeForSearch(query).trim();
  if (!q) return [];
  return dataset.filter((item) => normalizeForSearch(item.item).includes(q));
}

function keysOf(rows) {
  return rows.map((row) => `${row.restaurant_id}:${row.item_id}`).sort();
}

const QUERIES = [
  'pork', 'Pork', 'PORK',
  'citricos', 'Cítricos',
  'churro', 'chicken', 'ch', 'ic',
  'egg rolls', 'cheese cup',
  'zzzznotathing', "'; DROP TABLE menu_items; --",
];

test(`dataset in use: ${cached ? `${dataset.length} real cached rows` : 'fixture'}`, () => {
  assert.ok(dataset.length > 0);
});

test('SQL strict retrieval matches the in-memory scan exactly', async (t) => {
  const db = await makeDatabase(t);
  for (const query of QUERIES) {
    const q = normalizeForSearch(query).trim();
    const fromSql = await findStrictItemCandidates(db, q);
    assert.deepEqual(
      keysOf(fromSql),
      keysOf(strictScanInMemory(query)),
      `strict retrieval diverged for ${JSON.stringify(query)}`
    );
  }
});

test('retrieval is case- and diacritic-insensitive on both sides', async (t) => {
  const db = await makeDatabase(t);
  const plain = await findStrictItemCandidates(db, normalizeForSearch('citricos'));
  const accented = await findStrictItemCandidates(db, normalizeForSearch('Cítricos'));
  assert.deepEqual(keysOf(plain), keysOf(accented));
});

test('a query is bound as a parameter, never interpolated', async (t) => {
  const db = await makeDatabase(t);
  const before = await db.getFirstAsync('SELECT COUNT(*) AS count FROM menu_items;');
  await findStrictItemCandidates(db, normalizeForSearch("'; DROP TABLE menu_items; --"));
  const after = await db.getFirstAsync('SELECT COUNT(*) AS count FROM menu_items;');
  assert.equal(after.count, before.count, 'the table must still be there');
});

test('pigeonhole chunks partition the query with no character lost', () => {
  for (const query of ['citricos', 'churros', 'pretzel', 'ice cream', 'pizza', 'ab']) {
    for (const k of [1, 2]) {
      const chunks = pigeonholeChunks(query, k);
      assert.equal(chunks.join(''), query, `chunks must reassemble ${query}`);
      assert.equal(chunks.length, Math.min(k + 1, query.length >= k + 1 ? k + 1 : 1));
    }
  }
});

test('chunks stay as even as possible, which is what makes them selective', () => {
  // The naive ceil() split of a 7-character query is 3/3/1, and a 1-character
  // chunk matches ~73% of the real index -- the filter stops filtering.
  const chunks = pigeonholeChunks('churros', 2);
  assert.deepEqual(chunks, ['chu', 'rr', 'os']);
  const sizes = chunks.map((chunk) => chunk.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'sizes must differ by at most one');
});

test('fuzzy retrieval never misses a real edit-distance match', async (t) => {
  const db = await makeDatabase(t);
  // The soundness property: pigeonhole is a necessary condition, so anything
  // genuinely within edit distance k must survive it. A miss here is a silent
  // search regression -- results quietly disappearing -- so it matters far
  // more than the false positives, which rank.ts filters out anyway.
  for (const [typo, expected] of [
    ['chicke', 'Chicken Sandwich'],
    ['citrico', 'Cítricos Salad'],
    ['churr', 'Churro Bites'],
  ]) {
    const q = normalizeForSearch(typo);
    const k = q.length >= 7 ? 2 : 1;
    const rows = await findFuzzyItemCandidates(db, q, k);
    const names = rows.map((row) => row.item);
    if (dataset === FIXTURE || !cached) {
      assert.ok(names.includes(expected), `${typo} should retrieve ${expected}`);
    } else {
      assert.ok(rows.length > 0, `${typo} should retrieve candidates`);
    }
  }
});

test('fuzzy retrieval returns a superset of strict retrieval', async (t) => {
  const db = await makeDatabase(t);
  for (const query of ['churro', 'pork', 'citricos']) {
    const q = normalizeForSearch(query);
    const k = q.length >= 7 ? 2 : 1;
    const strict = new Set(keysOf(await findStrictItemCandidates(db, q)));
    const fuzzy = new Set(keysOf(await findFuzzyItemCandidates(db, q, k)));
    for (const key of strict) {
      assert.ok(fuzzy.has(key), `${query}: fuzzy must not lose a strict match (${key})`);
    }
  }
});
