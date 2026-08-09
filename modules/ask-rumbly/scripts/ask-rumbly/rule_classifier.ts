// Zero-marginal-cost legacy baseline for semantic-parser comparison:
// pure keyword/pattern intent detection + direct fuzzy-matching against
// real vocabulary (reusing the same src/search/rank.ts the app's Find tab
// already uses), no model call at all. Explored 2026-07-31 because a
// per-query cloud LLM call doesn't fit a set-price (non-subscription) app
// -- ongoing marginal cost per use works against that pricing model,
// whereas this approach has zero incremental cost and zero non-
// determinism/guardrail risk by construction (see Docs/ASK_RUMBLY_HANDOFF.md
// for why those were real, unresolved problems with the on-device model).
//
// Deliberately NOT a port of the LLM's instructions into regex -- designed
// from the same taxonomy (test-prompts.json) but as its own approach:
// intent is detected by keyword presence (bounded, explainable, testable
// in isolation), and item/restaurant extraction never invents a name --
// it only ever returns what a real fuzzy-search match confirms exists,
// so hallucination is structurally impossible here, unlike the LLM path.

import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import type { ClassifiedQuery } from './executor.ts';
import { resortAliases } from './location_aliases.ts';
import { search } from '../../../../src/search/rank.ts';
import { normalizeForSearch } from '../../../../src/data/diacritics.ts';

type QueryType =
  | 'cheapest'
  | 'nearest'
  | 'list'
  | 'hours'
  | 'hasItem'
  | 'distance'
  | 'attribute'
  | 'attributeList'
  | 'menu'
  | 'clarification'
  | 'unsupported';

// Pure function/filler words -- always safe to strip regardless of intent,
// never part of a real item or restaurant name. Deliberately does NOT
// include "and" -- see splitCompoundItems() for why that needs to stay a
// controlled delimiter rather than blindly-stripped noise (some real dish
// names, e.g. "Chicken and Waffles", legitimately contain it).
const CORE_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'does', 'do', 'did', 'what', 'whats', "what's",
  'where', "where's", 'wheres', 'when', 'which', 'who', 'how', 'i', "i'm", 'im', 'can', 'could', 'would',
  'you', 'your', 'me', 'my', 'please', 'right', 'now', 'today', 'tomorrow', 'anything', 'something',
  'to', 'for', 'in', 'at', 'on', 'of', 'it', 'its', "it's", 'with', 'there', 'here',
  'tell', 'give', 'find', 'looking', 'kinda', 'want', 'know', 'still', 'idea', 'any',
  'eat', 'eating', 'have', 'try', 'need', 'hungry', 'craving', 'starving',
  // Found live (owner-reported stress test, 2026-07-31): "where can WE get
  // a turkey leg" failed entirely -- "i"/"i'm" were already covered, but a
  // guest asking on behalf of a group is at least as common, and "we"
  // leaking into the item residual ("we turkey leg") broke a query that
  // otherwise had everything right. No real restaurant/item name found
  // containing any of these as a standalone word (checked against live
  // data before adding).
  // Deliberately NOT "our"/"ours" -- confirmed live this breaks resolving
  // "Be Our Guest Restaurant" (one of the most heavily-tested real
  // restaurants in this whole taxonomy): "when does Be Our Guest open
  // tomorrow" regressed to "No restaurant was recognized" the moment
  // "our" was added here, since it's a real, load-bearing word in that
  // restaurant's own name. "we"/"us" were checked and have no such
  // collision in the live data, so only those stay.
  'we', 'us', "we're", "i'd", 'id', 'lets', "let's",
  // Found live (owner-reported stress test, 2026-07-31): "should I try the
  // dole whip" left "should dole whip" as the item residual -- "try"/"i"
  // were already stopwords, "should" wasn't.
  'should',
]);

// Words that signal intent (cheapest/nearest/hours/list) -- stripped when
// building an ITEM residual (they're never part of a food name), but kept
// when building a RESTAURANT-name residual on a first pass, because real
// restaurant names sometimes contain them (found live: "50's Prime Time
// Cafe" -- stripping "time" as a stopword breaks matching the name at
// all, since the residual "50's Prime Cafe" is no longer a substring/
// fuzzy match of the real name). See restaurantResidual() below for how
// this tension is actually resolved -- by trying both variants, not by
// picking one.
const INTENT_STOPWORDS = new Set([
  'closest', 'nearest', 'near', 'nearby', 'cheapest', 'cheap', 'cheaper', 'lowest', 'least',
  'expensive', 'price', 'priced', 'hours', 'hour', 'time', 'times', 'place', 'places', 'everywhere', 'sell', 'sells',
  'serve', 'serves', 'served', 'serving',
  'sold', 'all', 'any', 'some', 'restaurant', 'restaurants', 'get', 'got', 'stand', 'cart', 'kiosk',
  // Found live (owner-reported stress test, 2026-07-31): generic food-
  // words, never a real dish name on their own -- "italian food"/"mexican
  // food" failed to match anything, while bare "italian"/"mexican" (once
  // "food" is out of the way) resolved to real, correct answers
  // immediately. Deliberately in INTENT_STOPWORDS, not CORE_STOPWORDS --
  // several real restaurant names literally contain "Food"/"Eats" ("World
  // Premiere Food Court", "Epic Eats"), so this only strips them from the
  // AGGRESSIVE item/restaurant-name tier; restaurantResidual()'s pattern
  // and gentle tiers (checked first, and un-stripped/CORE-only
  // respectively) still resolve those real names correctly either way.
  'food', 'foods', 'cuisine', 'eats', 'dish', 'dishes', 'like',
  // Subjective-quality filler -- never part of a real item name (no menu
  // item is literally called "Good Pizza"), so always safe to strip once
  // the SUBJECTIVE_PATTERN signal below has already read them for intent
  // purposes. Same INTENT_STOPWORDS-not-CORE placement as food/eats above:
  // "Great Food..." appears verbatim in one real restaurant's own
  // descriptive name (The BOATHOUSE), so this stays out of CORE_STOPWORDS
  // to keep the gentle-tier restaurant-name fallback intact just in case.
  'good', 'great', 'best', 'favorite', 'favourite', 'amazing', 'awesome', 'tasty', 'yummy', 'nice',
  'recommend', 'recommendation', 'recommendations', 'suggest', 'suggestion', 'suggestions',
  // Found live (owner-supplied 100-question batch, 2026-07-31), a genuine
  // failure mode of executor.ts's significantPhraseFallback: a large
  // fraction of that batch asked about ATMOSPHERE, LOGISTICS/TIMING,
  // VALUE/RANKING, or HIDDEN/SECRET content -- categories with no specific
  // dish named at all ("biggest portion for the money," "quiet,
  // air-conditioned lunch," "secret menu items," "mobile order arrival
  // windows"). The fallback (correctly) shrinks a noisy phrase down to
  // find a real term buried in it, but with no real dish anywhere in the
  // sentence, it was landing on whichever ordinary English word
  // coincidentally had the fewest substring hits across 45k+ item names
  // and presenting that as a confident, specific-looking answer --
  // "biggest portion for the money" answered with "portion" (an
  // unrelated real item happening to contain that word), "secret menu
  // items" with "secret" (ditto), "past 11 PM" with "after." A wrong but
  // CONFIDENT-looking real-data answer is worse than an honest decline,
  // since it reads as grounded when the connection to what was actually
  // asked is coincidental. No count/length threshold reliably tells a
  // rare real dish name (few matches, wanted) apart from a rare
  // coincidental substring hit (few matches, not wanted) -- both look
  // identical by that measure -- so this is a deliberate, evidence-based
  // denylist of the specific words actually observed causing this, not a
  // general theory of what "generic" means. Several of these are real
  // substrings of real restaurant names (Flame Tree Barbecue, BaseLine
  // Tap House, Cinderella's Royal Table, many "___ Lounge"/"___ Pool
  // Bar" venues) -- same INTENT_STOPWORDS-not-CORE placement as
  // food/eats above protects restaurant-name resolution regardless.
  'under', 'over', 'money', 'court', 'share', 'shares', 'options', 'option', 'menu', 'menus',
  'portion', 'portions', 'street', 'value', 'spot', 'spots', 'gives', 'give', 'biggest', 'most',
  'away', 'village', 'show', 'dine', 'dining', 'sit', 'order', 'orders', 'back', 'after', 'before',
  'group', 'secret', 'secrets', 'festival', 'flame', 'bartender', 'items', 'item', 'has', 'have',
  'loop', 'from', 'location', 'locations', 'tap', 'availability', 'available',
  'pool', 'table', 'tables', 'distance', 'walking', 'admission', 'ticket', 'tickets', 'reservation',
  'reservations', 'view', 'quiet', 'immersive', 'theatrical', 'aesthetic', 'aesthetics', 'retro',
  'teenager', 'animals', 'roaming', 'patio', 'patios', 'outdoor', 'outdoors', 'indoor', 'weekday',
  'weekdays', 'specials', 'special', 'lounge', 'lounges',
]);

