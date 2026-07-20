// Matched-term range for the search spec's "Emphasize matched text using
// weight or another non-color treatment in addition to color" rule.
//
// Deliberately case-insensitive only, not the full diacritic-aware
// normalizeForSearch() the ranking engine itself uses — NFD-stripping
// combining marks changes string length, which breaks mapping a match
// range back onto the *original* display string (the thing that actually
// needs a bolded slice). Practical effect: a query that only matched a
// name via diacritic-folding (e.g. plain "citricos" against "Citricos")
// won't get a visible highlight, since a plain lowercase search won't
// find it either — the result still shows, correctly, just without the
// emphasis span. Graceful degradation, not a crash, and cheap to compute
// per rendered row rather than needing index-time bookkeeping.
export function findMatchRange(text: string, query: string): { start: number; end: number } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  return { start: idx, end: idx + q.length };
}
