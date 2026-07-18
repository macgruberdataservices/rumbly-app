// Thin JSON wrapper over expo-file-system's modern File/Directory API
// (NOT the legacy readAsStringAsync API, NOT AsyncStorage). Everything
// here is held fully in memory by callers once read — restaurant data,
// hours data, the search index, and the manifest/meta blob are all small
// enough that indexed querying (SQLite) would be a needless extra hop.
// See db.ts for the one thing that *is* indexed: full menu item records.

import { File, Paths } from 'expo-file-system';

function fileFor(name: string): File {
  return new File(Paths.document, name);
}

export function existsJSON(name: string): boolean {
  return fileFor(name).exists;
}

export async function readJSON<T>(name: string): Promise<T | null> {
  const file = fileFor(name);
  if (!file.exists) return null;
  const raw = await file.text();
  return JSON.parse(raw) as T;
}

export async function writeJSON(name: string, data: unknown): Promise<void> {
  const file = fileFor(name);
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(data));
}

export function deleteJSON(name: string): void {
  const file = fileFor(name);
  if (file.exists) {
    file.delete();
  }
}