// Owner-reported gap 2026-07-31 (stress test): "recommend a restaurant" /
// "what's a good pizza place in Epcot" / "should I try X" carry a real
// intent (this app has no ratings/opinion data, so it structurally can't
// answer "what's best," but it CAN fall back to a real, grounded
// substitute -- nearest/available real match) that none of the other
// signals below catch, since they often lack "where"/"get"/"find"
// entirely. Checked on the pre-stripped text (the words above are also in
// INTENT_STOPWORDS so they don't pollute the eventual item residual, but
// the SIGNAL itself has to be read before that stripping happens).
const SUBJECTIVE_PATTERN = /\b(?:best|favorite|favourite|good|great|amazing|awesome|tasty|yummy|recommend(?:ation)?s?|suggest(?:ion)?s?|should i)\b/i;

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[?.!,]/g, '');
}

function buildResidual(query: string, extraStopwords: Set<string>): string {
  return query
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => w.length > 0 && !CORE_STOPWORDS.has(w) && !extraStopwords.has(w))
    .join(' ')
    .trim();
}

// The combined (unsplit) residual, for the "maybe this whole phrase is
// one real dish name" attempt -- e.g. "chicken and waffles" must stay
// intact here, not get split. A leading "and"/"or" leftover (from a query
// like "cheapest AND closest burger" having both intent words stripped,
// leaving "and burger") is cleaned up since that "and" was never part of
// an item name to begin with -- it was connecting two *intents*, not two
// *items*.
function itemResidual(query: string): string {
  return buildResidual(query, INTENT_STOPWORDS).replace(/^(and|or)\s+/i, '').trim();
}

// Cheap, deliberately non-fuzzy sanity gate -- owner-reported bug
// 2026-07-31 ("what's the weather today" answering with 142 "Water"
// items, a pure edit-distance coincidence with nothing else in the
// sentence suggesting food at all). Only used to decide whether a bare,
// otherwise-unclassified leftover word is even worth treating as a food
// query in the first place -- a plain substring check against real item
// names/categories, same non-fuzzy discipline as executor.ts's
// cheapCandidateProbeCount, just living classifier-side since this
// decision (should this even become a 'list' query at all) happens here,
// before the executor's own (correctly more permissive, for queries that
// already have real food intent established) matching ever runs.
function isPlausibleItemTerm(term: string, data: LoadedData): boolean {
  const q = normalizeForSearch(term).trim();
  if (q.length <= 2) return false;
  // Word-boundary, not plain substring -- found live: "weather" is a
  // real, literal substring of a real item, "Fairweather Friend," purely
  // by English compound-word coincidence (fair+weather), which a naive
  // substring check accepted just as readily as a genuine match. A plain
  // substring check is right for the executor's actual matching (where
  // "fries" SHOULD match "Waffle Fries" -- a modifier prefix, not a
  // coincidence) but wrong for this one-shot plausibility gate, where the
  // question is "does any real word actually match," not "does this
  // appear anywhere in a longer word."
  const re = new RegExp(`\\b${escapeRegExp(q)}\\b`, 'i');
  return data.searchIndex.some((item) => re.test(normalizeForSearch(item.item)) || re.test(normalizeForSearch(item.category ?? '')));
}

// Splits on "and"/"," as a genuine compound-item signal -- "hot dog and a
// beer" -> ["hot dog", "beer"]. Only meaningful when it produces 2+ real
// segments; the executor tries the combined single-item interpretation
// (itemResidual above) first and only falls back to this, so a real dish
// name containing "and" isn't broken by an eager split.
//
// Owner request 2026-07-31: "pizza or burgers" carries a genuinely
// different meaning from "pizza and burgers" -- EITHER one is fine
// (union: a restaurant serving just one of them still answers the
// question), not BOTH required (intersection, what "and" already means).
// "or" is checked first, and only falls back to "and" if no "or" is
// present -- a query is realistically asking one or the other, not both
// connectors in the same sentence. Returns the connector actually used
// alongside the segments so the executor can apply the right set
// operation (matchCompoundItems/answerCompound in executor.ts).
// Found live (owner-supplied 100-question batch, 2026-07-31): a bare
// comma was being treated as a compound-item delimiter on its own, with
// no "and"/"or" anywhere in the sentence required at all -- real, natural
// guest phrasing uses commas constantly for ordinary reasons that have
// nothing to do with itemization ("a really solid, juicy burger," "a
// quiet, air-conditioned lunch," "a working, living greenhouse"), and
// 29/100 questions in that batch got mangled into a bogus 2-item compound
// search this way (e.g. "really solid, juicy burger" -> ["really solid",
// "juicy burger"]). A real itemized list in English is "X, Y, and Z" or
// "X and Y" -- a comma is only ever a genuine item-separator when "and"/
// "or" also appears somewhere in the sentence; a comma with neither is
// just punctuation, never itemization on its own. Requiring that presence
// first, before ever trying the comma split, is what "and"/"or" checked
// via `\s+or\s+`/`\s+and\s+` up front already assumed for other reasons --
// this makes both branches actually enforce it.
function splitCompoundItems(query: string): { items: string[]; mode: 'and' | 'or' } | null {
  if (/\s+or\s+/i.test(query)) {
    const orSegments = query
      .split(/\s*,\s*|\s+or\s+/i)
      .map((segment) => buildResidual(segment, INTENT_STOPWORDS))
      .filter(Boolean);
    if (orSegments.length > 1) return { items: orSegments, mode: 'or' };
  }
  if (!/\s+and\s+/i.test(query)) return null;
  const andSegments = query
    .split(/\s*,\s*|\s+and\s+/i)
    .map((segment) => buildResidual(segment, INTENT_STOPWORDS))
    .filter(Boolean);
  return andSegments.length > 1 ? { items: andSegments, mode: 'and' } : null;
}

// Common one-word compound spellings of real two-word menu-item names --
// found live: "corndog" (no space) produced completely different, wrong
// results from "corn dog" -- nothing in the data literally contains the
// run-together spelling, so it fell through to rank.ts's fuzzy fallback
// and matched unrelated restaurant/item names by edit distance instead.
// "corn dog" (the real two-word form actually used throughout the data)
// matches cleanly via a direct substring hit. Not a general spell-checker
// -- just the specific compound words this has actually broken on.
const COMPOUND_WORD_NORMALIZATIONS: Record<string, string> = {
  corndog: 'corn dog',
  corndogs: 'corn dogs',
  hotdog: 'hot dog',
  hotdogs: 'hot dogs',
  icecream: 'ice cream',
  funnelcake: 'funnel cake',
  funnelcakes: 'funnel cakes',
};

function normalizeCompoundWords(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => COMPOUND_WORD_NORMALIZATIONS[cleanWord(w)] ?? w)
    .join(' ');
}

