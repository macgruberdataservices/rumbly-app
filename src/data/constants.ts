// Confirmed live 2026-07-18 by direct fetch (Front_End repo has no CNAME,
// so this is GitHub Pages' default URL for the disney-dining repo). Recheck
// the repo's Settings -> Pages tab if this ever 404s.
export const DATA_BASE_URL = 'https://macgruberdataservices.github.io/disney-dining/data/';
export const MANIFEST_URL = `${DATA_BASE_URL}data_manifest.json`;
// Published separately from data_manifest.json -- confirmed live 2026-07-21
// by direct fetch, same {generated, months: {"YYYY-MM": hashedFilename}}
// shape Disney Dining Dev's See Changes feature already reads.
export const CHANGES_MANIFEST_URL = `${DATA_BASE_URL}changes_manifest.json`;

// Mirrors the source PWA's DATA_CHECK_INTERVAL_MS — a foreground-checked
// timestamp gate, not a real background job.
export const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const LOCAL_FILES = {
  restaurantData: 'restaurant_data.json',
  hoursData: 'hours_data.json',
  searchIndex: 'search_index.json',
  meta: 'meta.json',
} as const;

export const SQLITE_DB_NAME = 'rumbly.db';
