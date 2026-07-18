// Ported from Disney Dining Dev's index.html normalizeForSearch(): NFD
// decomposes accented characters into base + combining mark, then strips
// the combining-mark range (U+0300-U+036F), so e.g. "Citricos" typed
// plain and "Citricos" typed with its accent match identically regardless
// of which one the user entered. Applied to both sides of every match,
// and precomputed on target strings at load time rather than per keystroke.
//
// Built via RegExp(string) rather than a /.../ literal containing the raw
// combining-mark characters, since those are easy to mis-encode when
// passed through text tooling — \u escapes are plain ASCII and unambiguous.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalizeForSearch(str: string | null | undefined): string {
  return (str || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();
}