// Theme/water park + Disney Springs aliases -- see src/data/locationNames.ts
// for the canonical park-label mapping this is designed to line up with
// (parkDisplayName() collapses raw park-field variants like "Hollywood
// Studios" vs "Disney's Hollywood Studios" to the same display string,
// which is also what these aliases are written against).
const PARK_ALIASES: [string, string][] = [
  ['magic kingdom', 'Magic Kingdom'],
  ['hollywood studios', 'Hollywood Studios'],
  ['animal kingdom', 'Animal Kingdom'],
  ['typhoon lagoon', 'Typhoon Lagoon'],
  ['blizzard beach', 'Blizzard Beach'],
  ['disney springs', 'Disney Springs'],
  ['epcot', 'EPCOT'],
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripLocationPhrase(query: string, alias: string): string {
  const escaped = escapeRegExp(alias);
  const withConnector = query.replace(new RegExp(`\\b(in|at|near)\\s+(the\\s+)?${escaped}\\b`, 'i'), ' ');
  const withoutPhrase = withConnector !== query ? withConnector : query.replace(new RegExp(`\\b${escaped}\\b`, 'i'), ' ');
  return withoutPhrase.replace(/\s+/g, ' ').trim();
}

// Owner-reported gap 2026-07-31: only top-level parks were recognized --
// "Fantasyland", "Echo Lake" (real sub-areas *within* a park) weren't.
// Both are genuinely present as exact `restaurant.area` values in the live
// data (confirmed: Fantasyland|Magic Kingdom Park, Echo Lake|Disney's
// Hollywood Studios), so rather than hardcode a list of "lands"/areas that
// would need manual upkeep as Disney adds/renames them, this builds the
// alias set directly from whatever area values actually exist in the
// loaded data. Checked longest-alias-first so a more specific area name
// isn't shadowed by a shorter one that happens to be a substring of it.
// **Known gap, not fixed here**: individual World Showcase countries
// (e.g. "France") aren't real `area` values -- Disney's own data lumps
// all 49 World Showcase restaurants under one generic area, "World
// Showcase", with no structured per-country field anywhere found. Fixing
// that would need a manually curated restaurant->country mapping (no
// reliable source of that mapping was available to build confidently);
// flagged as a known limitation rather than guessed at.
//
// Owner-reported gap 2026-07-31: resorts were never recognized as a
// location filter at all -- "cheapest hamburger at the grand floridian"
// found nothing, because "grand floridian" was never even checked against
// anything. Resorts already show up fine in *unscoped* queries (they're
// just part of the whole dataset), but couldn't be scoped *to*. Unlike
// areas, the real `restaurant.resort` value is a long formal name
// ("Disney's Grand Floridian Resort & Spa") that a casual query is a
// SUBSTRING of, not the other way around -- so this strips common
// boilerplate (the "Disney's"/"Walt Disney World" prefix, "Resort"/
// "Resort & Spa"/"Hotel"/"Lodge"/"Village Resort" suffixes) to derive a
// shorter, more natural alias per resort ("Disney's Grand Floridian
// Resort & Spa" -> "Grand Floridian") before checking it against the
// query, same substring-alias pattern as the park/area checks above.
// **Known imperfect cases, not specially handled**: a few real resort
// names don't strip cleanly this way (e.g. "Disney's Port Orleans Resort
// - French Quarter", "Disney's Animal Kingdom Villas - Kidani Village") --
// the boilerplate strip only handles a trailing suffix, not an internal
// one, so these keep more of their formal name than a user would likely
// type. Left as a known gap rather than special-cased individually.
// Found live (owner-reported 2026-07-31): "where can I get chicken at
// Wilderness Lodge" left "chicken lodge" as the extracted item, not
// "chicken" -- the derived alias for "Disney's Wilderness Lodge" is just
// "wilderness" (the boilerplate suffix "lodge" was stripped off to build
// the alias), but the user's actual query still has "lodge" in it, and
// plain stripLocationPhrase() only removes the alias text itself, not the
// boilerplate word that follows it in the real sentence. Fixed with a
// resort-specific strip that also consumes an optional trailing
// boilerplate word/phrase right after the alias match.
const RESORT_SUFFIX_TAIL = '(?:\\s+(?:resort\\s*&?\\s*spa|resort\\s*&?\\s*campground|village\\s+resort|villas?\\s*&\\s*bungalows|resort|hotel|lodge|springs|inn|villas?|village))?';

function stripResortPhrase(query: string, alias: string): string {
  const escaped = escapeRegExp(alias);
  const withConnector = query.replace(new RegExp(`\\b(in|at|near)\\s+(the\\s+)?${escaped}${RESORT_SUFFIX_TAIL}\\b`, 'i'), ' ');
  const withoutPhrase =
    withConnector !== query ? withConnector : query.replace(new RegExp(`\\b${escaped}${RESORT_SUFFIX_TAIL}\\b`, 'i'), ' ');
  return withoutPhrase.replace(/\s+/g, ' ').trim();
}

interface LocationAliasIndex {
  areas: string[];
  resorts: Array<[string, string]>;
}

const locationAliasCache = new WeakMap<LoadedData, LocationAliasIndex>();

function locationAliases(data: LoadedData): LocationAliasIndex {
  let cached = locationAliasCache.get(data);
  if (cached) return cached;
  const areas = Array.from(new Set(data.restaurants.map((restaurant) => restaurant.area).filter((area): area is string => !!area))).sort(
    (a, b) => b.length - a.length
  );
  const canonicalResorts = Array.from(
    new Set(data.restaurants.map((restaurant) => restaurant.resort).filter((resort): resort is string => !!resort))
  );
  const resorts = canonicalResorts
    .flatMap((resort): Array<[string, string]> => resortAliases(resort).map((alias) => [alias, resort]))
    .concat(
      canonicalResorts
        .filter((resort) => /polynesian/i.test(resort))
        .map((resort): [string, string] => ['poly', resort])
    )
    .concat(
      canonicalResorts
        .filter((resort) => /caribbean beach/i.test(resort))
        .flatMap((resort): Array<[string, string]> => [
          ['carribean beach', resort],
          ['carribean', resort],
        ])
    )
    .sort((a, b) => b[0].length - a[0].length);
  cached = { areas, resorts };
  locationAliasCache.set(data, cached);
  return cached;
}

function extractParkFilter(query: string, data: LoadedData): { park: string | null; withoutPark: string } {
  const lower = query.toLowerCase();
  const matches: Array<{
    alias: string;
    canonical: string;
    matchedLength: number;
    priority: number;
    strip: (value: string) => string;
  }> = [];

  for (const [alias, canonical] of PARK_ALIASES) {
    if (!lower.includes(alias)) continue;
    matches.push({
      alias,
      canonical,
      matchedLength: alias.length,
      priority: 3,
      strip: (value) => stripLocationPhrase(value, alias),
    });
  }

  const { areas: areaAliases, resorts: resortAliases } = locationAliases(data);
  for (const area of areaAliases) {
    const areaLower = area.toLowerCase();
    if (!lower.includes(areaLower)) continue;
    matches.push({
      alias: areaLower,
      canonical: area,
      matchedLength: areaLower.length,
      priority: 2,
      strip: (value) => stripLocationPhrase(value, areaLower),
    });
  }

  for (const [alias, canonicalResort] of resortAliases) {
    const aliasLower = alias.toLowerCase();
    if (!lower.includes(aliasLower)) continue;
    const resortPhraseMatch = lower.match(new RegExp(`\\b${escapeRegExp(aliasLower)}${RESORT_SUFFIX_TAIL}\\b`, 'i'));
    matches.push({
      alias: aliasLower,
      canonical: canonicalResort,
      matchedLength: resortPhraseMatch?.[0].length ?? aliasLower.length,
      // A bare "Animal Kingdom" should mean the park; "Animal Kingdom
      // Lodge" wins as the resort because matchedLength includes "Lodge".
      priority: 1,
      strip: (value) => stripResortPhrase(value, aliasLower),
    });
  }

  matches.sort((a, b) => b.matchedLength - a.matchedLength || b.priority - a.priority);
  const best = matches[0];
  if (best) return { park: best.canonical, withoutPark: best.strip(query) };
  return { park: null, withoutPark: query };
}

// Allergen/dietary detection -- owner request 2026-07-31, next big effort
// after location scoping. Deliberately requires an explicit qualifier
// ("free"/"friendly"/"allergy"/"allergic") alongside the allergen word,
// never a bare food noun alone: "milk"/"egg"/"fish"/"soy"/"wheat" are all
// real, common food words in their own right ("where can I get fish in
// Epcot" must stay a literal food query), and silently consuming one of
// them as an allergen filter would both break that query AND misfire as
// an allergy answer nobody asked for -- a much worse failure mode here
// than elsewhere in this file, given what's actually at stake if it's
// wrong. "peanut"/"gluten"/"sesame"/"shellfish"/"tree nut" aren't real
// standalone food nouns the same way, but are still required to pair with
// a qualifier for consistency and to avoid ever guessing.
//
// Keys match ALLERGEN_FILTER_KEYS in src/search/filters.ts exactly --
// executor.ts checks the real per-item `allergens` field these key names
// come from, the same field that already backs the app's own Find tab
// dietary filter chips (see itemMatchesDietary() there). Never redefine
// the allergen taxonomy here; only ever detect which of the app's own
// existing keys a query is asking about.
//
// Bare "nut"/"nuts free" (no "tree" qualifier) is a genuinely ambiguous
// phrase in casual speech -- Disney's own labeling keeps peanut and tree
// nut as two independent allergens, and a person could have either or
// both. Mapping it to BOTH keys (checked with AND semantics downstream in
// executor.ts, not OR) is the only safe reading: an item labeled
// peanut-friendly but not tree-nut-friendly must never be shown as
// "nut-free" just because it matched one of the two, since that would be
// a false, potentially dangerous reassurance for whichever allergy the
// asker actually has. Checked before the bare-nut pattern so "tree nut
// free" resolves to the single, specific key instead.
interface AllergenPattern {
  keys: string[];
  regex: RegExp;
}
const ALLERGEN_PATTERNS: AllergenPattern[] = [
  { keys: ['gluten-wheat'], regex: /\bgluten[\s-]?(?:free|friendly)\b|\bwheat[\s-]?(?:free|friendly)\b|\bgluten\s+allerg(?:y|ic)\b|\bceliac\b/i },
  { keys: ['milk'], regex: /\b(?:milk|dairy|lactose)[\s-]?(?:free|friendly)\b|\b(?:milk|dairy|lactose)\s+allerg(?:y|ic)\b/i },
  { keys: ['egg'], regex: /\beggs?[\s-]?(?:free|friendly)\b|\begg\s+allerg(?:y|ic)\b/i },
  { keys: ['soy'], regex: /\bsoy[\s-]?(?:free|friendly)\b|\bsoy\s+allerg(?:y|ic)\b/i },
  { keys: ['sesame'], regex: /\bsesame[\s-]?(?:free|friendly)\b|\bsesame\s+allerg(?:y|ic)\b/i },
  { keys: ['peanut'], regex: /\bpeanuts?[\s-]?(?:free|friendly)\b|\bpeanut\s+allerg(?:y|ic)\b/i },
  { keys: ['tree-nut'], regex: /\btree[\s-]?nuts?[\s-]?(?:free|friendly)\b|\btree[\s-]?nut\s+allerg(?:y|ic)\b/i },
  { keys: ['peanut', 'tree-nut'], regex: /\bnuts?[\s-]?(?:free|friendly)\b|\bnut\s+allerg(?:y|ic)\b/i },
  { keys: ['fish'], regex: /\bfish[\s-]?(?:free|friendly)\b|\bfish\s+allerg(?:y|ic)\b/i },
  { keys: ['shellfish'], regex: /\bshellfish[\s-]?(?:free|friendly)\b|\bshellfish\s+allerg(?:y|ic)\b/i },
  { keys: ['allergy-friendly'], regex: /\ballergy[\s-]?friendly\b|\ballergy[\s-]?free\b|\ballergen[\s-]?free\b/i },
];

function extractAllergenFilter(query: string): { allergenKeys: string[] | null; withoutAllergen: string } {
  const foundKeys = new Set<string>();
  let withoutAllergen = query;
  for (const pattern of ALLERGEN_PATTERNS) {
    const { keys, regex } = pattern;
    const match = withoutAllergen.match(regex);
    if (!match || match.index === undefined) continue;
    for (const key of keys) foundKeys.add(key);
    withoutAllergen = (
      withoutAllergen.slice(0, match.index) +
      ' ' +
      withoutAllergen.slice(match.index + match[0].length)
    )
      .replace(/\s+/g, ' ')
      .trim();
  }
  return { allergenKeys: foundKeys.size > 0 ? Array.from(foundKeys) : null, withoutAllergen };
}

// Generic nouns that mean "no specific dish was named" once an allergen
// phrase has already been stripped out of "does X have gluten free
// options" -- "options" is what's left of the object, not a food term, so
// this must resolve to a restaurant-wide allergy listing (queryType
// 'allergyList'), not a single-item existence check for something named
// "options".
const GENERIC_OPTION_WORDS = new Set([
  'option', 'options', 'item', 'items', 'dish', 'dishes', 'thing', 'anything', 'food', 'menu', 'choice', 'choices',
]);

// "what gluten-free options does Be Our Guest have" / "what's dairy-free
// at Be Our Guest" -- only tried once ALLERGEN_PATTERNS already found an
// allergen phrase (see classifyRuleBased): "what ... does X have"/"what's
// at X" are too generic to safely fire on an ordinary query otherwise.
// Non-greedy `(?:\w+\s+){0,3}?` tolerates 1-3 filler words between "what"
// and the anchor word -- found live: "what options does Be Our Guest
// have" failed to match a rigid "what does X have" shape, since "options"
// (the generic noun left over once the allergen phrase itself was already
// stripped out above) sits between them.
const ALLERGY_LIST_PATTERNS: RegExp[] = [
  /^what\s+(?:\w+\s+){0,3}?(?:does|do)\s+(.+?)\s+have\??$/i,
  /^what(?:'s|\s+is|\s+are)?\s+(?:\w+\s+){0,3}?(?:available\s+)?(?:at|for)\s+(.+?)\??$/i,
  /^(?:is|are)\s+there\s+(?:anything|any\s+(?:options?|items?|food))\s+(?:available\s+)?at\s+(.+?)\??$/i,
];

// Once an explicit allergen phrase has been removed, these are requests for
// every Disney-labeled option in the current location scope, not searches for
// a menu item literally named "food", "options", or "accommodate".
const GENERIC_ALLERGY_SCOPE_PATTERN =
  /^(?:(?:what|which)\s+(?:restaurants?|places?|locations?)\s+can\s+(?:accommodate|handle)(?:\s+(?:an?|the))?|(?:where\s+can\s+i\s+(?:get|find)|show\s+me|list|find|what(?:\s+are|\s+is)?|are\s+there|is\s+there)?\s*(?:any|anything|all)?\s*(?:restaurants?|places?|locations?|food|options?|items?|choices?)?\s*(?:are|is)?\s*(?:available)?)\s*[?.!]*$/i;

// Positional patterns for common hours phrasings, tried before stopword-
// stripping. Necessary, not just nicer: "what time does 50's Prime Time
// Cafe close" has "time" doing double duty as both the trigger word
// ("what TIME does...") and part of the real name ("Prime TIME Cafe") --
// no stopword set can get both right by word identity alone, but the
// sentence *position* can, since the trigger phrase is always a fixed
// bookend and the name is always what's between/after it.
const HOURS_PATTERNS: RegExp[] = [
  /^what time (?:does|is|do)\s+(.+?)\s+(?:close|closes|closing|open|opens|opening)s?(?:\s+(?:today|tomorrow))?\??$/i,
  /^when (?:does|do|is)\s+(.+?)\s+(?:open|close|opens|closes|opening|closing)(?:\s+(?:today|tomorrow))?\??$/i,
  /^(?:is|are)\s+(.+?)\s+(?:still\s+)?open(?:\s+(?:right\s+)?now)?\??$/i,
  /^still open at\s+(.+?)\??$/i,
  /^what (?:are|is)\s+(.+?)\s+hours\??$/i,
  /^(?:business|operating) hours (?:for|at)\s+(.+?)\??$/i,
];

function extractHoursPatternName(query: string): string | null {
  const trimmed = query.trim();
  for (const pattern of HOURS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

// Owner-reported gap 2026-07-31: "what time does Casey's Corner open
// tomorrow" always answered with TODAY's hours -- "tomorrow" is (rightly)
// in CORE_STOPWORDS so it never corrupts restaurant-name extraction, but
// that also meant it was silently discarded with no signal ever reaching
// executor.ts. Checked independently of name extraction (not stripped
// from the query first) since it doesn't need to be removed for any
// pattern/residual match above to work correctly -- it's just never been
// read. Deliberately narrow to "tomorrow" only, matching what was asked;
// hoursData's rolling window supports further-out days too (see
// getStatusForDayOffset in src/data/hoursStatus.ts) but this doesn't
// guess at "Tuesday"/"in 3 days" phrasings that weren't reported.
function detectDayOffset(query: string): number {
  return /\btomorrow\b/i.test(query) ? 1 : 0;
}

// Three-tier: try the positional pattern above first (handles the "Prime
// Time Cafe" class of collision correctly); then the aggressive stopword
// residual (intent words stripped, correct for the overwhelmingly common
// case); then a gentle residual (intent words kept) as a last resort for
// phrasings none of the patterns anticipated.
// Found live (owner-reported 2026-07-31): "does cosmic rays have
// hamburgers" failed to resolve a restaurant at all -- "cosmic rays" (a
// common, natural way to drop a possessive apostrophe when typing
// quickly) isn't a substring/prefix/fuzzy match of "Cosmic Ray's Starlight
// Café", because normalizeForSearch() (src/data/diacritics.ts) only
// strips diacritics, never touches apostrophes, and rank.ts's fuzzy
// fallback compares the whole query against individual NAME TOKENS
// (short words like "ray", "s"), not against the query as a phrase -- so
// an 11-character query like "cosmic rays" is never close enough to any
// single short token to trigger it. Restoring a plausible possessive
// apostrophe before a trailing "s" and trying that too closes this
// specific, common gap without a general spell-checker.
//
// Owner-reported gap 2026-07-31: "does caseys corner have hot dogs" still
// failed -- the original version only ever restored an apostrophe on the
// LAST word of the candidate, which is exactly backwards for "Casey's
// Corner" (the possessive word is FIRST here, not last; "corner" doesn't
// end in "s" so nothing was ever attempted). Real restaurant names put the
// possessive word in different positions ("Casey's Corner" vs "Cosmic
// Ray's Starlight Café" vs "Trader Sam's Grog Grotto", where it's neither
// first nor last), so this now tries restoring a bare trailing "s" into
// "'s" at EACH word position independently, one at a time, rather than
// assuming it's always the last word -- consistent with this file's
// "never invent, only confirm against real data" rule: every candidate
// variant is just a guess until isRealRestaurant() below confirms it.
function restorePossessiveApostropheVariants(candidate: string): string[] {
  const words = candidate.trim().split(/\s+/);
  const variants: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length > 1 && !w.includes("'") && /s$/i.test(w)) {
      const withApostrophe = [...words];
      withApostrophe[i] = `${w.slice(0, -1)}'s`;
      variants.push(withApostrophe.join(' '));
    }
  }
  return variants;
}

// `strict` (default off, unchanged behavior everywhere already using this)
// requires an exact or prefix match (rank.ts's tiers 0/2) -- added for the
// bare-noun-phrase fallback in classifyRuleBased below, found live
// (owner-reported stress test, 2026-07-31): with no explicit signal the
// user meant a restaurant at all (no "does X have Y"/hours phrasing, just
// an unrecognized bare word), a short/generic word can coincidentally
// match some real restaurant name with nothing else backing that guess --
// "test" alone fuzzy-matched "Tiffins Restaurant" (fixed by excluding the
// fuzzy tier); "food" and "ok" still matched "Good's Food to Go" and
// "Capt. Cook's" as plain SUBSTRINGS (tier 5) -- a real textual match, but
// just as coincidental and just as wrong a guess at what a bare one-word
// query meant. Every OTHER caller here already has an explicit
// restaurant-lookup signal from the sentence shape itself (the
// HAS_ITEM_PATTERN/hours phrasing that got it here in the first place),
// so fuzzy/substring tolerance stays appropriate there and is left alone.
function isRealRestaurant(candidate: string, data: LoadedData, strict = false): boolean {
  if (!candidate) return false;
  const results = search(candidate, data.restaurants, data.searchIndex).filter((r) => r.kind === 'restaurant');
  if (!strict) return results.length > 0;
  return results.some((r) => r.tier === 0 || r.tier === 2);
}

// Tries a candidate restaurant-name string, then each possessive-
// apostrophe variant (one word restored at a time) if the plain form
// doesn't resolve to anything real.
function tryRestaurantCandidate(candidate: string, data: LoadedData, strict = false): string | null {
  // Guests naturally type restaurant-name connectors interchangeably
  // ("Salt and Straw" vs the published "Salt & Straw"). These variants
  // are only accepted after confirming them against a real restaurant.
  const connectorVariants = Array.from(
    new Set([candidate, candidate.replace(/\s+and\s+/gi, ' & '), candidate.replace(/\s*&\s*/g, ' and ')])
  );
  for (const connectorVariant of connectorVariants) {
    if (isRealRestaurant(connectorVariant, data, strict)) return connectorVariant;
    for (const variant of restorePossessiveApostropheVariants(connectorVariant)) {
      if (isRealRestaurant(variant, data, strict)) return variant;
    }
  }
  return null;
}

function restaurantResidual(query: string, data: LoadedData, strict = false): string | null {
  const patternMatch = extractHoursPatternName(query);
  if (patternMatch) {
    const resolved = tryRestaurantCandidate(patternMatch, data, strict);
    if (resolved) return resolved;
  }
  const aggressive = buildResidual(query, INTENT_STOPWORDS);
  if (aggressive) {
    const resolved = tryRestaurantCandidate(aggressive, data, strict);
    if (resolved) return resolved;
  }
  const gentle = buildResidual(query, new Set());
  if (gentle) {
    const resolved = tryRestaurantCandidate(gentle, data, strict);
    if (resolved) return resolved;
  }
  return null;
}

// Owner-reported gap 2026-07-31: "does X have Y" is structurally different
// from every other query so far -- given a NAMED restaurant, check
// something about it, rather than given a food term, find restaurants.
// Two sub-cases share this one pattern: "does cosmic ray's have
// hamburgers" (a menu-item check) vs. "does cosmic ray's have mobile
// order" (a restaurant-attribute check) -- disambiguated by whether the
// captured object matches a known attribute phrase (see
// RESTAURANT_ATTRIBUTES below); attribute is checked first since it's the
// more specific case.
const HAS_ITEM_PATTERN = /^does\s+(.+?)\s+(?:have|sell|serve)\s+(.+?)\??$/i;
// "how far is X" / "how far away is X" -- distance to a NAMED restaurant,
// not "nearest place with X". A different question from "nearest", which
// finds the closest restaurant serving some item; this assumes the
// restaurant and just wants the distance.
const DISTANCE_PATTERN = /^how far(?:\s+away)?\s+is\s+(.+?)\??$/i;
const MENU_PATTERNS = [
  /^(?:what(?:'s| is) on (?:the )?menu at|show me (?:the )?menu (?:at|for))\s+(.+?)(?:\s+right now)?\??$/i,
  /^what does\s+(.+?)\s+have on (?:the )?menu\??$/i,
];
const RESERVATION_HANDOFF_PATTERN = /\b(?:reservation|book)\b[\s\S]*?\b(?:for|at)\s+(.+?)(?:\s+(?:today|tonight|right now))?\??$/i;
const WALKUP_HANDOFF_PATTERNS = [
  /^is\s+(.+?)\s+walk[\s-]?up(?:\s+only)?(?:\s+right now)?\??$/i,
  /^is there (?:a )?(?:wait|walk[\s-]?up)\s*list option for\s+(.+?)(?:\s+today)?\??$/i,
];
const GLOBAL_ATTRIBUTE_PATTERN = /\b(?:what|which)\s+(?:(quick\s+service)\s+)?(?:places|restaurants)\b[\s\S]*?\b(mobile\s*order|walk[\s-]?up|wait\s*list)\b/i;
const WHERE_MOBILE_ORDER_PATTERN = /\bwhere\b[\s\S]*?\bmobile\s*order\b/i;

function normalizeQueryTypography(query: string): string {
  return query
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, '-')
    .replace(/\bquick[\s-]+service\b/gi, 'quick service');
}

// Real, structured boolean/fact fields confirmed present in the live data
// (owner-reported 2026-07-31, explicitly flagged as "outside current scope
// but in the data"): `restaurant.has_walkup_list` is a direct field;
// "Mobile Orders" appears as a `raw_facets` entry (group: "features", id:
// "mobile-orders") when a restaurant supports it; `accepts_reservations`
// is also a direct field, added as a natural third case even though not
// explicitly requested. See executor.ts's `attribute` branch for how each
// key resolves to a real fact.
const RESTAURANT_ATTRIBUTES: { pattern: RegExp; key: string; label: string }[] = [
  { pattern: /mobile\s*order(ing)?s?/i, key: 'mobile_order', label: 'Mobile Order' },
  { pattern: /walk[\s-]?up\s*lists?/i, key: 'walkup_list', label: 'a Walk-Up List' },
  { pattern: /reservations?/i, key: 'reservations', label: 'Reservations' },
];

function matchAttribute(text: string): { key: string; label: string } | null {
  for (const attr of RESTAURANT_ATTRIBUTES) {
    if (attr.pattern.test(text)) return { key: attr.key, label: attr.label };
  }
  return null;
}

// Given a candidate substring already isolated by an outer pattern (e.g.
// the "cosmic rays" in "does cosmic rays have hamburgers"), confirm it
// against real restaurant names -- same "never invent a name" property as
// the rest of this classifier. Tries the core-stopword-stripped form first
// (handles a leading "the"), then the raw candidate as a fallback.
function resolveRestaurantName(candidate: string, data: LoadedData): string | null {
  const cleaned = buildResidual(candidate, new Set());
  for (const c of [cleaned, candidate.trim()]) {
    const resolved = tryRestaurantCandidate(c, data);
    if (resolved) return resolved;
  }
  return null;
}

// service_style aliases -- owner-reported 2026-07-31: "where's the closest
// quickservice" should find the nearest restaurant of that service type,
// not try (and fail) to match "quickservice" as a food item. Canonical
// values confirmed directly from the live data's real `service_style`
// field: null, "Quick Service", "A la Carte", "Prix Fixe", "Buffet",
// "Table Service", "Family Style".
const SERVICE_STYLE_ALIASES: [string, string][] = [
  ['quickservice', 'Quick Service'],
  ['quick service', 'Quick Service'],
  ['tableservice', 'Table Service'],
  ['table service', 'Table Service'],
  ['alacarte', 'A la Carte'],
  ['a la carte', 'A la Carte'],
  ['prixfixe', 'Prix Fixe'],
  ['prix fixe', 'Prix Fixe'],
  ['buffet', 'Buffet'],
  ['familystyle', 'Family Style'],
  ['family style', 'Family Style'],
];

function matchServiceStyle(term: string): string | null {
  const collapsed = term.toLowerCase().trim();
  for (const [alias, canonical] of SERVICE_STYLE_ALIASES) {
    if (collapsed === alias || collapsed.replace(/\s+/g, '') === alias.replace(/\s+/g, '')) return canonical;
  }
  return null;
}

// cuisine aliases -- owner request 2026-07-31 ("where's the closest
// american..."): `restaurant.cuisine_tags` is real, already-shipped
// restaurant-level metadata (confirmed live: 25 distinct real values --
// american, italian, mexican, bbq, steakhouse, seafood, etc.), the exact
// taxonomy that already backs the real Find tab's cuisine filter chips
// (collectFilterOptions() in src/search/filters.ts). Mostly a direct 1:1
// lowercase match against those real tag values, plus a handful of
// natural spelling/naming variants confirmed to have no exact tag of
// their own (barbecue/barbeque -> the real "bbq" tag; steak -> the real
// "steakhouse" tag; sushi -> "japanese", the closest real tag; english ->
// "british"; hawaiian -> "polynesian", Disney's own term for its
// Polynesian-themed dining). Deliberately does NOT guess a mapping for
// cuisines with no reasonably confident real-tag equivalent (e.g. "thai"
// -- there's no real tag for it, and folding it into "asian" would be a
// much coarser claim than the specific one asked for) -- same
// never-invent rule as everywhere else in this file; an unmapped cuisine
// word just falls through to ordinary item-name matching instead.
const CUISINE_ALIASES: [string, string][] = [
  ['american', 'american'], ['italian', 'italian'], ['mexican', 'mexican'], ['chinese', 'chinese'],
  ['japanese', 'japanese'], ['indian', 'indian'], ['french', 'french'], ['german', 'german'],
  ['spanish', 'spanish'], ['greek', 'greek'], ['mediterranean', 'mediterranean'], ['caribbean', 'caribbean'],
  ['african', 'african'], ['asian', 'asian'], ['bakery', 'bakery'], ['bbq', 'bbq'], ['british', 'british'],
  ['californian', 'californian'], ['international', 'international'], ['irish', 'irish'], ['latin', 'latin'],
  ['norwegian', 'norwegian'], ['polynesian', 'polynesian'], ['seafood', 'seafood'], ['steakhouse', 'steakhouse'],
  ['barbecue', 'bbq'], ['barbeque', 'bbq'], ['steak', 'steakhouse'], ['sushi', 'japanese'],
  ['english', 'british'], ['hawaiian', 'polynesian'],
];

function matchCuisine(term: string): string | null {
  const collapsed = term.toLowerCase().trim();
  for (const [alias, canonical] of CUISINE_ALIASES) {
    if (collapsed === alias) return canonical;
  }
  return null;
}

// Order matters: checked most-specific-first. Proximity ("closest"/
// "nearby") outranks generic list phrasing ("where can I get") on purpose,
// same distinction the LLM instructions draw -- "where can I get a corn
// dog nearby" should be nearest, not list, because of "nearby".
function detectIntent(query: string): QueryType {
  const q = query.toLowerCase();
  // Duration language is not a restaurant-hours request. Without removing
  // it, "I have an hour near Test Track" is stolen by the bare `hour`
  // signal below and returns an unrelated restaurant schedule.
  const hoursSignalText = q.replace(/\b(?:an|one|1|two|2|half an)\s+hours?\b/g, ' ');
  // Any one of these alone is a strong enough hours signal on its own --
  // requiring open/close paired with "hours"/"what time" (an earlier,
  // stricter version of this check) missed real phrasings like "what are
  // Cosmic Ray's hours" (has "hours", no open/close) and "still open at
  // Trader Sam's?" (has "open", no "is").
  // Found live (owner-reported stress test, 2026-07-31): "what's close to
  // Test Track" / "is there anything close to Soarin'" were misread as
  // hours questions ("close" as in "shut," not "close" as in "nearby") --
  // one case fuzzy-matched "Soarin'" to "Roaring Fork" and confidently
  // returned ITS hours, a wrong, confident answer to a proximity question.
  // Bare "close" no longer counts as an hours signal when immediately
  // followed by "to"/"by" (the proximity construction); "closes"/"closed"
  // are unambiguous either way and still always count.
  const hasHoursPhrase =
    /\bwhat time\b|\bwhen (does|do|is)\b|\bhours?\b|\b(business|operating) hours\b|\bstill open\b|^(?:is|are)\b[\s\S]*\b(?:open|closed)\b|\b(?:open|closed) (?:right )?now\b|\bclose[sd]\b|\bclosing\b|\bopening\b/.test(
      hoursSignalText
    );
  if (hasHoursPhrase) return 'hours';

  if (/\bcheap(est|er)?\b|\blowest price\b|\bleast expensive\b/.test(q)) return 'cheapest';
  // "close to"/"close by" (without "me") added alongside the hours-false-
  // positive fix above -- same proximity meaning, now correctly read as a
  // location signal instead of falling through unrecognized. Real
  // attraction names ("Test Track," "Soarin'") aren't in this data at all,
  // so this still can't answer an attraction-proximity question, but it
  // now declines honestly (real item validation downstream, "no real
  // match") instead of confidently answering a wrong restaurant's hours.
  if (/\bclosest\b|\bnearest\b|\bnear me\b|\bnearby\b|\bclose to\b|\bclose by\b/.test(q)) return 'nearest';
  // Loosened from a fixed "where can i get" phrase -- real queries reorder
  // this ("where I can get", "any idea where I can find") more than a
  // rigid phrase match tolerates. "where" + "get"/"find" anywhere in the
  // query is enough; it's checked after cheapest/nearest so it can't steal
  // a query that already matched a more specific signal.
  // Owner-reported gap 2026-07-31: "where can I eat a hot dog" returned
  // unsupported -- "eat" (and "have"/"try") are just as real a way to ask
  // "where can I get X" as "get"/"find" are.
  if (/\bwhere\b/.test(q) && /\b(get|find|eat|have|try)\b/.test(q)) {
    return 'list';
  }
  if (/\b(?:what|which) places?\b|\b(?:what|which) restaurants\b|\beverywhere\b|\ball the places\b/.test(q)) return 'list';
  // Owner-reported gap 2026-07-31: desire/need statements ("I need a
  // beer", "I'm hungry for a hamburger") carry the same "show me where to
  // get this" intent as "where can I get X", without ever saying "where"
  // at all. Checked after every more specific signal above, so it can't
  // steal a query that already matched cheapest/nearest/an explicit
  // "where" phrase.
  if (/\bhungry for\b|\bcraving\b|\bi need\b|\bi want\b|\bi(?:'d| would) like\b|\bneed a\b|\bwant a\b/.test(q)) return 'list';
  // "is there a nut-free ice cream" -- owner-reported gap 2026-07-31,
  // found while adding allergen support: this existence-check phrasing
  // carries the same "show me where to get this" intent as "where can I
  // get X". Safe to check this generically (not just for allergen
  // queries) since hasHoursPhrase above already returns early on any
  // "is ... open/closed" phrasing -- reaching this line already means
  // "is" isn't being used to ask about hours.
  if (/\bis there\b|\bis it available\b/.test(q)) return 'list';
  // Elliptical "where's X"/"where is X" (no verb at all) -- found live:
  // "where's popcorn?" returned unsupported because it has "where" but no
  // recognized verb. Checked last, as a bare "where" fallback, so it never
  // preempts a more specific match above.
  if (/\bwhere\b/.test(q)) return 'list';
  return 'unsupported';
}

function detectHoursMode(query: string): 'openNow' | 'schedule' {
  return /\b(?:right now|currently|still open|open now|closed now)\b|^(?:is|are)\b[\s\S]*\b(?:open|closed)\b/i.test(query)
    ? 'openNow'
    : 'schedule';
}

// Explicitly out-of-domain sentence shapes are rejected before any menu
// vocabulary matching. A phrase can be present in real menu data and still
// be used for a non-food question ("who is Mickey Mouse" is the canonical
// example); entity overlap alone is not proof of dining intent.
function isExplicitlyOffTopic(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (/\bweather\b|\bforecast\b|\btemperature\b/.test(q)) return true;
  if (/^(?:who|why)\b/.test(q)) return true;
  if (/\b(?:wait time|ride wait|show time|parade time|fireworks time)\b/.test(q)) return true;
  if (
    /\b(?:what time|when) (?:does|do|is) (?:the )?(?:park|magic kingdom|epcot|animal kingdom|hollywood studios)\b[\s\S]*\b(?:open|close)/.test(q) ||
    /^(?:is|are) (?:the )?(?:park|magic kingdom|epcot|animal kingdom|hollywood studios)\b[\s\S]*\b(?:open|closed)/.test(q)
  ) {
    return true;
  }
  return false;
}

function intentClarification(query: string, data: LoadedData): ClassifiedQuery['clarification'] | null {
  const q = query.toLowerCase();
  const wantsCheapest = /\bcheap(?:est|er)?\b|\blowest price\b|\bleast expensive\b/.test(q);
  const wantsNearest = /\bclosest\b|\bnearest\b|\bnear me\b|\bnearby\b/.test(q);
  if (!wantsCheapest || !wantsNearest) return null;
  const { park, withoutPark } = extractParkFilter(query, data);
  const { allergenKeys, withoutAllergen } = extractAllergenFilter(withoutPark);
  const normalized = normalizeCompoundWords(withoutAllergen);
  const item = itemResidual(normalized);
  const compound = splitCompoundItems(normalized);
  const makeNextQuery = (queryType: 'cheapest' | 'nearest'): ClassifiedQuery => ({
    queryType,
    item: item || null,
    items: compound?.items ?? null,
    compoundMode: compound?.mode,
    restaurantName: null,
    park,
    allergenKeys,
  });
  return {
    kind: 'intent',
    prompt: 'Would you like the cheapest match or the closest match?',
    options: [
      { label: 'Cheapest', value: 'cheapest', nextQuery: makeNextQuery('cheapest') },
      { label: 'Closest', value: 'nearest', nextQuery: makeNextQuery('nearest') },
    ],
  };
}

export function classifyRuleBased(query: string, data: LoadedData): ClassifiedQuery {
  query = normalizeQueryTypography(query);
  if (isExplicitlyOffTopic(query)) {
    return { queryType: 'unsupported', item: null, items: null, restaurantName: null, park: null };
  }

  const clarification = intentClarification(query, data);
  if (clarification) {
    return { queryType: 'clarification', item: null, items: null, restaurantName: null, park: null, clarification };
  }

  const { park, withoutPark } = extractParkFilter(query, data);
  const { allergenKeys, withoutAllergen } = extractAllergenFilter(withoutPark);
  const trimmed = withoutAllergen.trim();
  // Read before SUBJECTIVE_PATTERN's own words get stripped out of any
  // residual below (they're already in INTENT_STOPWORDS) -- see the
  // pattern's own comment for why this can't answer "what's best" but can
  // still fall back to a real, grounded substitute.
  const subjective = SUBJECTIVE_PATTERN.test(trimmed) || undefined;

  for (const pattern of MENU_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const restaurantName = resolveRestaurantName(match[1], data);
    return { queryType: 'menu', item: null, items: null, restaurantName, park: null };
  }

  const reservationHandoff = trimmed.match(RESERVATION_HANDOFF_PATTERN);
  if (reservationHandoff) {
    const restaurantName = resolveRestaurantName(reservationHandoff[1], data);
    return {
      queryType: 'attribute',
      item: null,
      items: null,
      restaurantName,
      park: null,
      attribute: 'reservations',
      liveAvailability: true,
    };
  }

  for (const pattern of WALKUP_HANDOFF_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const restaurantName = resolveRestaurantName(match[1], data);
    return {
      queryType: 'attribute',
      item: null,
      items: null,
      restaurantName,
      park: null,
      attribute: 'walkup_list',
      liveAvailability: true,
    };
  }

  const globalAttribute = trimmed.match(GLOBAL_ATTRIBUTE_PATTERN);
  const whereMobileOrder = WHERE_MOBILE_ORDER_PATTERN.test(trimmed);
  if (globalAttribute || whereMobileOrder) {
    const attribute = whereMobileOrder || /mobile/i.test(globalAttribute?.[2] ?? '') ? 'mobile_order' : 'walkup_list';
    return {
      queryType: 'attributeList',
      item: null,
      items: null,
      restaurantName: null,
      park,
      attribute,
      serviceStyle: globalAttribute?.[1] ? 'Quick Service' : null,
      liveAvailability: /right now|available|availability|current/i.test(trimmed),
    };
  }

  // "what gluten-free options does Be Our Guest have" -- checked before
  // HAS_ITEM_PATTERN since it's a distinct shape (no "does X have Y", just
  // "what does X have"/"what's at X"), and only tried when an allergen
  // phrase was actually found just above -- these patterns are too generic
  // to safely fire on an ordinary query otherwise.
  if (allergenKeys) {
    for (const pattern of ALLERGY_LIST_PATTERNS) {
      const match = trimmed.match(pattern);
      if (!match) continue;
      const restaurantName = resolveRestaurantName(match[1], data);
      return { queryType: 'allergyList', item: null, items: null, restaurantName, park, allergenKeys };
    }
    if (GENERIC_ALLERGY_SCOPE_PATTERN.test(trimmed)) {
      return {
        queryType: 'allergyList',
        item: null,
        items: null,
        restaurantName: null,
        park,
        allergenKeys,
      };
    }
  }

  // "does X have/sell/serve Y" -- checked before generic intent detection
  // since it's a distinctive, anchored pattern nothing else would
  // accidentally match. Sub-cases share this one pattern: a real
  // restaurant-fact check ("mobile order", "walk-up list", "reservations")
  // vs. a menu-item check vs. (owner request 2026-07-31) an allergy-listing
  // check ("does X have gluten free options") -- disambiguated by whether
  // the captured object matches a known attribute phrase, or (once an
  // allergen phrase has already been stripped out above) reduces to a
  // generic noun rather than naming any real food.
  const hasItemMatch = trimmed.match(HAS_ITEM_PATTERN);
  if (hasItemMatch) {
    const [, restaurantPart, objectPart] = hasItemMatch;
    const restaurantName = resolveRestaurantName(restaurantPart, data);
    const attr = matchAttribute(objectPart);
    if (attr && !allergenKeys) {
      return { queryType: 'attribute', item: null, items: null, restaurantName, park: null, attribute: attr.key };
    }
    const objectResidual = itemResidual(normalizeCompoundWords(objectPart));
    if (allergenKeys && (!objectResidual || GENERIC_OPTION_WORDS.has(objectResidual))) {
      return { queryType: 'allergyList', item: null, items: null, restaurantName, park: null, allergenKeys };
    }
    return { queryType: 'hasItem', item: objectResidual || null, items: null, restaurantName, park: null, allergenKeys };
  }

  // "how far is X" -- distance to a NAMED restaurant, different question
  // from "nearest X" (closest restaurant serving some item).
  const distanceMatch = trimmed.match(DISTANCE_PATTERN);
  if (distanceMatch) {
    const restaurantName = resolveRestaurantName(distanceMatch[1], data);
    return { queryType: 'distance', item: null, items: null, restaurantName, park: null };
  }

  let queryType = detectIntent(trimmed);
  if (queryType === 'unsupported') {
    // Owner-reported gap 2026-07-31 (stress test): no explicit trigger
    // phrase ("where can I get"/"cheapest"/etc) fired, but a real guest
    // very often just types the topic -- "turkey leg," "churros," "wine
    // bar," a bare restaurant name. Verified against real data before
    // building this: 24/28 bare food/cuisine phrases tested already
    // resolved to a correct, complete answer once given the chance --
    // the data was never the gap, only the requirement that a trigger
    // phrase be present first. Tried in this order, not the reverse:
    // "rose and crown" must resolve as the real restaurant, not get
    // split into a bogus compound item search for "rose" + "crown."
    // Both paths still go through the exact same real-data validation as
    // every other query type here (restaurantResidual only returns a
    // name confirmed real; the executor declines 'list' gracefully if
    // the item residual doesn't match anything) -- this never invents an
    // answer, it just gives a plausible guess the chance to be checked.
    // A recognized cuisine/service_style word always wins over the
    // restaurant-name guess below -- found live: "italian food" (no
    // "subjective" signal to gate it the way "good pizza" is) resolved
    // residual "italian" as a restaurant-name PREFIX/token match against
    // the real "Terralina Crafted Italian" before this ever got a chance
    // to recognize "italian" as the specific, well-defined cuisine
    // signal it actually is. A structured match here is strictly more
    // confident than a coincidental name-token match, so it's checked
    // first, not second.
    const bareItem = itemResidual(normalizeCompoundWords(trimmed));
    const bareServiceStyle = matchServiceStyle(bareItem);
    const bareCuisine = bareServiceStyle ? null : matchCuisine(bareItem);
    if (bareServiceStyle) {
      return { queryType: 'list', item: null, items: null, restaurantName: null, park, serviceStyle: bareServiceStyle, subjective };
    }
    if (bareCuisine) {
      return { queryType: 'list', item: null, items: null, restaurantName: null, park, cuisine: bareCuisine, subjective };
    }
    // Skipped entirely when `subjective` -- found live: "what's a good
    // pizza place in Epcot" has residual "pizza" left over once "good"/
    // "place" are stripped, and "pizza" is a genuine PREFIX of the real
    // restaurant "Pizzafari," so this resolved (confidently, and wrongly)
    // to Pizzafari's hours -- discarding the already-extracted Epcot park
    // filter entirely in the process, since a bare restaurant-name lookup
    // has nowhere to put one. A subjective/quality phrasing is a strong
    // signal the residual is a FOOD TERM being asked about generically
    // ("what's good/best X"), not a specific restaurant name being typed
    // -- go straight to the item path instead.
    // This fallback is for an actually bare restaurant name, not any
    // unsupported sentence that happens to contain one. The old residual
    // search turned "Can I still get a reservation for Cinderella's Royal
    // Table?" and "What's on the menu at Sci-Fi?" into hours answers.
    const bareRestaurantCandidate = trimmed.replace(/[?.!]+$/g, '').trim();
    const bareRestaurantName = subjective ? null : tryRestaurantCandidate(bareRestaurantCandidate, data, true);
    if (bareRestaurantName) {
      return {
        queryType: 'hours',
        item: null,
        items: null,
        restaurantName: bareRestaurantName,
        park: null,
        dayOffset: detectDayOffset(trimmed),
        hoursMode: detectHoursMode(trimmed),
        subjective,
      };
    }
    // Owner-reported bug 2026-07-31: "what's the weather today" answered
    // with 142 real locations for "weather" -- rank.ts's fuzzy tier
    // matched it against every real "Water" item (Bottled Water, Sparkling
    // Water, ...) purely by edit distance ("weather" -> "water" is 2
    // deletions, right at the fuzzy threshold for a 7-letter query), with
    // nothing else in the sentence suggesting food at all. Every other
    // query type here either has an explicit trigger phrase establishing
    // real food intent ("where can I get X") or gets checked against real
    // data before committing (restaurantResidual's strict tier just
    // above) -- this bare-item promotion was the one place that blindly
    // trusted the executor's full (fuzzy-inclusive) matcher to be the
    // sole judge of whether an arbitrary leftover word was ever food-
    // related in the first place. isPlausibleItemTerm is a cheap, non-
    // fuzzy sanity check (plain substring only) -- not the real match
    // itself, just a gate on whether it's even worth asking the question.
    const bareCompound = splitCompoundItems(normalizeCompoundWords(trimmed));
    if (bareCompound && bareCompound.items.every((term) => isPlausibleItemTerm(term, data))) {
      queryType = 'list';
    } else if (bareItem && isPlausibleItemTerm(bareItem, data)) {
      queryType = 'list';
    } else {
      return { queryType: 'unsupported', item: null, items: null, restaurantName: null, park: null, subjective };
    }
  }

  if (queryType === 'hours') {
    const restaurantName = restaurantResidual(trimmed, data);
    return {
      queryType,
      item: null,
      items: null,
      restaurantName,
      park: null,
      dayOffset: detectDayOffset(trimmed),
      hoursMode: detectHoursMode(trimmed),
    };
  }

  // cheapest/nearest/list all resolve one or more items -- validity is
  // confirmed by executor.ts's matchItems()/matchCompoundItems() downstream
  // either way, this is just the raw residual guess(es). `item` is always
  // the combined (unsplit) phrase; `items` is only populated when a
  // genuine 2+-segment compound split was found, letting the executor try
  // the combined single-dish interpretation first. Compound-word
  // normalization ("corndog" -> "corn dog") happens here, before both
  // extraction paths, so it applies uniformly to `item` and every
  // `items` segment.
  const normalized = normalizeCompoundWords(trimmed);
  const item = itemResidual(normalized);

  // "where's the closest quickservice" -- owner-reported 2026-07-31: the
  // extracted item term can itself name a service_style rather than a
  // food item. Checked here, after normal item extraction, so it doesn't
  // interfere with any of the extraction logic above.
  const serviceStyle = matchServiceStyle(item);
  if (serviceStyle) {
    return { queryType, item: null, items: null, restaurantName: null, park, serviceStyle };
  }

  // "where's the closest american restaurant" -- owner request 2026-07-31.
  // Same shape/priority as service_style just above: checked against the
  // extracted item term, and if it names a real cuisine rather than a
  // food item, this is a restaurant-attribute lookup, not a menu-item
  // search.
  const cuisine = matchCuisine(item);
  if (cuisine) {
    return { queryType, item: null, items: null, restaurantName: null, park, cuisine, subjective };
  }

  const compound = splitCompoundItems(normalized);
  return { queryType, item: item || null, items: compound?.items ?? null, compoundMode: compound?.mode, restaurantName: null, park, allergenKeys, subjective };
}
