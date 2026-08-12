// Data-derived food lexicon and span matcher.
//
// The parser previously discovered food by capturing a span with one of ~39
// ordered regexes and then deleting everything it recognised as something
// else. Whatever survived became the food term, so ordinary grammar leaked
// into the item search: "burger while we are", "dole whip to me",
// "place to grab a dole whip". Those requests then failed as honest
// no-matches for food that the dataset actually contains.
//
// This module inverts that. Rumbly already loads 46k menu rows, so the set of
// things a guest can meaningfully ask for is knowable. Food is *recognised*
// against that vocabulary the same way `linkQueryEntities` recognises
// restaurants and parks, and anything unrecognised is simply not a food term.
// Grammar cannot leak into a term that has to exist in the lexicon first.
//
// The lexicon is built off-parser (see parser_vocabulary.ts) and handed in
// through ParserVocabulary, so this module and the parser stay pure and
// React-Native safe.

import { normalizeForSearch } from '../data/diacritics';
import type { SourceSpan } from './queryPlan';

export interface FoodLexicon {
  /** Phrases as singularized token arrays, indexed by their first token. */
  byFirstToken: Map<string, string[][]>;
  /** Canonical surface form for a singularized token key. */
  canonicalByKey: Map<string, string>;
  maxPhraseTokens: number;
}

export interface FoodMatch extends SourceSpan {
  /** The canonical lexicon phrase, safe to hand to the item matcher. */
  term: string;
}

/**
 * Shared with result_proof.ts so a term the parser produces is tokenized the
 * same way the proof layer will later verify it.
 */
export function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (token === 'fries') return 'fry';
  if (/(?:ch|sh|s|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function phraseTokens(phrase: string): string[] {
  return normalizeForSearch(phrase)
    .replace(/soft[ -]serve/g, 'softserve')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularize);
}

export function buildFoodLexicon(phrases: Iterable<string>): FoodLexicon {
  const byFirstToken = new Map<string, string[][]>();
  const canonicalByKey = new Map<string, string>();
  let maxPhraseTokens = 1;
  for (const phrase of phrases) {
    const tokens = phraseTokens(phrase);
    if (tokens.length === 0) continue;
    const key = tokens.join(' ');
    // First writer wins so a curated phrase keeps its guest-facing surface
    // form even when a menu row would produce the same token key.
    if (canonicalByKey.has(key)) continue;
    canonicalByKey.set(key, phrase.trim().toLowerCase());
    const bucket = byFirstToken.get(tokens[0]);
    if (bucket) bucket.push(tokens);
    else byFirstToken.set(tokens[0], [tokens]);
    if (tokens.length > maxPhraseTokens) maxPhraseTokens = tokens.length;
  }
  for (const bucket of byFirstToken.values()) bucket.sort((a, b) => b.length - a.length);
  return { byFirstToken, canonicalByKey, maxPhraseTokens };
}

interface QueryToken {
  key: string;
  start: number;
  end: number;
}

function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  // Match the phrase-side "soft serve" collapse without disturbing offsets:
  // the pair is detected during extension instead of being rewritten here.
  const pattern = /[a-z0-9]+(?:'[a-z]+)?/gi;
  for (const match of query.matchAll(pattern)) {
    if (match.index == null) continue;
    tokens.push({
      key: singularize(normalizeForSearch(match[0]).replace(/'/g, '')),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

/**
 * Find every maximal lexicon phrase in `query`, skipping any span that
 * overlaps an already-claimed region (linked restaurant/park names, allergen
 * wording, dietary and meal terms, cuisine names, feature phrases).
 *
 * Longest match wins, and matches never overlap each other, so
 * "chicken and waffles" is one term rather than two when the lexicon knows
 * the compound dish.
 */
export function matchFoodSpans(
  query: string,
  lexicon: FoodLexicon,
  claimedSpans: ReadonlyArray<{ start: number; end: number }> = [],
): FoodMatch[] {
  const tokens = tokenizeQuery(query);
  const claimed = (start: number, end: number) =>
    claimedSpans.some((span) => start < span.end && span.start < end);
  const matches: FoodMatch[] = [];
  let index = 0;
  while (index < tokens.length) {
    const bucket = lexicon.byFirstToken.get(tokens[index].key);
    let matched: FoodMatch | null = null;
    if (bucket) {
      for (const phrase of bucket) {
        if (index + phrase.length > tokens.length) continue;
        let ok = true;
        for (let offset = 0; offset < phrase.length; offset += 1) {
          if (tokens[index + offset].key !== phrase[offset]) { ok = false; break; }
        }
        if (!ok) continue;
        const start = tokens[index].start;
        const end = tokens[index + phrase.length - 1].end;
        if (claimed(start, end)) continue;
        const surface = query.slice(start, end);
        // Prefer the guest's own wording. It differs from the canonical entry
        // only by inflection (the match was made on singularized tokens), so
        // it stays verifiable by the proof layer while keeping the plural the
        // guest typed out of the answer copy.
        matched = {
          start,
          end,
          text: surface,
          term: surface.toLowerCase().replace(/\s+/g, ' ').trim()
            || lexicon.canonicalByKey.get(phrase.join(' '))
            || phrase.join(' '),
        };
        break;
      }
    }
    if (matched) {
      matches.push(matched);
      // Advance past the matched phrase so terms cannot overlap.
      while (index < tokens.length && tokens[index].start < matched.end) index += 1;
    } else index += 1;
  }
  return matches;
}

export function lexiconHasTerm(lexicon: FoodLexicon, term: string): boolean {
  return lexicon.canonicalByKey.has(phraseTokens(term).join(' '));
}
