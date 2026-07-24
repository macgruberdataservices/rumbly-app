// Ported from Disney Dining Dev's checkAndLoadData()/forceRefreshData().
// Gates network access behind a 24h foreground-checked timestamp (there's
// no real background-sync equivalent worth relying on here either — same
// reasoning the source app used for iOS Safari's lack of Periodic
// Background Sync applies to a foregrounded RN app). Cache-hit path does
// zero network calls; force refresh bypasses the gate.

import type { DataManifest } from './types';
import { readJSON, writeJSON } from './fileStore';
import { MANIFEST_URL, REFRESH_INTERVAL_MS, LOCAL_FILES } from './constants';

// Bump whenever a change to importPipeline.ts's parsing/merge logic needs
// every already-synced device to re-run a full import even though the
// remote manifest's content hashes haven't changed. 2026-07-23's
// hand-coded-data merge fix is exactly that case: the published files on
// the server didn't change, only what runImport() does with them, so
// manifest-equality alone would never trigger a re-import on a device
// that synced before the fix shipped -- this is the missing piece that
// makes that fix (or any future one shaped like it) actually take effect
// without asking the user to reinstall the app or manually clear storage.
// v3: hand-coded park/area/resort now backfills onto an already-graduated
// main-feed record regardless of the hand-coded record's own
// show_in_app, and hoursStatus gained a distinct 'none' kind (fixes
// hand-coded venues grouping into "Other" and showing a misleading
// "Hours unavailable offline" label).
// v4: SearchIndexEntry gained first_seen (for the "New" item badge) --
// a locally cached search_index.json from before this won't have it.
// v5: hand-coded park/area/resort strings now get remapped to the
// canonical Disney names before backfilling (fixes duplicate/stray
// Explore-by-Location cards -- a hand-coded record's casual "Hollywood
// Studios" was landing as its own group next to the real "Disney's
// Hollywood Studios" one).
// v6: SearchIndexEntry gained description (for identical-item grouping
// in search results) -- a locally cached search_index.json from before
// this won't have it.
const LOCAL_DATA_SCHEMA_VERSION = 6;

interface MetaBlob {
  manifest: DataManifest | null;
  lastCheckedAt: number | null;
  schemaVersion?: number;
}

async function readMeta(): Promise<MetaBlob> {
  const meta = await readJSON<MetaBlob>(LOCAL_FILES.meta);
  return meta ?? { manifest: null, lastCheckedAt: null };
}

async function writeMeta(meta: MetaBlob): Promise<void> {
  await writeJSON(LOCAL_FILES.meta, meta);
}

function manifestsEqual(a: DataManifest | null, b: DataManifest): boolean {
  if (!a) return false;
  return (
    a.restaurant_data === b.restaurant_data &&
    a.menu_data === b.menu_data &&
    a.hours_data === b.hours_data &&
    a.hand_coded_data === b.hand_coded_data &&
    a.hand_coded_menu_data === b.hand_coded_menu_data
  );
}

async function fetchManifest(bustCache: boolean): Promise<DataManifest> {
  // RN's fetch has no Service-Worker-style cache:'no-store' guarantee the
  // way a browser context does, so force-refresh uses a cache-busting
  // query param instead to actually reach the network.
  const url = bustCache ? `${MANIFEST_URL}?t=${Date.now()}` : MANIFEST_URL;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Manifest fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as DataManifest;
}

export type DataCheckResult =
  | { action: 'cache-hit'; manifest: DataManifest | null }
  | { action: 'unchanged'; manifest: DataManifest }
  | { action: 'import'; manifest: DataManifest };

// Port of checkAndLoadData(): decides, without necessarily hitting the
// network, whether the caller needs to run the import pipeline.
export async function checkForUpdate(): Promise<DataCheckResult> {
  const meta = await readMeta();
  const schemaStale = meta.schemaVersion !== LOCAL_DATA_SCHEMA_VERSION;
  const haveCache = meta.manifest !== null && !schemaStale;
  const dueForCheck =
    !haveCache ||
    meta.lastCheckedAt === null ||
    Date.now() - meta.lastCheckedAt >= REFRESH_INTERVAL_MS;

  if (haveCache && !dueForCheck) {
    return { action: 'cache-hit', manifest: meta.manifest };
  }

  const manifest = await fetchManifest(false);

  if (!schemaStale && manifestsEqual(meta.manifest, manifest)) {
    await writeMeta({ manifest, lastCheckedAt: Date.now(), schemaVersion: LOCAL_DATA_SCHEMA_VERSION });
    return { action: 'unchanged', manifest };
  }

  return { action: 'import', manifest };
}

// Port of forceRefreshData(): bypasses the 24h gate entirely. Does NOT
// bypass the schema-version gate above -- a stale local schema still
// forces a real import here too, same as checkForUpdate.
export async function forceCheckForUpdate(): Promise<DataCheckResult> {
  const meta = await readMeta();
  const schemaStale = meta.schemaVersion !== LOCAL_DATA_SCHEMA_VERSION;
  const manifest = await fetchManifest(true);

  if (!schemaStale && manifestsEqual(meta.manifest, manifest)) {
    await writeMeta({ manifest, lastCheckedAt: Date.now(), schemaVersion: LOCAL_DATA_SCHEMA_VERSION });
    return { action: 'unchanged', manifest };
  }

  return { action: 'import', manifest };
}

export async function markImported(manifest: DataManifest): Promise<void> {
  await writeMeta({ manifest, lastCheckedAt: Date.now(), schemaVersion: LOCAL_DATA_SCHEMA_VERSION });
}

export async function getLastCheckedAt(): Promise<number | null> {
  const meta = await readMeta();
  return meta.lastCheckedAt;
}
