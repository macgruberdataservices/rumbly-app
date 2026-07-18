// Ported from Disney Dining Dev's checkAndLoadData()/forceRefreshData().
// Gates network access behind a 24h foreground-checked timestamp (there's
// no real background-sync equivalent worth relying on here either — same
// reasoning the source app used for iOS Safari's lack of Periodic
// Background Sync applies to a foregrounded RN app). Cache-hit path does
// zero network calls; force refresh bypasses the gate.

import type { DataManifest } from './types';
import { readJSON, writeJSON } from './fileStore';
import { MANIFEST_URL, REFRESH_INTERVAL_MS, LOCAL_FILES } from './constants';

interface MetaBlob {
  manifest: DataManifest | null;
  lastCheckedAt: number | null;
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
    a.hours_data === b.hours_data
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
  const haveCache = meta.manifest !== null;
  const dueForCheck =
    !haveCache ||
    meta.lastCheckedAt === null ||
    Date.now() - meta.lastCheckedAt >= REFRESH_INTERVAL_MS;

  if (haveCache && !dueForCheck) {
    return { action: 'cache-hit', manifest: meta.manifest };
  }

  const manifest = await fetchManifest(false);

  if (manifestsEqual(meta.manifest, manifest)) {
    await writeMeta({ manifest, lastCheckedAt: Date.now() });
    return { action: 'unchanged', manifest };
  }

  return { action: 'import', manifest };
}

// Port of forceRefreshData(): bypasses the 24h gate entirely.
export async function forceCheckForUpdate(): Promise<DataCheckResult> {
  const meta = await readMeta();
  const manifest = await fetchManifest(true);

  if (manifestsEqual(meta.manifest, manifest)) {
    await writeMeta({ manifest, lastCheckedAt: Date.now() });
    return { action: 'unchanged', manifest };
  }

  return { action: 'import', manifest };
}

export async function markImported(manifest: DataManifest): Promise<void> {
  await writeMeta({ manifest, lastCheckedAt: Date.now() });
}

export async function getLastCheckedAt(): Promise<number | null> {
  const meta = await readMeta();
  return meta.lastCheckedAt;
}
