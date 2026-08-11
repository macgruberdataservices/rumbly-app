// Terminal prototype of the "real executor" described as next-step #8 in
// Docs/ASK_RUMBLY_HANDOFF.md -- takes the classifier's raw output and, per
// Known issue #1's conclusion, NEVER trusts it directly. `item` is
// resolved through the same fuzzy search() used by the real Find tab
// (src/search/rank.ts) -- if it doesn't match a real menu item, there is
// no cheapest/nearest answer, regardless of what the model said. Same for
// `restaurantName` against real restaurant names. This is the validation
// layer the handoff doc calls "the load-bearing mitigation."

import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import { resortsShareGuestFacingFamily } from './location_aliases.ts';
import { search } from '../../../../src/search/rank.ts';
import { itemVisibleInSearch, ALLERGEN_LABELS, cuisineLabel } from '../../../../src/search/filters.ts';
import { getTodayStatus, getStatusForDayOffset } from '../../../../src/data/hoursStatus.ts';
import { normalizeForSearch } from '../../../../src/data/diacritics.ts';
import { parkDisplayName, DISNEY_SPRINGS_AREAS } from '../../../../src/data/locationNames.ts';
import { distanceToRestaurant, formatProximityDistance, type Coordinates } from '../../../../src/location/proximity.ts';
import type { MenuItem, Restaurant } from '../../../../src/data/types.ts';
import { ALLERGY_ACKNOWLEDGEMENT_VERSION } from '../../../../src/data/allergyPolicy.ts';

// Stand-in for real device GPS (Magic Kingdom main entrance) -- there's no
// location service in a terminal script. Real integration would take this
// from expo-location the same way the rest of the app does.
export const DEFAULT_ORIGIN: Coordinates = { latitude: 28.4177, longitude: -81.5812 };

export interface ClassifiedQuery {
  queryType: string;
  item: string | null;
  // Only populated when the classifier found a genuine 2+-item compound
  // split ("hot dog and a beer" -> ["hot dog", "beer"]) -- owner request
  // 2026-07-31. `item` is still always the combined, unsplit phrase, tried
  // first (see matchItemsForQuery below) so a real dish name that happens
  // to contain "and" (e.g. "Chicken and Waffles") isn't broken by an eager
  // split into two nonexistent items.
  items?: string[] | null;
  // Which connector produced `items` -- 'and' (intersection: a real
  // location must serve every listed item) or 'or' (union: serving any
  // ONE of them is enough) -- owner request 2026-07-31 ("pizza or
  // burgers"). Only meaningful when `items` is populated; defaults to
  // 'and' semantics if absent, matching this field's pre-existing
  // (intersection-only) behavior.
  compoundMode?: 'and' | 'or';
  restaurantName: string | null;
  // Theme/water park or Disney Springs filter ("in Magic Kingdom", "in
  // Epcot") -- owner request 2026-07-31. Applied as a post-filter on
  // matched candidates in every item-based query type.
  park?: string | null;
  // Present only for queryType === 'attribute' -- which restaurant.* fact
  // to check ("mobile_order" | "walkup_list" | "reservations"), owner
  // request 2026-07-31. See rule_classifier.ts's RESTAURANT_ATTRIBUTES for
  // the phrase->key mapping and this file's `attribute` branch for what
  // each key resolves to.
  attribute?: string | null;
  liveAvailability?: boolean;
  // Present only for cheapest/nearest/list when the extracted `item` term
  // actually named a service_style ("quickservice", "table service", ...)
  // rather than a food item -- owner request 2026-07-31 ("where's the
  // closest quickservice"). Canonical value matches restaurant.service_style
  // exactly (e.g. "Quick Service").
  serviceStyle?: string | null;
  // Present only for cheapest/nearest/list when the extracted `item` term
  // actually named a real cuisine ("american", "italian", ...) rather than
  // a food item -- owner request 2026-07-31 ("where's the closest
  // american restaurant"). Canonical value matches a real
  // restaurant.cuisine_tags entry exactly (see rule_classifier.ts's
  // CUISINE_ALIASES).
  cuisine?: string | null;
  // Present only for cheapest/nearest/list/hasItem/allergyList when the
  // query named an allergen ("gluten-free pizza", "does X have a
  // peanut-free burger", "what dairy-free options does X have") -- owner
  // request 2026-07-31. Keys match ALLERGEN_FILTER_KEYS in
  // src/search/filters.ts (the same taxonomy backing the app's own Find
  // tab dietary chips), plus the generic 'allergy-friendly' key for an
  // unqualified "allergy friendly" phrase. 2+ keys only for the
  // bare-"nut" case (see rule_classifier.ts's ALLERGEN_PATTERNS) --
  // combined with AND semantics downstream (itemSafeForAllergens), not
  // OR, since that ambiguous phrase must resolve safely for either a
  // peanut or a tree-nut allergy, not just one of the two.
  allergenKeys?: string[] | null;
  // Present only for queryType === 'hours' -- 0 (default/today) or 1
  // (tomorrow), owner request 2026-07-31. hoursData's rolling window
  // supports more than this, but nothing beyond "tomorrow" is detected
  // yet (see detectDayOffset in rule_classifier.ts).
  dayOffset?: number;
  // Distinguishes a live yes/no status question from a request for the
  // day's schedule. Without this, "is X open right now?" can only echo a
  // schedule and may sound affirmative even after the restaurant closed.
  hoursMode?: 'openNow' | 'schedule';
  // Set when the query itself contained subjective-quality language
  // ("best," "good," "recommend," ...) -- owner request 2026-07-31. This
  // app has no ratings/opinion data to answer "what's best" from, so
  // every answer/decline is prefixed with a hedge acknowledging that
  // instead of claiming an opinion it can't back up (see
  // SUBJECTIVE_PATTERN in rule_classifier.ts).
  subjective?: boolean;
  clarification?: {
    kind: 'intent' | 'restaurant' | 'location' | 'compound';
    prompt: string;
    options: Array<{ label: string; value: string; nextQuery?: ClassifiedQuery }>;
  };
  // Present only when queryType === 'error'. It is retained for compatibility
  // with historical classifier traces and is not emitted by the semantic path.
  errorMessage?: string;
}

export type ExecutorAction =
  | { kind: 'openRestaurant'; label: string; restaurantId: string }
  | { kind: 'openDisney'; label: string; url: string };

export type ExecutorResult =
  | { kind: 'answer'; text: string; restaurantIds?: string[]; itemIds?: string[]; actions?: ExecutorAction[] }
  | {
      kind: 'clarification';
      text: string;
      clarification: {
        kind: 'intent' | 'restaurant' | 'location' | 'compound';
        options: Array<{ label: string; value: string; nextQuery?: ClassifiedQuery }>;
      };
    }
  | { kind: 'no-match'; text: string }
  | { kind: 'unsupported'; text: string }
  | { kind: 'error'; text: string };

export type AllergyAwareExecutorResult = ExecutorResult & {
  safety?: {
    kind: 'allergy';
    acknowledgementVersion: number;
    allergenKeys: string[];
  };
};

interface ItemCandidate {
  item: MenuItem;
  restaurant: Restaurant;
}

// These indexes are derived once per loaded dataset and shared by every
// query. Rebuilding 45k-entry maps inside each matcher dominated latency
// and created avoidable memory churn in the original prototype.
const restaurantMapCache = new WeakMap<Restaurant[], Map<string, Restaurant>>();
const menuItemMapCache = new WeakMap<MenuItem[], Map<string, MenuItem>>();

function restaurantMap(restaurants: Restaurant[]): Map<string, Restaurant> {
  let cached = restaurantMapCache.get(restaurants);
  if (!cached) {
    cached = new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant]));
    restaurantMapCache.set(restaurants, cached);
  }
  return cached;
}

function menuItemMap(menuItems: MenuItem[]): Map<string, MenuItem> {
  let cached = menuItemMapCache.get(menuItems);
  if (!cached) {
    cached = new Map(menuItems.map((item) => [`${item.restaurant_id}:${item.item_id}`, item]));
    menuItemMapCache.set(menuItems, cached);
  }
  return cached;
}

// Real menu items are often branded rather than generically named (e.g.
// "Goose Island IPA", not "Beer") -- plain name search() either misses
// them entirely for a generic term like "beer", or worse, false-positives
// on unrelated dishes that happen to contain the word (found live:
// "closest beer" matched "Beer-battered Onion Rings"). category/
// norm_categories are curated taxonomy tags (e.g. category "Beer",
// norm_categories ["beer-cider"]) and are a much more precise match for a
// generic food/drink-type term when they hit -- prefer them over name
// search whenever they do.
//
// A first version of this matched by raw substring containment against
// the whole category string, which was itself a real bug, not just a
// coarse taxonomy limitation: 309 categories in the live data are combined
// labels joined with "&"/"and"/"-" (e.g. "Spanish Burgers & Hot Dogs",
// "Ice Cream & Sorbet", "pizza-pasta"), and substring containment treats
// any of those as a match for the shorter term. Found live: "cheapest hot
// dog" matched "Add Avocado to any Sandwich" -- a generic $3 add-on at
// Pepe by José Andrés that exists as 4 near-duplicate rows (one per menu
// section it can be added to, including one literally categorized
// "Spanish Burgers & Hot Dogs"), completely unrelated to hot dogs itself.
// Fixed by splitting category/norm_categories strings into segments on
// common delimiters and requiring an EXACT match per segment (with loose
// singular/plural tolerance), not substring containment. This also
// resolves the previously-documented pizza-pasta/beer-cider cases as the
// same class of fix, not separate patches.
const CATEGORY_DELIMITERS = /[&/]|(?:,)|(?:\s+and\s+)/gi;

function categorySegments(raw: string): string[] {
  return raw
    .split(CATEGORY_DELIMITERS)
    .map((s) => normalizeForSearch(s).trim())
    .filter(Boolean);
}

// norm_categories values are machine-generated slugs (lowercase, hyphen-
// joined words, e.g. "beer-cider", "pizza-pasta") -- a different format
// from the human-readable `category` field above, so it needs its own
// segmenter rather than reusing categorySegments' &/and/,-based split.
function normCategorySegments(raw: string): string[] {
  return raw
    .split('-')
    .map((s) => normalizeForSearch(s).trim())
    .filter(Boolean);
}

// Found live (owner-reported 2026-07-31): naively stripping a trailing
// "s" turns "sandwiches" into "sandwiche", not "sandwich" -- English
// pluralizes words ending in ch/sh/s/x/z with "-es", not just "-s". This
// broke hasConflictingSegment (below): "Chicken Salad Sandwich"'s own
// name never matched the category tag word "Sandwiches" as a conflict
// signal, because the two forms simply didn't line up as the same word.
function singularize(s: string): string {
  if (s.length <= 3) return s;
  // "fries" -> "frie" makes a plain substring search match "fried",
  // pulling fried sandwiches into a request for fries.
  if (s === 'fries') return 'fry';
  if (/(?:ch|sh|s|x|z)es$/.test(s)) return s.slice(0, -2);
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

function exactSegmentMatch(segment: string, q: string): boolean {
  return singularize(segment) === singularize(q);
}

function qualifiedSegmentMatch(segment: string, q: string): boolean {
  return singularize(segment).endsWith(` ${singularize(q)}`);
}

function itemTextSupportsQualifiedCategory(item: MenuItem, q: string): boolean {
  const evidenceTokens = normalizeForSearch(`${item.item} ${item.description ?? ''}`)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map(singularize);
  const queryTokens = normalizeForSearch(q)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3)
    .map(singularize);
  return queryTokens.some((token) => evidenceTokens.includes(token));
}

// Combined machine tags such as "sandwiches-burgers" are useful recall
// hints, but are not strong enough by themselves to prove which half an
// individual row belongs to. This small domain lexicon supplies item-name
// evidence for common generic categories; otherwise the normalized query
// itself must appear in the item name. Human-readable exact category
// matches remain trusted independently below.
const CATEGORY_NAME_HINTS: Record<string, string[]> = {
  beer: ['beer', 'ale', 'lager', 'ipa', 'stout', 'porter', 'pilsner', 'cerveza', 'kolsch', 'hefeweizen'],
  burger: ['burger', 'hamburger', 'slider'],
  'hot dog': ['hot dog', 'frankfurter'],
  pizza: ['pizza', 'flatbread'],
  wine: ['wine', 'cabernet', 'chardonnay', 'merlot', 'pinot', 'prosecco', 'riesling', 'sangria', 'champagne', 'rose'],
  'ice cream': ['ice cream', 'gelato', 'sundae', 'soft serve', 'soft-serve', 'sorbet', 'scoop'],
};

function itemNameSupportsCategory(itemName: string, query: string): boolean {
  const name = normalizeForSearch(itemName);
  const q = normalizeForSearch(query).trim();
  const hints = CATEGORY_NAME_HINTS[singularize(q)] ?? [q];
  return hints.some((hint) => name.includes(normalizeForSearch(hint)));
}

// Generic modifiers/add-ons (e.g. "Add Avocado to any Sandwich", "Add
// Protein to any Salad") aren't independently-orderable dishes and should
// never be "the cheapest X" on their own, regardless of what category
// they're filed under -- 39/45588 real rows match this live, a small but
// real and recurring pattern (the pipeline duplicates one add-on row per
// menu section it applies to, which is also why they're prone to landing
// in an unrelated combined category in the first place).
// Broadened after finding this is a pattern, not a one-off: fixing the
// category-substring bug (above) still left "cheapest pizza" landing on
// "Add-On's" (a crepe topping add-on, genuinely mistagged upstream under
// norm_categories ["pizza-pasta", "desserts"] -- not a matching-logic bug,
// a real bad tag) and "cheapest ice cream" landing on "Additional
// Toppings". Modifier/component rows are disproportionately likely to win
// any "cheapest X" comparison purely because they're inherently cheap
// ($1-4), regardless of which specific bug lets them into the candidate
// set -- worth filtering by name pattern generally, not chasing each
// upstream mistagging individually.
const GENERIC_MODIFIER_PATTERN = /^(add|additional|extra|side of|choice of)\s/i;

function isGenericModifier(itemName: string): boolean {
  return GENERIC_MODIFIER_PATTERN.test(itemName.trim()) || /add-?on/i.test(itemName.trim());
}

// Found live (owner-reported 2026-07-31): "cheapest hamburger at the
// Grand Floridian" answered "Chicken Strips ($10.99) at Gasparilla Island
// Grill" -- its real category is "Burgers and Chicken", a genuine,
// legitimately combined Disney menu section (not a mistagging like the
// soup-latte case), which splits into ["burgers", "chicken"] and
// "burgers" matches the hamburger/burger synonym correctly. The category
// match itself isn't wrong; trusting it for THIS SPECIFIC ITEM is --
// "Chicken Strips" plainly isn't a burger. Unlike the pizza-pasta/soup-
// salads cases (left undisturbed, no reliable secondary signal available
// there), this one has one: when a category splits into 2+ segments, an
// item whose own name contains a DIFFERENT segment's word is a real
// signal it belongs to the other half of the combined section, not the
// one that matched the query. Excluded rather than trusted.
// Token-based, not a raw substring check -- found live that substring
// checking missed a real conflict because the item name used the
// singular form of a word ("Sandwich") while the category tag used the
// plural ("Sandwiches"); neither contains the other as a substring even
// though they're clearly the same word. Tokenizing and singularizing each
// side before comparing catches this.
function hasConflictingSegment(item: MenuItem, matchedSegment: string, allSegments: string[]): boolean {
  if (allSegments.length < 2) return false;
  const itemTokens = normalizeForSearch(item.item)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map(singularize);
  return allSegments.some((seg) => seg !== matchedSegment && itemTokens.includes(singularize(seg)));
}

// Never trusts allergy_free_of/has_allergy_option for a filter decision --
// same rule as itemMatchesDietary() in src/search/filters.ts (the one
// place the app's own Find tab decides what counts as "peanut-friendly"
// etc.), restated here since this file needs AND semantics across
// multiple keys for the ambiguous bare-"nut" case (see the allergenKeys
// field comment on ClassifiedQuery), not itemMatchesDietary's OR-within-
// group semantics built for independently-selected filter chips. Only
// ever matches Disney's own directly published `allergens` field on an
// `is_allergy_friendly` row -- fails closed (false) on stale cached data
// missing the field, same as itemMatchesDietary.
// Real, recurring literal placeholder text (445 rows, confirmed live) --
// Disney's own data uses this exact string as an "item" row wherever
// allergy substitutions are handled by asking staff directly rather than
// via a fixed pre-built allergy-friendly dish, always is_allergy_friendly
// with an empty `allergens` array. A specific-allergen check already
// fails it on its own (empty `allergens` never includes a real key), but
// the generic "allergy-friendly" (no specific allergen) case would
// otherwise present this instruction as if it were a real, orderable
// dish -- excluded here too, for both cases, in one place.
const ALLERGY_PLACEHOLDER_ITEM = /^guests must speak (?:to|with) a cast member/i;

function itemSafeForAllergens(item: MenuItem, allergenKeys: string[]): boolean {
  if (!item.is_allergy_friendly) return false;
  if (ALLERGY_PLACEHOLDER_ITEM.test(item.item.trim())) return false;
  const specific = allergenKeys.filter((k) => k !== 'allergy-friendly');
  if (specific.length === 0) return true;
  return specific.every((k) => (item.allergens ?? []).includes(k));
}

// Permissive (OR) set passed to itemVisibleInSearch purely to unlock
// allergy-labeled rows past its show_in_menu suppression during candidate
// gathering below -- itemSafeForAllergens() above is the actual (AND)
// correctness check applied afterward in answerQuery, before any answer
// is given. Never used as the final word on its own.
function allergenDietarySet(allergenKeys: string[] | null | undefined): Set<string> {
  if (!allergenKeys || allergenKeys.length === 0) return new Set();
  return new Set([...allergenKeys, 'allergy-friendly']);
}

// Returns the full Disney-style descriptive phrase ("Peanut/Tree Nut
// Allergy-Friendly", "Allergy-Friendly") -- never append another suffix at
// a call site.
function allergenPhrase(allergenKeys: string[]): string {
  const specific = allergenKeys.filter((k) => k !== 'allergy-friendly');
  if (specific.length === 0) return 'Allergy-Friendly';
  return `${specific.map((k) => ALLERGEN_LABELS[k] ?? k).join('/')} Allergy-Friendly`;
}

function disneyAllergyAttribution(allergenKeys: string[], plural: boolean): string {
  return `Disney lists ${plural ? 'these' : 'this'} as ${allergenPhrase(allergenKeys)}.`;
}

function answerAllergyLocations(
  allergenKeys: string[],
  data: LoadedData,
  origin: Coordinates,
  park?: string | null
): ExecutorResult {
  const restaurantById = restaurantMap(data.restaurants);
  const byRestaurant = new Map<string, ItemCandidate>();
  for (const item of data.menuItems) {
    if (!itemSafeForAllergens(item, allergenKeys)) continue;
    const restaurant = restaurantById.get(item.restaurant_id);
    if (!restaurant || !restaurantMatchesPark(restaurant, park)) continue;
    if (!byRestaurant.has(restaurant.restaurant_id)) {
      byRestaurant.set(restaurant.restaurant_id, { item, restaurant });
    }
  }

  const matches = Array.from(byRestaurant.values());
  const parkNote = park ? ` in ${park}` : '';
  if (matches.length === 0) {
    return {
      kind: 'no-match',
      text: `Disney doesn't currently publish a ${allergenPhrase(allergenKeys)} labeled item${parkNote} in Rumbly's menu data -- ask a Cast Member about options. ${ALLERGY_DISCLAIMER}`,
    };
  }

  const sorted = matches
    .map((candidate) => ({ candidate, distance: distanceToRestaurant(origin, candidate.restaurant) }))
    .sort((a, b) => {
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.candidate.restaurant.restaurant.localeCompare(b.candidate.restaurant.restaurant);
    });
  const shown = sorted.slice(0, 12);
  const lines = shown.map(({ candidate, distance }) => {
    const distanceNote = distance === null ? '' : ` (${formatProximityDistance(distance)})`;
    return `${candidate.restaurant.restaurant}${distanceNote}: ${candidate.item.item}`;
  });
  const remaining = sorted.length - shown.length;
  const suffix = remaining > 0 ? `, and ${remaining} more location${remaining === 1 ? '' : 's'}` : '';
  return {
    kind: 'answer',
    text: `${disneyAllergyAttribution(allergenKeys, true)} ${matches.length} location${matches.length === 1 ? '' : 's'}${parkNote}: ${lines.join('; ')}${suffix}. ${ALLERGY_DISCLAIMER}`,
    restaurantIds: matches.map((candidate) => candidate.restaurant.restaurant_id),
    itemIds: matches.map((candidate) => candidate.item.item_id),
  };
}

// Same disclaimer copy/URL as AllergyInfoSheet.tsx's ported afTooltipBody()
// -- every allergy-related answer here carries it too, for the same
// reason: `allergens` reflects Disney's own published menu labeling, never
// a claim this app is making about actual ingredients or kitchen practice.
const DISNEY_ALLERGY_URL = 'https://disneyworld.disney.go.com/guest-services/special-dietary-requests/';
const ALLERGY_DISCLAIMER = `This reflects Disney's own published menu labeling, not a guarantee -- always confirm with a Cast Member/your server before ordering. See ${DISNEY_ALLERGY_URL}`;

function matchItemsByCategory(
  term: string,
  restaurants: Restaurant[],
  menuItems: MenuItem[],
  dietary: Set<string> = new Set()
): ItemCandidate[] {
  const q = normalizeForSearch(term).trim();
  const restaurantById = restaurantMap(restaurants);
  const out: ItemCandidate[] = [];
  for (const item of menuItems) {
    if (isGenericModifier(item.item)) continue;
    // Combined across BOTH signals (human-readable category AND
    // norm_categories), not checked as two separate attempts -- found
    // live that checking them separately let a conflict slip through:
    // "Chicken Strips"'s human category ("Burgers and Chicken" ->
    // ["burgers","chicken"]) correctly flags the "chicken" conflict, but
    // its norm_categories ("sandwiches-burgers" -> ["sandwiches","burgers"])
    // doesn't mention chicken at all, so checking that tag in isolation
    // found no conflict and let the item through anyway. Combining every
    // segment from every signal into one list means a conflict caught by
    // either signal actually excludes the item, not just one it happened
    // to be checked against.
    const humanSegments = categorySegments(item.category);
    const normGroups = item.norm_categories.map((c) => normCategorySegments(c));
    const allSegments = [...humanSegments, ...normGroups.flat()];
    const exactHumanSegment = humanSegments.find((seg) => exactSegmentMatch(seg, q));
    const qualifiedHumanSegment =
      exactHumanSegment || humanSegments.length !== 1
        ? undefined
        : humanSegments.find((seg) => qualifiedSegmentMatch(seg, q) && itemTextSupportsQualifiedCategory(item, q));
    const matchedHumanSegment = exactHumanSegment ?? qualifiedHumanSegment;
    const matchedNormGroup = normGroups.find((segments) => segments.some((seg) => exactSegmentMatch(seg, q)));
    const matchedSegment = matchedHumanSegment ?? matchedNormGroup?.find((seg) => exactSegmentMatch(seg, q));
    if (!matchedSegment) continue;
    if (matchedHumanSegment && humanSegments.length > 1 && !itemNameSupportsCategory(item.item, q)) continue;
    if (!matchedHumanSegment && CATEGORY_NAME_HINTS[singularize(q)] && !itemNameSupportsCategory(item.item, q)) continue;
    // A combined normalized tag is recall-only unless either the human
    // category independently agrees or the item name supports the chosen
    // segment. Prevents e.g. Hashbrowns tagged "sandwiches-burgers" from
    // becoming the cheapest hamburger.
    if (!matchedHumanSegment && matchedNormGroup && matchedNormGroup.length > 1 && !itemNameSupportsCategory(item.item, q)) continue;
    if (hasConflictingSegment(item, matchedSegment, allSegments)) continue;

    if (!itemVisibleInSearch(item, dietary, false)) continue;
    const restaurant = restaurantById.get(item.restaurant_id);
    if (!restaurant) continue;
    out.push({ item, restaurant });
  }
  return out;
}

// Direct, uncapped substring scan over every real menu item -- no fuzzy
// matching (search() below already covers typo tolerance), just a plain
// name-contains-term check with no limit on result count.
function directSubstringMatch(term: string, data: LoadedData, dietary: Set<string> = new Set()): ItemCandidate[] {
  const q = normalizeForSearch(term).trim();
  if (!q) return [];
  const restaurantById = restaurantMap(data.restaurants);
  const out: ItemCandidate[] = [];
  for (const item of data.menuItems) {
    if (isGenericModifier(item.item)) continue;
    if (!normalizeForSearch(item.item).includes(q)) continue;
    if (!itemVisibleInSearch(item, dietary, false)) continue;
    const restaurant = restaurantById.get(item.restaurant_id);
    if (!restaurant) continue;
    out.push({ item, restaurant });
  }
  return out;
}

// Found live while adding allergen support (owner request 2026-07-31):
// rank.ts's search() (unlike the three matchers above) never calls
// itemVisibleInSearch at all -- it has no concept of show_in_menu or
// allergy-labeled rows, so its results can already include an
// is_allergy_friendly row for an ordinary, non-allergen query. Harmless on
// its own (directSubstringMatch's union already suppressed those same
// rows for non-allergen queries, so they were never the *only* candidate
// before), but exactly backwards for an allergen-scoped query -- without
// an explicit filter here, this path would let a non-allergy-labeled item
// through as if it were a safe answer. `dietary` only widens what
// directSubstringMatch allows through; the real per-item correctness check
// is always itemSafeForAllergens() in answerQuery, applied to every
// candidate from every source before it's used in an answer.
function matchItemsByName(term: string, data: LoadedData, dietary: Set<string> = new Set()): ItemCandidate[] {
  const menuItemByKey = menuItemMap(data.menuItems);
  // Ask Rumbly must not turn an unrelated word into a dining answer solely
  // through edit distance ("pancho" -> "panko"). Natural-language intent
  // is not evidence that the leftover noun is a real menu concept.
  const results = search(term, data.restaurants, data.searchIndex).filter((r) => r.kind === 'item' && r.tier < 8);
  const byKey = new Map<string, ItemCandidate>();
  for (const r of results) {
    if (r.kind !== 'item') continue;
    if (isGenericModifier(r.item.item)) continue;
    const full = menuItemByKey.get(`${r.item.restaurant_id}:${r.item.item_id}`);
    if (full) byKey.set(`${r.restaurant.restaurant_id}:${full.item_id}`, { item: full, restaurant: r.restaurant });
  }
  // Found live (owner-reported 2026-07-31): "chicken in Magic Kingdom"
  // missed Be Our Guest Restaurant, The Plaza Restaurant, and 6 other real
  // Magic Kingdom restaurants entirely -- not a synonym or category-cascade
  // issue, a hard cap. rank.ts's search() truncates at MAX_RESULTS (200),
  // built for Find's interactive typeahead where that's the right call;
  // "chicken" alone already has 199 real substring matches dataset-wide
  // (confirmed directly), right at the edge of the cap, so real matches
  // for a term this broad get silently dropped before they ever reach
  // this function. Supplemented with an uncapped direct scan so no real
  // substring match is ever lost to a limit that exists for a different
  // consumer's performance needs, not this one's completeness needs.
  for (const c of directSubstringMatch(term, data, dietary)) {
    const key = `${c.restaurant.restaurant_id}:${c.item.item_id}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return Array.from(byKey.values());
}

// Found live (owner report, 2026-07-31): "ice cream at Disney Springs"
// only surfaced Häagen-Dazs, missing Salt & Straw -- a real, well-known
// ice cream shop whose menu items are just named "Single Scoop"/"Pint"/
// "Milkshake" (category: "Salt & Straw Pricing", norm_categories:
// ["desserts"]). No item name or category anywhere says "ice cream" for
// it -- category and name matching both structurally can't find it. The
// one place the concept actually appears in the data is
// `restaurant.description`: "Discover taste-provoking ice cream at this
// family-run scoop shop!". Deliberately NOT folded into the shared
// src/search/rank.ts `search()` (its own header comment already scopes
// description matching out, on purpose, for the real Find tab -- a
// restaurant's marketing copy is a much noisier signal than curated
// category tags, more prone to incidental mentions). Used here only as a
// last resort for `list` queries specifically (see matchItemsForList
// below) where completeness matters more than precision -- never for
// cheapest/nearest, where a marketing-copy false positive winning the
// single answer would be worse than Salt & Straw being invisible.
function matchItemsByDescription(term: string, data: LoadedData, dietary: Set<string> = new Set()): ItemCandidate[] {
  const q = normalizeForSearch(term);
  const out: ItemCandidate[] = [];
  for (const restaurant of data.restaurants) {
    if (!restaurant.description || !normalizeForSearch(restaurant.description).includes(q)) continue;
    for (const item of data.menuItems) {
      if (item.restaurant_id !== restaurant.restaurant_id) continue;
      if (isGenericModifier(item.item)) continue;
      if (!itemVisibleInSearch(item, dietary, false)) continue;
      out.push({ item, restaurant });
    }
  }
  return out;
}

// Park/water-park/Disney Springs scoping ("in Magic Kingdom") -- owner
// request 2026-07-31. `restaurant.park` has inconsistent raw values for
// the same real park (e.g. "Hollywood Studios" vs "Disney's Hollywood
// Studios", both from the same live data -- one is the hand-coded-venue
// variant, see importPipeline.ts), so this compares against
// parkDisplayName() (src/data/locationNames.ts), which already collapses
// both to the same display string for exactly this reason. Disney Springs
// restaurants don't reliably have `resort` or `area` set the same way, so
// this also matches loosely against area/resort text as a fallback for
// venues locationNames.ts's park-specific mapping doesn't cover.
function restaurantMatchesPark(restaurant: Restaurant, park?: string | null): boolean {
  if (!park) return true;
  const q = normalizeForSearch(park);
  // Exact match on parkDisplayName(restaurant.park) is the precise case --
  // deliberately NOT a loose substring match against area/resort text
  // generally: resort hotels near a park are labeled e.g. area:"EPCOT
  // Resort Area" with park:null, and "in Epcot" should mean literally
  // inside the park gates, not "somewhere in the resort-hotel cluster
  // named after it" -- found live, an early version's loose substring
  // fallback pulled in Beach Club/Yacht Club/Dolphin resort restaurants
  // that have nothing to do with the park itself.
  if (normalizeForSearch(parkDisplayName(restaurant.park)) === q) return true;
  // Disney Springs is the one real exception, not a loosening of the rule
  // above: many of its restaurants carry park:null with area set to one of
  // its named sub-areas instead (West Side/Marketplace/Town Center/The
  // Landing) -- confirmed live, "Sunshine Churros at Disney Springs West
  // Side" has park:null, area:"West Side". DISNEY_SPRINGS_AREAS is the
  // app's own canonical definition of that set (src/data/locationNames.ts,
  // already used by locationHierarchy() for the same purpose), reused here
  // rather than guessed at with text matching.
  if (q === 'disney springs' && restaurant.area && DISNEY_SPRINGS_AREAS.has(restaurant.area)) return true;
  // Sub-park areas ("Fantasyland", "Echo Lake") -- owner-reported gap
  // 2026-07-31. Exact match, same precision reasoning as the park check
  // above: `park` is dynamically built from real `restaurant.area` values
  // in rule_classifier.ts's extractParkFilter(), so this just needs to
  // confirm the same exact string, not guess at a substring.
  if (restaurant.area && normalizeForSearch(restaurant.area) === q) return true;
  // Resort scoping ("at the Grand Floridian") -- owner-reported gap
  // 2026-07-31. `park` is dynamically derived from real `restaurant.resort`
  // values in rule_classifier.ts's extractParkFilter() (which carries the
  // full canonical resort name through, not the shortened alias used to
  // detect it), so this just needs to confirm the same exact string.
  if (restaurant.resort && normalizeForSearch(restaurant.resort) === q) return true;
  if (restaurant.resort && resortsShareGuestFacingFamily(restaurant.resort, park)) return true;
  return false;
}

function filterByPark(candidates: ItemCandidate[], park: string | null | undefined): ItemCandidate[] {
  if (!park) return candidates;
  return candidates.filter((c) => restaurantMatchesPark(c.restaurant, park));
}

// The category-vs-name fallback must be decided WITHIN the requested park
// scope, not globally -- found live: "hot dog in Magic Kingdom" returned
// no-match even though Casey's Corner has a real "Hot Dog" (name-matched
// only; its category is "Entrées", no category anywhere says "hot dog" for
// it) in Magic Kingdom. The bug: some *other* restaurant (Pepe by José
// Andrés, in Disney Springs) has a category literally called "Spanish
// Burgers & Hot Dogs", so a global category-match check found something
// and never fell through to name search at all -- silently hiding every
// real, name-matched hot dog everywhere else, including in the actually-
// requested park. Falling back per-scope instead fixes it: if the
// category match is empty *for the requested park*, try name search
// *for that same park*, rather than asking "does a category match exist
// anywhere in the whole dataset" first.
// Found live (owner-reported 2026-07-31): "does Cosmic Ray's have
// hamburgers" answered "No" -- misleadingly, since Cosmic Ray's has
// "Cheeseburger", "1/3 lb Angus Burger", "Truffle-French Onion Burger",
// etc., just nothing literally named "hamburger". A confidently wrong
// "No" is a worse failure than an imprecise list entry, since it's
// presented as a definitive fact, not a ranked pick the user can eyeball
// -- worth a targeted fix. Not a general synonym engine, just the one
// pair confirmed to matter this much in this domain (every other
// "cheapest"/"nearest"/"list" query using "hamburger" was *also* quietly
// missing every "Cheeseburger"/"Angus Burger" match for the same reason,
// so this benefits every query type, not just the new hasItem feature).
// "french fries" found live (owner-reported 2026-07-31, same session as
// the plaza/tiebreak fix): "does The Plaza Restaurant have french fries"
// answered "No" despite it having "Plaza Loaded Fries" -- real items are
// overwhelmingly just called "Fries" ("BBQ Waffle Fries", "Black Garlic
// Truffle Fries", etc.), not "French Fries". Confirmed the gap's size
// before adding the pair: plain "fries" matches 153 real items dataset-
// wide, "french fries" alone only 54 -- a 99-item gap, same shape as the
// hamburger/burger one above.
const ITEM_SYNONYMS: Record<string, string[]> = {
  hamburger: ['burger'],
  hamburgers: ['burgers'],
  burger: ['hamburger', 'cheeseburger'],
  burgers: ['hamburgers', 'cheeseburgers'],
  'french fries': ['fries'],
  'french fry': ['fries'],
  fries: ['french fries'],
  'ice cream': ['gelato', 'sundae', 'soft serve', 'soft-serve', 'sorbet', 'scoop'],
  cocktail: ['concoctions with alcohol'],
  cocktails: ['concoctions with alcohol'],
  // Owner-reported 2026-07-31, same session as the fries fix: "chicken
  // tenders"/"chicken fingers" produced few/no results because Disney's
  // real menu naming is almost universally "Chicken Strips" -- confirmed
  // before adding: "chicken strips" matches 118 real items dataset-wide,
  // "chicken tenders" only 32, "chicken fingers" only 9, and they're
  // largely disjoint sets of restaurants, not overlapping subsets.
  'chicken tenders': ['chicken strips'],
  'chicken tender': ['chicken strips'],
  'chicken fingers': ['chicken strips'],
  'chicken finger': ['chicken strips'],
  'chicken strips': ['chicken tenders', 'chicken fingers'],
};

function termsToTry(term: string): string[] {
  const key = normalizeForSearch(term).trim();
  const singular = singularize(key);
  return Array.from(new Set([term, singular, ...(ITEM_SYNONYMS[key] ?? []), ...(ITEM_SYNONYMS[singular] ?? [])])).filter(Boolean);
}

function matchItems(term: string, data: LoadedData, park?: string | null, dietary: Set<string> = new Set()): ItemCandidate[] {
  for (const t of termsToTry(term)) {
    const categoryMatches = filterByPark(matchItemsByCategory(t, data.restaurants, data.menuItems, dietary), park);
    if (categoryMatches.length > 0) return categoryMatches;
  }
  for (const t of termsToTry(term)) {
    const nameMatches = filterByPark(matchItemsByName(t, data, dietary), park);
    if (nameMatches.length > 0) return nameMatches;
  }
  return [];
}

// Union matcher WITHOUT matchItemsByDescription -- for every allergen-scoped
// item query. Found live (owner request 2026-07-31): using a description-
// inclusive matcher for
// "cheapest peanut free burger" answered "Grapes (Dessert) - Peanut/Tree
// Nut Allergy-Friendly ($2.59) at Gasparilla Island Grill" -- a real
// allergy-labeled item, but not a burger by any stretch. Root cause:
// Gasparilla's own marketing description mentions "burger" (it's a real
// burger spot), so matchItemsByDescription pulls in EVERY item at that
// restaurant as a "burger" candidate, allergy-labeled ones included --
// exactly the false-positive risk matchItemsByDescription's own header
// comment already warns never to accept for a single cheapest/nearest
// winner (a list only shows the restaurant, deduped, so a stray
// description-matched item there is comparatively harmless; a global
// cheapest/nearest sort has no such protection, and a small allergen-
// filtered candidate pool makes an odd, cheap description-only match far
// more likely to actually win). matchItemsByCategory's exact-segment
// matching already broke the same class of bug for the strict cascade
// (see its own header comment); this keeps that same category+name-only
// scope while still using union (not cascade) semantics, needed so a
// category match that doesn't survive the allergen filter can still fall
// through to a real name match -- see the allergen note on matchItems()'s
// call site in answerQuery.
function matchItemsForSingleWinner(term: string, data: LoadedData, park?: string | null, dietary: Set<string> = new Set()): ItemCandidate[] {
  const byKey = new Map<string, ItemCandidate>();
  const add = (candidates: ItemCandidate[]) => {
    for (const c of candidates) {
      const key = `${c.restaurant.restaurant_id}:${c.item.item_id}`;
      if (!byKey.has(key)) byKey.set(key, c);
    }
  };
  for (const t of termsToTry(term)) {
    add(filterByPark(matchItemsByCategory(t, data.restaurants, data.menuItems, dietary), park));
    add(filterByPark(matchItemsByName(t, data, dietary), park));
  }
  return Array.from(byKey.values());
}

// Union matcher for list queries: category + item name only. Restaurant
// marketing descriptions are intentionally excluded, including for allergy
// searches; they are not evidence that a particular menu item matches the
// guest's requested food.
function matchItemsForList(term: string, data: LoadedData, park?: string | null, dietary: Set<string> = new Set()): ItemCandidate[] {
  const byKey = new Map<string, ItemCandidate>();
  const add = (candidates: ItemCandidate[]) => {
    for (const c of candidates) {
      const key = `${c.restaurant.restaurant_id}:${c.item.item_id}`;
      if (!byKey.has(key)) byKey.set(key, c);
    }
  };
  for (const t of termsToTry(term)) {
    add(filterByPark(matchItemsByCategory(t, data.restaurants, data.menuItems, dietary), park));
    add(filterByPark(matchItemsByName(t, data, dietary), park));
  }
  return Array.from(byKey.values());
}

// Found live (owner-supplied 100-question batch, 2026-07-31): natural,
// verbose guest phrasing ("the absolute best fresh-made churros," "serves
// real Dole Whip float variations besides Aloha Isle") buries the actual
// food term in adjectives/clauses no stopword list can ever fully
// enumerate -- unlike short/terse queries, where a bounded stopword list
// gets most of the way there, unbounded natural language is a losing
// whack-a-mole game to chase word by word. Rather than growing the
// stopword lists indefinitely, this is a general, bounded fallback: if
// the full phrase doesn't match anything real, shrink it -- try every
// contiguous word window, longest first, down to single words, and use
// the first one that resolves to something real. Longest-first means a
// real multi-word dish name ("dole whip") is found before ever falling
// back to a misleadingly-generic single word, and checking every
// position (not just a fixed "last word" heuristic) makes this robust to
// noise landing on EITHER side of the real term -- found live that
// "really solid juicy burger echo lake" (a leaked area name trailing the
// real item, a separate, known gap in extractParkFilter only capturing
// one location signal at a time) would defeat a last-word-only heuristic,
// since the literal last word is "lake," not "burger." Only tried once
// the full phrase has already failed, so it adds no cost to the common,
// already-working case.
// `probe` and `matcher` are deliberately separate, not one function run
// twice -- found live (owner-supplied 100-question batch, 2026-07-31):
// a long, verbose sentence produces dozens of candidate windows (a
// 9-token phrase alone is 36), and the real matchers (matchItemsForList/
// matchItems, via matchItemsByName -> rank.ts's search()) fall through to
// an expensive fuzzy edit-distance pass across the whole menu whenever a
// candidate's plain/substring tiers come up empty -- which nearly every
// nonsense window here does. Running that full cost per candidate timed
// out. `probe` uses only the cheap, non-fuzzy checks (plain category-
// segment equality, plain substring scan) to find which single candidate
// is actually promising; the full (possibly-fuzzy) matcher then runs
// exactly once, on the single best candidate identified, not on every
// window tried.
//
// Picks the LEAST common match at each window size, not the first one
// found left-to-right -- found live: "fresh, hot beignets on property"
// resolved via generic "fresh" (which matches dozens of unrelated real
// items, e.g. "Freshly Brewed Coffee") before "beignets" (a rare, highly
// specific real term) was ever tried, purely because "fresh" sits earlier
// in the sentence. A common filler word will almost always have SOME
// real match somewhere in 45k+ items; a specific dish name has few. Fewer
// real matches is a much better proxy for "this is probably the term
// actually being asked about" than left-to-right position ever was.
// Returns which candidate string actually won, not just the results --
// so the caller can show that in the answer text instead of echoing the
// original noisy phrase back at the user.
//
// Never tries single-word (windowSize 1) candidates -- found live
// (owner-supplied 100-question batch, 2026-07-31), and the real reason
// this exists at all: for questions about ATMOSPHERE, LOGISTICS/TIMING,
// VALUE/RANKING, or SECRET/HIDDEN content ("biggest portion for the
// money," "secret menu items," "past 11 PM"), there's no real dish
// anywhere in the sentence, and the least-common-match heuristic above
// still always finds SOME single word with a low, coincidental
// substring-match count and confidently presents it as the answer --
// "portion," "secret," "skipper," "miss," "featured" among many others,
// each a real match to something, none actually answering what was
// asked. A denylist of specific offending words was tried first and
// immediately proved to be an unwinnable, ever-growing whack-a-mole (each
// fix surfaced a dozen more) -- English has too many short generic nouns
// for that to ever converge. Reviewing every fallback match across three
// full passes on that batch instead surfaced a clean, structural pattern:
// every multi-word match (2+ tokens -- "dole whip," "corn dog," "prime
// rib," "small plates," "bread service," "made-to-order omelet") was
// correct; nearly every false positive was a single common word matching
// by pure coincidence. Multi-word English phrases are rarely a
// coincidental substring of an unrelated real item; single common words
// almost always have SOME real match somewhere in 45k+ items regardless
// of relevance. Restricting to windowSize >= 2 directly targets that
// mechanism instead of chasing individual offending words one at a time.
// Real cost: a genuine single-word dish name buried in noise (bare
// "churros"/"beignets"/"pastries") no longer gets caught by this
// fallback and declines instead -- accepted as the smaller, safer
// failure mode against the alternative of a wrong answer stated with
// unearned confidence.
function significantPhraseFallback<T>(
  term: string,
  probeCount: (candidate: string) => number,
  matcher: (candidate: string) => T[]
): { results: T[]; matchedTerm: string } | null {
  const tokens = term.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return null;
  for (let windowSize = tokens.length - 1; windowSize >= 2; windowSize--) {
    let best: { candidate: string; count: number } | null = null;
    for (let start = 0; start + windowSize <= tokens.length; start++) {
      const candidate = tokens.slice(start, start + windowSize).join(' ');
      const count = probeCount(candidate);
      if (count > 0 && (best === null || count < best.count)) {
        best = { candidate, count };
      }
    }
    if (best) {
      const results = matcher(best.candidate);
      if (results.length > 0) return { results, matchedTerm: best.candidate };
    }
  }
  return null;
}

function cheapCandidateProbeCount(candidate: string, data: LoadedData, dietary: Set<string> = new Set()): number {
  if (candidate.length <= 2) return 0;
  return (
    directSubstringMatch(candidate, data, dietary).length + matchItemsByCategory(candidate, data.restaurants, data.menuItems, dietary).length
  );
}

interface CompoundMatch {
  restaurant: Restaurant;
  matchedItems: MenuItem[];
  // Parallel to matchedItems -- which requested term each one matched.
  // For 'and' mode this is always the full, original terms list in order
  // (every term necessarily matched); for 'or' mode it's whichever subset
  // of terms this restaurant actually serves, 1 to N of them.
  matchedTerms: string[];
}

// "where in Epcot can I get a hot dog and a beer" -- owner request
// 2026-07-31: restaurants serving EVERY listed item (an intersection),
// not restaurants serving any one of them. Only called when the combined
// single-phrase interpretation (matchItems(query.item, ...)) already
// failed to match anything real -- see answerQuery's item-resolution step
// below -- so a real dish name containing "and" is never incorrectly
// split apart.
//
// 'or' mode -- owner request 2026-07-31 ("pizza or burgers"): a
// fundamentally different question (does this restaurant serve at least
// ONE of these, not necessarily all), so this is a union over the same
// per-term candidate sets rather than an intersection.
function matchCompoundItems(
  terms: string[],
  data: LoadedData,
  park: string | null | undefined,
  mode: 'and' | 'or' = 'and'
): CompoundMatch[] {
  const perTerm = terms.map((term) => {
    // Union matcher, not the strict cascade -- same reasoning as "list"
    // queries: finding every real overlapping location is a completeness
    // problem, and each individual term is just as susceptible to the
    // "hidden by an unrelated category match elsewhere" bug that
    // matchItemsForList exists to fix. Each compound segment is just as
    // susceptible to verbose/noisy phrasing as a single-item query is --
    // same significantPhraseFallback used there, applied per segment.
    const segmentMatcher = (t: string) => matchItemsForList(t, data, park);
    const direct = segmentMatcher(term);
    const candidates = direct.length > 0 ? direct : (significantPhraseFallback(term, (c) => cheapCandidateProbeCount(c, data), segmentMatcher)?.results ?? []);
    const byRestaurant = new Map<string, ItemCandidate>();
    for (const c of candidates) {
      if (!byRestaurant.has(c.restaurant.restaurant_id)) byRestaurant.set(c.restaurant.restaurant_id, c);
    }
    return byRestaurant;
  });

  if (mode === 'or') {
    const byRestaurant = new Map<string, CompoundMatch>();
    terms.forEach((term, termIndex) => {
      for (const [restaurantId, candidate] of perTerm[termIndex]) {
        const existing = byRestaurant.get(restaurantId);
        if (existing) {
          existing.matchedItems.push(candidate.item);
          existing.matchedTerms.push(term);
        } else {
          byRestaurant.set(restaurantId, { restaurant: candidate.restaurant, matchedItems: [candidate.item], matchedTerms: [term] });
        }
      }
    });
    return Array.from(byRestaurant.values());
  }

  if (perTerm.some((m) => m.size === 0)) return [];
  const [first, ...rest] = perTerm;
  const out: CompoundMatch[] = [];
  for (const [restaurantId, candidate] of first) {
    if (rest.every((m) => m.has(restaurantId))) {
      out.push({
        restaurant: candidate.restaurant,
        matchedItems: perTerm.map((m) => m.get(restaurantId)!.item),
        matchedTerms: terms,
      });
    }
  }
  return out;
}

// Real data audit (2026-07-31) found ~7300/45588 menu items (16%) with a
// null price_value -- not all the same kind of gap:
// - Wine/beer-by-the-glass rows sometimes carry the price as a range
//   embedded in the item's own text instead of a structured field, e.g.
//   "Assorted Beer ($9.75-$12.50)" or "Assorted Beer (9.75-12.50)" --
//   extractable, handled below (low end of the range used).
// - Many wine rows (e.g. "Dow's 10 yr Tawny Port, Portugal") have no price
//   anywhere in the data at all -- genuinely unpriced, correctly excluded.
// - "Flavor" rows (Vanilla, Praline, ...) are unpriced modifiers of a
//   separately-priced base item, not their own orderable thing -- also
//   correctly excluded by this, though they're never miscounted as $0
//   either way since there's no bug here, just no price to find.
// - Prix Fixe/Buffet/Family Style restaurants often price per-person for
//   the whole meal, not per item -- see the distinct messaging in
//   answerQuery's cheapest branch for restaurants where nothing here helps.
const EMBEDDED_PRICE_RANGE = /\(\$?(\d+(?:\.\d{1,2})?)\s*-\s*\$?(\d+(?:\.\d{1,2})?)\)/;
const EMBEDDED_PRICE_SINGLE = /\$(\d+(?:\.\d{1,2})?)/;

function resolveItemPrice(item: MenuItem): number | null {
  if (typeof item.price_value === 'number' && Number.isFinite(item.price_value)) return item.price_value;
  const rangeMatch = item.item.match(EMBEDDED_PRICE_RANGE);
  if (rangeMatch) return parseFloat(rangeMatch[1]);
  const singleMatch = item.item.match(EMBEDDED_PRICE_SINGLE);
  if (singleMatch) return parseFloat(singleMatch[1]);
  return null;
}

function formatMatchedItems(matchedTerms: string[], matchedItems: MenuItem[]): string {
  return matchedItems.map((m, i) => `${m.item} (matching "${matchedTerms[i]}")`).join(', ');
}

// Handles cheapest/nearest/list once matchCompoundItems() has already
// confirmed at least one real restaurant serves what was asked for.
// 'and' mode: "cheapest" means the lowest COMBINED price across ALL
// requested items at one restaurant (only restaurants where every item
// resolves to a real price are ranked -- same rigor as the single-item
// cheapest path). 'or' mode -- owner request 2026-07-31 ("pizza or
// burgers") -- is a different question: you're only getting ONE of them,
// so "cheapest" means the single cheapest item found anywhere across
// every match, not a combined total; "nearest"/"list" work the same way
// in both modes (one restaurant per match either way), just labeled with
// "or" instead of "and" and showing only the term(s) that restaurant
// actually matched (see CompoundMatch.matchedTerms).
function answerCompound(
  queryType: 'cheapest' | 'nearest' | 'list',
  terms: string[],
  matches: CompoundMatch[],
  origin: Coordinates,
  parkNote: string,
  mode: 'and' | 'or' = 'and'
): ExecutorResult {
  const connector = mode === 'or' ? 'or' : 'and';
  const itemsLabel = `"${terms.join(`" ${connector} "`)}"`;
  const availabilityVerb = mode === 'or' ? 'either is' : 'both are';

  if (queryType === 'cheapest') {
    if (mode === 'or') {
      const priced: { restaurant: Restaurant; item: MenuItem; term: string; price: number }[] = [];
      for (const m of matches) {
        m.matchedItems.forEach((item, i) => {
          const price = resolveItemPrice(item);
          if (price !== null) priced.push({ restaurant: m.restaurant, item, term: m.matchedTerms[i], price });
        });
      }
      if (priced.length === 0) {
        return { kind: 'no-match', text: `Found locations${parkNote} with ${itemsLabel}, but couldn't price them -- not answering.` };
      }
      priced.sort((a, b) => a.price - b.price);
      const cheapest = priced[0];
      return {
        kind: 'answer',
        text: `Cheapest ${itemsLabel} match${parkNote}: ${cheapest.item.item} (matching "${cheapest.term}") at ${cheapest.restaurant.restaurant} ($${cheapest.price.toFixed(2)}).`,
        restaurantIds: [cheapest.restaurant.restaurant_id],
        itemIds: [cheapest.item.item_id],
      };
    }
    const priced = matches
      .map((m) => {
        const prices = m.matchedItems.map(resolveItemPrice);
        if (prices.some((p) => p === null)) return null;
        return { match: m, total: (prices as number[]).reduce((a, b) => a + b, 0) };
      })
      .filter((x): x is { match: CompoundMatch; total: number } => x !== null);
    if (priced.length === 0) {
      return { kind: 'no-match', text: `Found locations${parkNote} with both ${itemsLabel}, but couldn't price them all -- not answering.` };
    }
    priced.sort((a, b) => a.total - b.total);
    const cheapest = priced[0];
    return {
      kind: 'answer',
      text: `Cheapest combined ${itemsLabel} match${parkNote}: ${formatMatchedItems(cheapest.match.matchedTerms, cheapest.match.matchedItems)} at ${cheapest.match.restaurant.restaurant} (total ~$${cheapest.total.toFixed(2)}).`,
      restaurantIds: [cheapest.match.restaurant.restaurant_id],
      itemIds: cheapest.match.matchedItems.map((item) => item.item_id),
    };
  }

  if (queryType === 'nearest') {
    const withDistance = matches
      .map((m) => ({ match: m, distance: distanceToRestaurant(origin, m.restaurant) }))
      .filter((x): x is { match: CompoundMatch; distance: number } => x.distance !== null);
    if (withDistance.length === 0) return { kind: 'no-match', text: `Found locations with ${itemsLabel}, but no location data available.` };
    withDistance.sort((a, b) => a.distance - b.distance);
    const nearest = withDistance[0];
    return {
      kind: 'answer',
      text: `Nearest ${itemsLabel} match${parkNote}: ${formatMatchedItems(nearest.match.matchedTerms, nearest.match.matchedItems)} at ${nearest.match.restaurant.restaurant} (${formatProximityDistance(nearest.distance)}).`,
      restaurantIds: [nearest.match.restaurant.restaurant_id],
      itemIds: nearest.match.matchedItems.map((item) => item.item_id),
    };
  }

  // list
  const withDistance = matches.map((m) => ({ match: m, distance: distanceToRestaurant(origin, m.restaurant) }));
  withDistance.sort((a, b) => {
    if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
    if (a.distance !== null) return -1;
    if (b.distance !== null) return 1;
    return a.match.restaurant.restaurant.localeCompare(b.match.restaurant.restaurant);
  });
  const LIST_CAP = 12;
  const shown = withDistance.slice(0, LIST_CAP);
  const lines = shown.map(({ match, distance }) => {
    const distanceNote = distance !== null ? ` (${formatProximityDistance(distance)})` : '';
    const termNote = mode === 'or' ? ` [${match.matchedTerms.join(', ')}]` : '';
    return `${match.restaurant.restaurant}${distanceNote}${termNote}`;
  });
  const remaining = withDistance.length - shown.length;
  const suffix = remaining > 0 ? `, and ${remaining} more location${remaining === 1 ? '' : 's'}` : '';
  return {
    kind: 'answer',
    text: `${itemsLabel} ${availabilityVerb} available${parkNote} at ${withDistance.length} location${withDistance.length === 1 ? '' : 's'}: ${lines.join('; ')}${suffix}.`,
    restaurantIds: matches.map((match) => match.restaurant.restaurant_id),
    itemIds: matches.flatMap((match) => match.matchedItems.map((item) => item.item_id)),
  };
}

// Shared by hours/distance/hasItem/attribute -- all four take a restaurant
// NAME string and need the real Restaurant object it refers to (or nothing,
// if it doesn't resolve to anything real).
// Found live (owner-reported 2026-07-31): "does the plaza have french
// fries" resolved to "Joffrey's Coffee & Tea Company® in Pixar Plaza at
// Disney's Hollywood Studios" instead of the obviously-intended "The
// Plaza Restaurant". Root cause: 4 real restaurants contain "plaza"
// ("The Plaza Restaurant", "Plaza Ice Cream Parlor", and two differently-
// located Joffrey's kiosks whose full descriptive names happen to mention
// a plaza) all tie at the same rank.ts relevance tier for this query, and
// `search()`'s own tiebreak for equal tiers is alphabetical by name --
// "Joffrey's..." sorts before "The Plaza..." purely on the letter J vs T,
// not because it's a better match. `search()` is shared production code
// (the real Find tab), so this isn't fixed there -- instead, once
// narrowed to real restaurant results, this reduces to the lowest tier
// actually present, then breaks ties by shortest name rather than
// alphabetically: a long descriptive name that merely *mentions* the
// query term is less likely the intended match than a short one built
// mostly *from* it. Not foolproof, but a much better prior than A-Z.
function resolveRestaurant(restaurantName: string | null | undefined, data: LoadedData): Restaurant | null {
  if (!restaurantName) return null;
  const results = search(restaurantName, data.restaurants, data.searchIndex).filter(
    (r): r is { kind: 'restaurant'; tier: number; restaurant: Restaurant } => r.kind === 'restaurant'
  );
  if (results.length === 0) return null;
  const minTier = Math.min(...results.map((r) => r.tier));
  const topTier = results.filter((r) => r.tier === minTier);
  topTier.sort((a, b) => a.restaurant.restaurant.length - b.restaurant.restaurant.length);
  return topTier[0].restaurant;
}

function openRestaurantAction(restaurant: Restaurant, label = 'Open in Rumbly'): ExecutorAction {
  return { kind: 'openRestaurant', label, restaurantId: restaurant.restaurant_id };
}

function openDisneyAction(restaurant: Restaurant, label = 'Open Disney app'): ExecutorAction | null {
  return restaurant.disney_url ? { kind: 'openDisney', label, url: restaurant.disney_url } : null;
}

function supportsMobileOrder(restaurant: Restaurant): boolean {
  return restaurant.raw_facets.some((facet) => facet.id === 'mobile-orders' || facet.name.toLowerCase().includes('mobile order'));
}

function restaurantClarification(query: ClassifiedQuery, data: LoadedData): ExecutorResult | null {
  const restaurantName = query.restaurantName;
  if (!restaurantName) return null;
  const normalized = normalizeForSearch(restaurantName).trim();
  const results = search(restaurantName, data.restaurants, data.searchIndex).filter(
    (r): r is { kind: 'restaurant'; tier: number; restaurant: Restaurant } => r.kind === 'restaurant'
  );
  if (results.length < 2) return null;
  // An exact full-name match is decisive even if looser matches also exist.
  if (results.some((r) => normalizeForSearch(r.restaurant.restaurant).trim() === normalized)) return null;
  const minTier = Math.min(...results.map((r) => r.tier));
  const candidates = results
    .filter((r) => r.tier === minTier)
    .map((r) => r.restaurant)
    .filter((restaurant, index, all) => all.findIndex((other) => other.restaurant_id === restaurant.restaurant_id) === index)
    .sort((a, b) => a.restaurant.length - b.restaurant.length)
    .slice(0, 4);
  if (candidates.length < 2) return null;
  const options = candidates.map((restaurant) => ({
    label: restaurant.restaurant,
    value: restaurant.restaurant_id,
    nextQuery: { ...query, restaurantName: restaurant.restaurant },
  }));
  return {
    kind: 'clarification',
    text: `Which restaurant did you mean by "${restaurantName}"?`,
    clarification: { kind: 'restaurant', options },
  };
}

// "where's the closest quickservice" -- owner request 2026-07-31: nearest/
// cheapest/list by service_style (a real restaurant attribute), not by
// menu item. Structurally simpler than the item-based branches since
// `restaurant.service_style` is already a clean, direct field -- no
// category/name/description matching needed at all.
// Shared by service_style ("closest quickservice") and cuisine ("closest
// american restaurant," owner request 2026-07-31) -- structurally
// identical: a real, direct/clean restaurant-level field to filter on,
// then the exact same cheapest/nearest/list shape. `kind` only changes
// which field is checked and how the value is displayed (cuisine tags are
// lowercase slugs -- "american," "bbq" -- displayed via cuisineLabel(),
// the same titleCase used by the real Find tab's filter chips; service
// styles are already display-ready, e.g. "Quick Service").
function answerServiceStyle(
  queryType: 'cheapest' | 'nearest' | 'list',
  value: string,
  data: LoadedData,
  origin: Coordinates,
  park: string | null | undefined,
  kind: 'service' | 'cuisine' = 'service'
): ExecutorResult {
  let candidates =
    kind === 'cuisine' ? data.restaurants.filter((r) => r.cuisine_tags.includes(value)) : data.restaurants.filter((r) => r.service_style === value);
  if (park) candidates = candidates.filter((r) => restaurantMatchesPark(r, park));
  const parkNote = park ? ` in ${park}` : '';
  const label = kind === 'cuisine' ? cuisineLabel(value) : value;
  if (candidates.length === 0) {
    return { kind: 'no-match', text: `No real ${label} restaurant${parkNote} found -- not answering.` };
  }

  if (queryType === 'cheapest') {
    const priced = candidates.filter((r) => r.price_tier !== null);
    if (priced.length === 0) return { kind: 'no-match', text: `Found ${label} restaurants${parkNote}, but none have pricing data.` };
    const sorted = [...priced].sort((a, b) => (a.price_tier as number) - (b.price_tier as number));
    const cheapest = sorted[0];
    const priceNote = cheapest.price_tier_display ? ` (${cheapest.price_tier_display})` : '';
    return {
      kind: 'answer',
      text: `Cheapest ${label} restaurant${parkNote}: ${cheapest.restaurant}${priceNote}.`,
      restaurantIds: [cheapest.restaurant_id],
    };
  }

  if (queryType === 'nearest') {
    const withDistance = candidates
      .map((r) => ({ restaurant: r, distance: distanceToRestaurant(origin, r) }))
      .filter((x): x is { restaurant: Restaurant; distance: number } => x.distance !== null);
    if (withDistance.length === 0) return { kind: 'no-match', text: `Found ${label} restaurants${parkNote}, but no location data available.` };
    withDistance.sort((a, b) => a.distance - b.distance);
    const nearest = withDistance[0];
    return {
      kind: 'answer',
      text: `Nearest ${label} restaurant${parkNote}: ${nearest.restaurant.restaurant} (${formatProximityDistance(nearest.distance)}).`,
      restaurantIds: [nearest.restaurant.restaurant_id],
    };
  }

  // list
  const withDistance = candidates.map((r) => ({ restaurant: r, distance: distanceToRestaurant(origin, r) }));
  withDistance.sort((a, b) => {
    if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
    if (a.distance !== null) return -1;
    if (b.distance !== null) return 1;
    return a.restaurant.restaurant.localeCompare(b.restaurant.restaurant);
  });
  const LIST_CAP = 12;
  const shown = withDistance.slice(0, LIST_CAP);
  const lines = shown.map(
    ({ restaurant, distance }) => `${restaurant.restaurant}${distance !== null ? ` (${formatProximityDistance(distance)})` : ''}`
  );
  const remaining = withDistance.length - shown.length;
  const suffix = remaining > 0 ? `, and ${remaining} more location${remaining === 1 ? '' : 's'}` : '';
  return {
    kind: 'answer',
    text: `${label} restaurants${parkNote}: ${withDistance.length} found: ${lines.join('; ')}${suffix}.`,
    restaurantIds: candidates.map((restaurant) => restaurant.restaurant_id),
  };
}

// Owner request 2026-07-31: "what's the best pizza place"/"recommend a
// restaurant" -- this app has no ratings/opinion data to answer "best"
// from at all, but declining outright wastes the real, grounded fallback
// it CAN give (nearest/available real match for whatever food/cuisine/
// park was actually named). Wraps the entire real answerQuery logic below
// rather than touching every individual return statement inside it --
// query.subjective (rule_classifier.ts's SUBJECTIVE_PATTERN) can be set
// alongside any queryType, and this is the one place that needs to know
// about it, not every branch.
const SUBJECTIVE_HEDGE = "I can't tell you what's best, but here's a real match: ";
const SUBJECTIVE_EMPTY_DECLINE =
  "I can't make recommendations or rank things -- but tell me a food, cuisine, or park and I can point you to a real, nearby match.";

function attachAllergySafety(
  result: ExecutorResult,
  query: ClassifiedQuery
): AllergyAwareExecutorResult {
  if (!query.allergenKeys || query.allergenKeys.length === 0) return result;
  return {
    ...result,
    safety: {
      kind: 'allergy',
      acknowledgementVersion: ALLERGY_ACKNOWLEDGEMENT_VERSION,
      allergenKeys: [...query.allergenKeys],
    },
  };
}

export function answerQuery(query: ClassifiedQuery, data: LoadedData, origin: Coordinates = DEFAULT_ORIGIN): AllergyAwareExecutorResult {
  const result = answerQueryCore(query, data, origin);
  if (!query.subjective) return attachAllergySafety(result, query);
  if (result.kind === 'answer') {
    return attachAllergySafety({ ...result, text: `${SUBJECTIVE_HEDGE}${result.text}` }, query);
  }
  // No item/cuisine/service_style/restaurant to fall back on at all
  // ("recommend a restaurant") -- a plain "no real menu item" decline
  // would just echo a leftover word like "recommend" back at the user,
  // which reads as broken rather than as an honest scope limit.
  if (!query.item && !query.cuisine && !query.serviceStyle && !query.restaurantName) {
    return attachAllergySafety(
      { kind: result.kind === 'error' ? 'error' : 'unsupported', text: SUBJECTIVE_EMPTY_DECLINE },
      query
    );
  }
  return attachAllergySafety(result, query);
}

function answerQueryCore(query: ClassifiedQuery, data: LoadedData, origin: Coordinates): ExecutorResult {
  if (query.queryType === 'error') {
    return { kind: 'error', text: "Sorry, I couldn't process that question -- try rephrasing it." };
  }

  if (query.queryType === 'unsupported' || !query.queryType) {
    return {
      kind: 'unsupported',
      text: "I can help with Disney dining questions about food, menus, restaurants, prices, distance, and restaurant hours -- but not that question.",
    };
  }

  if (query.queryType === 'clarification' && query.clarification) {
    return {
      kind: 'clarification',
      text: query.clarification.prompt,
      clarification: {
        kind: query.clarification.kind,
        options: query.clarification.options,
      },
    };
  }

  if (query.queryType === 'cheapest' || query.queryType === 'nearest' || query.queryType === 'list') {
    // "where's the closest quickservice" -- the extracted term named a
    // service_style, not a food item (rule_classifier.ts already checked
    // this). Restaurant-attribute lookup, not menu-item matching at all.
    if (query.serviceStyle) {
      return answerServiceStyle(query.queryType, query.serviceStyle, data, origin, query.park);
    }
    // "where's the closest american restaurant" -- same shape as
    // service_style just above, checked right alongside it.
    if (query.cuisine) {
      return answerServiceStyle(query.queryType, query.cuisine, data, origin, query.park, 'cuisine');
    }
    if (!query.item) {
      if (query.allergenKeys) {
        return answerAllergyLocations(query.allergenKeys, data, origin, query.park);
      }
      return { kind: 'no-match', text: `No item was recognized in that question.` };
    }
    const parkNote = query.park ? ` in ${query.park}` : '';
    // "cheapest gluten-free pizza"/"where can I get peanut-free ice cream"
    // -- owner request 2026-07-31. `dietary` only widens candidate
    // gathering (see allergenDietarySet's comment); itemSafeForAllergens
    // below is the actual per-item correctness filter, applied to every
    // candidate regardless of which matcher found it.
    const dietary = allergenDietarySet(query.allergenKeys);
    const allergenNote = query.allergenKeys ? ` (${allergenPhrase(query.allergenKeys)})` : '';

    // "or" is always logical disjunction, never a single dish name. The
    // previous combined-phrase-first rule was appropriate for "Chicken and
    // Waffles" but let literal menu text such as "Pizza or Pepperoni Pizza"
    // steal "pizza or burgers" before union semantics ran.
    if (query.items && query.items.length > 1 && query.compoundMode === 'or') {
      if (query.allergenKeys) {
        return {
          kind: 'unsupported',
          text: `Allergen-filtered questions about multiple items at once aren't supported yet -- try asking about one item at a time.`,
        };
      }
      const compoundMatches = matchCompoundItems(query.items, data, query.park, 'or');
      if (compoundMatches.length === 0) {
        return {
          kind: 'no-match',
          text: `No real location${parkNote} serves any of "${query.items.join('", "')}" -- not answering.`,
        };
      }
      return answerCompound(query.queryType, query.items, compoundMatches, origin, parkNote, 'or');
    }

    // Combined single-phrase match tried first -- "chicken and waffles" is
    // a real dish name, not a compound request, so it must never be split
    // apart just because "and" appears in it. Only fall back to the
    // genuine compound (intersection) interpretation below if this fails.
    // "list" uses the union matcher (category+name+description) since
    // completeness matters more there than for a single cheapest/nearest
    // winner -- see matchItemsForList's comment.
    // Allergen queries ALWAYS use the union matcher too, even for
    // cheapest/nearest -- found live (owner request 2026-07-31, while
    // testing "cheapest peanut free burger"): matchItems()'s strict
    // cascade returns as soon as ANY category match exists and never
    // falls back to name search, so if that category batch happens to be
    // e.g. gluten-labeled burgers (or non-allergy-labeled ones) rather
    // than peanut-labeled ones, itemSafeForAllergens wipes the whole batch
    // out below and a real peanut-friendly item found only by name (e.g.
    // "Cheeseburger - Peanut/Tree Nut Allergy-Friendly", filed under a
    // category that isn't an exact "burger" segment match) is never seen.
    // The precision the strict cascade exists to protect is already
    // covered by itemSafeForAllergens' own exact allergen check afterward,
    // so there's no precision cost to using the union matcher here.
    const singleItemMatcher = (t: string): ItemCandidate[] =>
      query.queryType === 'list'
        ? matchItemsForList(t, data, query.park, dietary)
        : matchItemsForSingleWinner(t, data, query.park, dietary);
    // "the absolute best fresh-made churros" -- the full phrase almost
    // never matches anything literal; significantPhraseFallback (above)
    // only runs once this direct attempt has already come up empty.
    // `displayItem` tracks whichever term actually produced the match --
    // found live: even once the fallback correctly landed on "dole whip"
    // for "serves real Dole Whip float variations besides Aloha Isle,"
    // every answer template still echoed the whole original noisy phrase
    // back in quotes, which reads as broken even when the underlying
    // restaurant results are exactly right.
    let displayItem = query.item;
    const singleCandidatesRaw = (() => {
      const direct = singleItemMatcher(query.item);
      if (direct.length > 0) return direct;
      // Once a genuine compound was parsed, a partial sliding-window match
      // ("burger and" from "burger and beer") must not steal the query
      // before intersection semantics run. Exact combined dishes such as
      // "Chicken and Waffles" have already had their direct attempt above.
      if (query.items && query.items.length > 1) return [];
      const fallback = significantPhraseFallback(query.item, (c) => cheapCandidateProbeCount(c, data, dietary), singleItemMatcher);
      if (!fallback) return [];
      displayItem = fallback.matchedTerm;
      return fallback.results;
    })();
    const singleCandidates = query.allergenKeys
      ? singleCandidatesRaw.filter((c) => itemSafeForAllergens(c.item, query.allergenKeys!))
      : singleCandidatesRaw;

    if (singleCandidates.length === 0 && query.items && query.items.length > 1) {
      // Compound ("X and Y") + allergen together isn't supported yet --
      // matchCompoundItems/answerCompound below have no allergen filtering
      // at all, so silently falling through to them here would answer as
      // if the allergen requirement had been checked when it hadn't. A
      // worse failure than declining outright, given what's at stake.
      if (query.allergenKeys) {
        return {
          kind: 'unsupported',
          text: `Allergen-filtered questions about multiple items at once ("X and Y") aren't supported yet -- try asking about one item at a time.`,
        };
      }
      const compoundMode = query.compoundMode ?? 'and';
      const compoundMatches = matchCompoundItems(query.items, data, query.park, compoundMode);
      if (compoundMatches.length === 0) {
        const coverage = compoundMode === 'or' ? 'any of' : 'all of';
        return {
          kind: 'no-match',
          text: `No real location${parkNote} serves ${coverage} "${query.items.join('", "')}" -- not answering.`,
        };
      }
      return answerCompound(query.queryType, query.items, compoundMatches, origin, parkNote, compoundMode);
    }

    if (singleCandidates.length === 0) {
      const allergenSuffix = query.allergenKeys ? ` labeled ${allergenPhrase(query.allergenKeys)} by Disney` : '';
      return {
        kind: 'no-match',
        text: `"${displayItem}"${parkNote} doesn't match any real menu item${allergenSuffix} -- not answering.`,
      };
    }

    if (query.queryType === 'cheapest') {
      const priced = singleCandidates
        .map((c) => ({ candidate: c, price: resolveItemPrice(c.item) }))
        .filter((x): x is { candidate: ItemCandidate; price: number } => x.price !== null);
      if (priced.length === 0) {
        // Distinguish "this is a Prix Fixe/Buffet/Family Style place, price
        // is per-person for the whole meal, not per item" from a genuine
        // dead end -- the former is expected and worth explaining, not just
        // silently refusing to answer.
        const perPersonStyles = new Set(['Prix Fixe', 'Buffet', 'Family Style']);
        const perPersonRestaurant = singleCandidates.find((c) => c.restaurant.service_style && perPersonStyles.has(c.restaurant.service_style));
        if (perPersonRestaurant) {
          const priceNote = perPersonRestaurant.restaurant.price_tier_display ? ` (${perPersonRestaurant.restaurant.price_tier_display})` : '';
          return {
            kind: 'no-match',
            text: `"${displayItem}" is served at ${perPersonRestaurant.restaurant.restaurant}, a ${perPersonRestaurant.restaurant.service_style} restaurant priced per person for the whole meal${priceNote}, not per item -- there's no single item price to compare.`,
          };
        }
        return { kind: 'no-match', text: `Matched "${displayItem}" but no priced entries found.` };
      }
      const sorted = [...priced].sort((a, b) => a.price - b.price);
      const cheapest = sorted[0];
      const displayPrice = cheapest.candidate.item.price_display ?? `$${cheapest.price.toFixed(2)}`;
      const disclaimer = query.allergenKeys ? ` ${ALLERGY_DISCLAIMER}` : '';
      return {
        kind: 'answer',
        text: `${query.allergenKeys ? `${disneyAllergyAttribution(query.allergenKeys, false)} ` : ''}Cheapest "${displayItem}"${allergenNote} match${parkNote}: ${cheapest.candidate.item.item} (${displayPrice}) at ${cheapest.candidate.restaurant.restaurant}.${disclaimer}`,
        restaurantIds: [cheapest.candidate.restaurant.restaurant_id],
        itemIds: [cheapest.candidate.item.item_id],
      };
    }

    if (query.queryType === 'nearest') {
      const withDistance = singleCandidates
        .map((c) => ({ candidate: c, distance: distanceToRestaurant(origin, c.restaurant) }))
        .filter((x): x is { candidate: ItemCandidate; distance: number } => x.distance !== null);
      if (withDistance.length === 0) return { kind: 'no-match', text: `Matched "${displayItem}" but no location data available.` };
      withDistance.sort((a, b) => a.distance - b.distance);
      const nearest = withDistance[0];
      const disclaimer = query.allergenKeys ? ` ${ALLERGY_DISCLAIMER}` : '';
      return {
        kind: 'answer',
        text: `${query.allergenKeys ? `${disneyAllergyAttribution(query.allergenKeys, false)} ` : ''}Nearest "${displayItem}"${allergenNote} match${parkNote}: ${nearest.candidate.item.item} at ${nearest.candidate.restaurant.restaurant} (${formatProximityDistance(nearest.distance)}).${disclaimer}`,
        restaurantIds: [nearest.candidate.restaurant.restaurant_id],
        itemIds: [nearest.candidate.item.item_id],
      };
    }

    // "where can I get a hot dog" -- owner request 2026-07-31: enumerate
    // every location, not just the nearest/cheapest one.
    // Same item/category can appear at one restaurant multiple times
    // (different dining periods, or several matching items on the same
    // menu) -- a "where can I get X" answer should list restaurants, not
    // repeat one restaurant N times.
    const byRestaurant = new Map<string, ItemCandidate>();
    for (const c of singleCandidates) {
      if (!byRestaurant.has(c.restaurant.restaurant_id)) byRestaurant.set(c.restaurant.restaurant_id, c);
    }
    const deduped = Array.from(byRestaurant.values());
    // Distance-ordered when we have a location, same as "nearest" -- still
    // useful for a full list, closest-first rather than an arbitrary order.
    // Falls back to alphabetical for restaurants with no lat/lng on file.
    const withDistance = deduped.map((c) => ({ candidate: c, distance: distanceToRestaurant(origin, c.restaurant) }));
    withDistance.sort((a, b) => {
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.candidate.restaurant.restaurant.localeCompare(b.candidate.restaurant.restaurant);
    });
    const LIST_CAP = 12;
    const shown = withDistance.slice(0, LIST_CAP);
    const lines = shown.map(({ candidate, distance }) => {
      const distanceNote = distance !== null ? ` (${formatProximityDistance(distance)})` : '';
      return `${candidate.restaurant.restaurant}${distanceNote}: ${candidate.item.item}`;
    });
    const remaining = withDistance.length - shown.length;
    const suffix = remaining > 0 ? `, and ${remaining} more location${remaining === 1 ? '' : 's'}` : '';
    const disclaimer = query.allergenKeys ? ` ${ALLERGY_DISCLAIMER}` : '';
    return {
      kind: 'answer',
      text: `${query.allergenKeys ? `${disneyAllergyAttribution(query.allergenKeys, true)} ` : ''}"${displayItem}"${allergenNote}${parkNote} is available at ${withDistance.length} location${withDistance.length === 1 ? '' : 's'}: ${lines.join('; ')}${suffix}.${disclaimer}`,
      restaurantIds: deduped.map((candidate) => candidate.restaurant.restaurant_id),
      itemIds: deduped.map((candidate) => candidate.item.item_id),
    };
  }

  if (query.queryType === 'hours') {
    if (!query.restaurantName) {
      return { kind: 'no-match', text: `No restaurant was recognized in that question.` };
    }
    const ambiguity = restaurantClarification(query, data);
    if (ambiguity) return ambiguity;
    const restaurant = resolveRestaurant(query.restaurantName, data);
    if (!restaurant) {
      return { kind: 'no-match', text: `"${query.restaurantName}" doesn't match any real restaurant -- not answering.` };
    }
    // Owner-reported gap 2026-07-31: "what time does Casey's Corner open
    // tomorrow" always answered with today's hours -- the underlying data
    // (hoursData's 8-day rolling window) already had tomorrow's hours, the
    // word was just never read (see detectDayOffset in
    // rule_classifier.ts). "Tomorrow" is explicit in the answer text
    // itself, not just implied by which function ran, so this can't
    // silently repeat the exact confusion being fixed.
    const dayOffset = query.dayOffset ?? 0;
    const status = getStatusForDayOffset(data.hoursData, restaurant.restaurant_id, dayOffset);
    if (query.hoursMode === 'openNow' && dayOffset === 0) {
      if (status.kind === 'open') {
        return {
          kind: 'answer',
          text: `Yes, ${restaurant.restaurant} is open now. ${status.label}.`,
          restaurantIds: [restaurant.restaurant_id],
        };
      }
      if (status.kind === 'closed' || status.kind === 'refurbishment') {
        return {
          kind: 'answer',
          text: `No, ${restaurant.restaurant} is not open now. ${status.label || status.todayLabel}.`,
          restaurantIds: [restaurant.restaurant_id],
        };
      }
      return { kind: 'no-match', text: `${restaurant.restaurant}: ${status.label || 'no current hours on file'}.` };
    }
    const dayPrefix = dayOffset === 1 ? 'Tomorrow, ' : '';
    return {
      kind: 'answer',
      text: `${dayPrefix}${restaurant.restaurant}: ${status.todayLabel || status.label || 'no hours on file'}.`,
      restaurantIds: [restaurant.restaurant_id],
    };
  }

  // "how far is Nomad Lounge" -- owner request 2026-07-31. A different
  // question from "nearest X" (closest restaurant serving some item):
  // this assumes the restaurant and just wants the distance to it.
  if (query.queryType === 'distance') {
    if (!query.restaurantName) {
      return { kind: 'no-match', text: `No restaurant was recognized in that question.` };
    }
    const ambiguity = restaurantClarification(query, data);
    if (ambiguity) return ambiguity;
    const restaurant = resolveRestaurant(query.restaurantName, data);
    if (!restaurant) {
      return { kind: 'no-match', text: `"${query.restaurantName}" doesn't match any real restaurant -- not answering.` };
    }
    const distance = distanceToRestaurant(origin, restaurant);
    if (distance === null) {
      return { kind: 'no-match', text: `${restaurant.restaurant} doesn't have location data available.` };
    }
    return {
      kind: 'answer',
      text: `${restaurant.restaurant} is ${formatProximityDistance(distance)}.`,
      restaurantIds: [restaurant.restaurant_id],
    };
  }

  if (query.queryType === 'menu') {
    if (!query.restaurantName) return { kind: 'no-match', text: `No restaurant was recognized in that question.` };
    const ambiguity = restaurantClarification(query, data);
    if (ambiguity) return ambiguity;
    const restaurant = resolveRestaurant(query.restaurantName, data);
    if (!restaurant) return { kind: 'no-match', text: `"${query.restaurantName}" doesn't match any real restaurant -- not answering.` };
    return {
      kind: 'answer',
      text: `I can open ${restaurant.restaurant}'s full menu in Rumbly.`,
      restaurantIds: [restaurant.restaurant_id],
      actions: [openRestaurantAction(restaurant, 'View menu')],
    };
  }

  if (query.queryType === 'attributeList') {
    const matches = data.restaurants.filter((restaurant) => {
      if (query.park && !restaurantMatchesPark(restaurant, query.park)) return false;
      if (query.serviceStyle && restaurant.service_style !== query.serviceStyle) return false;
      if (query.attribute === 'walkup_list') return restaurant.has_walkup_list;
      if (query.attribute === 'reservations') return restaurant.accepts_reservations;
      if (query.attribute === 'mobile_order') return supportsMobileOrder(restaurant);
      return false;
    });
    if (matches.length === 0) return { kind: 'no-match', text: `No matching restaurants were found.` };
    const sorted = matches
      .map((restaurant) => ({ restaurant, distance: distanceToRestaurant(origin, restaurant) }))
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;
        return a.restaurant.restaurant.localeCompare(b.restaurant.restaurant);
      });
    const labels: Record<string, string> = {
      walkup_list: 'a Walk-Up List',
      reservations: 'reservations',
      mobile_order: 'Mobile Order',
    };
    const shown = sorted.slice(0, 12);
    const lines = shown.map(({ restaurant, distance }) =>
      `${restaurant.restaurant}${distance === null ? '' : ` (${formatProximityDistance(distance)})`}`
    );
    const remaining = sorted.length - shown.length;
    const suffix = remaining > 0 ? `, and ${remaining} more` : '';
    const liveNote = query.liveAvailability
      ? ` This confirms the feature exists, not current slot or ordering availability.`
      : '';
    return {
      kind: 'answer',
      text: `${sorted.length} restaurant${sorted.length === 1 ? '' : 's'} support ${labels[query.attribute ?? ''] ?? 'that feature'}: ${lines.join('; ')}${suffix}.${liveNote}`,
      restaurantIds: sorted.map(({ restaurant }) => restaurant.restaurant_id),
    };
  }

  // "does Cosmic Ray's have hamburgers" -- owner request 2026-07-31: given
  // a NAMED restaurant, check whether a specific item is on its menu --
  // the inverse of cheapest/nearest/list (given an item, find restaurants).
  // Reuses matchItemsForList (the union matcher) then filters to just this
  // restaurant, rather than building a separate single-restaurant matcher.
  if (query.queryType === 'hasItem') {
    if (!query.restaurantName) {
      return { kind: 'no-match', text: `No restaurant was recognized in that question.` };
    }
    const ambiguity = restaurantClarification(query, data);
    if (ambiguity) return ambiguity;
    const restaurant = resolveRestaurant(query.restaurantName, data);
    if (!restaurant) {
      return { kind: 'no-match', text: `"${query.restaurantName}" doesn't match any real restaurant -- not answering.` };
    }
    if (!query.item) {
      return { kind: 'no-match', text: `No item was recognized in that question.` };
    }
    const dietary = allergenDietarySet(query.allergenKeys);
    const atRestaurant = matchItemsForList(query.item, data, null, dietary).filter(
      (c) => c.restaurant.restaurant_id === restaurant.restaurant_id
    );
    if (atRestaurant.length === 0) {
      if (query.allergenKeys) {
        const phrase = allergenPhrase(query.allergenKeys);
        return {
          kind: 'no-match',
          text: `Disney doesn't publish a ${phrase} labeled "${query.item}" at ${restaurant.restaurant} -- ask a Cast Member about options. ${ALLERGY_DISCLAIMER}`,
        };
      }
      return { kind: 'answer', text: `No, ${restaurant.restaurant} doesn't appear to have "${query.item}" on its menu.` };
    }
    // "does Cosmic Ray's have a gluten-free burger" -- owner request
    // 2026-07-31. A real item matched, but that alone isn't the question;
    // must further check whether Disney's own labeling marks it (or any
    // version of it) allergen-friendly, and must never answer a flat "No"
    // when it isn't -- that would read as a claim about ingredients this
    // data was never asked to make.
    if (query.allergenKeys) {
      const phrase = allergenPhrase(query.allergenKeys);
      const safe = atRestaurant.filter((c) => itemSafeForAllergens(c.item, query.allergenKeys!));
      if (safe.length > 0) {
        const names = Array.from(new Set(safe.map((c) => c.item.item))).slice(0, 5);
        return {
          kind: 'answer',
          text: `${disneyAllergyAttribution(query.allergenKeys, names.length > 1)} ${restaurant.restaurant} has a ${phrase} labeled "${query.item}": ${names.join(', ')}. ${ALLERGY_DISCLAIMER}`,
          restaurantIds: [restaurant.restaurant_id],
          itemIds: safe.map((candidate) => candidate.item.item_id),
        };
      }
      const names = Array.from(new Set(atRestaurant.map((c) => c.item.item))).slice(0, 3);
      return {
        kind: 'no-match',
        text: `${restaurant.restaurant} has "${query.item}" (e.g. ${names.join(', ')}), but Disney doesn't publish a ${phrase} labeled version of it -- ask a Cast Member about options. ${ALLERGY_DISCLAIMER}`,
      };
    }
    const names = Array.from(new Set(atRestaurant.map((c) => c.item.item))).slice(0, 5);
    return {
      kind: 'answer',
      text: `Yes, ${restaurant.restaurant} has: ${names.join(', ')}.`,
      restaurantIds: [restaurant.restaurant_id],
      itemIds: atRestaurant.map((candidate) => candidate.item.item_id),
    };
  }

  // "what gluten-free options does Be Our Guest have" -- owner request
  // 2026-07-31: given a named restaurant, list every real item Disney
  // itself labels allergy-friendly there (optionally narrowed to one
  // specific allergen), rather than checking a single named item.
  if (query.queryType === 'allergyList') {
    if (!query.restaurantName) {
      if (query.allergenKeys) {
        return answerAllergyLocations(query.allergenKeys, data, origin, query.park);
      }
      return { kind: 'no-match', text: `No restaurant was recognized in that question.` };
    }
    const ambiguity = restaurantClarification(query, data);
    if (ambiguity) return ambiguity;
    const restaurant = resolveRestaurant(query.restaurantName, data);
    if (!restaurant) {
      return { kind: 'no-match', text: `"${query.restaurantName}" doesn't match any real restaurant -- not answering.` };
    }
    if (!query.allergenKeys) {
      return { kind: 'no-match', text: `No allergen was recognized in that question.` };
    }
    const phrase = allergenPhrase(query.allergenKeys);
    const items = data.menuItems.filter(
      (item) => item.restaurant_id === restaurant.restaurant_id && itemSafeForAllergens(item, query.allergenKeys!)
    );
    if (items.length === 0) {
      return {
        kind: 'no-match',
        text: `Disney doesn't publish any ${phrase} labeled items at ${restaurant.restaurant} -- ask a Cast Member about options. ${ALLERGY_DISCLAIMER}`,
      };
    }
    const uniqueNames = Array.from(new Set(items.map((i) => i.item)));
    const shown = uniqueNames.slice(0, 10);
    const remaining = uniqueNames.length - shown.length;
    const suffix = remaining > 0 ? `, and ${remaining} more` : '';
    return {
      kind: 'answer',
      text: `${disneyAllergyAttribution(query.allergenKeys, uniqueNames.length > 1)} ${restaurant.restaurant} has ${uniqueNames.length} ${phrase} labeled item${uniqueNames.length === 1 ? '' : 's'}: ${shown.join(', ')}${suffix}. ${ALLERGY_DISCLAIMER}`,
      restaurantIds: [restaurant.restaurant_id],
      itemIds: items.map((item) => item.item_id),
    };
  }

  // "does Cosmic Ray's have mobile order" / "does Nomad Lounge have a
  // walk-up list" -- owner request 2026-07-31, explicitly flagged as data
  // that already exists even though the feature didn't yet. Each key maps
  // to a real, direct field or facet, not a guess.
  if (query.queryType === 'attribute') {
    if (!query.restaurantName) {
      return { kind: 'no-match', text: `No restaurant was recognized in that question.` };
    }
    const ambiguity = restaurantClarification(query, data);
    if (ambiguity) return ambiguity;
    const restaurant = resolveRestaurant(query.restaurantName, data);
    if (!restaurant) {
      return { kind: 'no-match', text: `"${query.restaurantName}" doesn't match any real restaurant -- not answering.` };
    }
    if (query.attribute === 'walkup_list') {
      const actions: ExecutorAction[] = [openRestaurantAction(restaurant)];
      const disneyAction = restaurant.has_walkup_list ? openDisneyAction(restaurant, 'Check Disney Walk-Up List') : null;
      if (disneyAction) actions.push(disneyAction);
      return {
        kind: 'answer',
        text: restaurant.has_walkup_list
          ? `Yes, ${restaurant.restaurant} offers a Walk-Up List.${query.liveAvailability ? ` I can't see current availability, but you can check Disney.` : ''}`
          : `${restaurant.restaurant} does not appear to offer a Walk-Up List.`,
        restaurantIds: [restaurant.restaurant_id],
        actions,
      };
    }
    if (query.attribute === 'reservations') {
      if (!restaurant.accepts_reservations) {
        return {
          kind: 'answer',
          text: `${restaurant.restaurant} does not accept reservations.`,
          restaurantIds: [restaurant.restaurant_id],
        };
      }
      const recNote = restaurant.reservations_recommended ? ' (recommended)' : '';
      const actions: ExecutorAction[] = [openRestaurantAction(restaurant)];
      const disneyAction = openDisneyAction(restaurant, 'Check Disney reservations');
      if (disneyAction) actions.push(disneyAction);
      return {
        kind: 'answer',
        text: `${restaurant.restaurant} accepts reservations${recNote}.${query.liveAvailability ? ` I can't see live availability, but you can check Disney.` : ''}`,
        restaurantIds: [restaurant.restaurant_id],
        actions,
      };
    }
    if (query.attribute === 'mobile_order') {
      const hasMobileOrder = supportsMobileOrder(restaurant);
      const actions: ExecutorAction[] = [openRestaurantAction(restaurant)];
      const disneyAction = hasMobileOrder ? openDisneyAction(restaurant, 'Open Disney Mobile Order') : null;
      if (disneyAction) actions.push(disneyAction);
      return {
        kind: 'answer',
        text: `${restaurant.restaurant} ${hasMobileOrder ? 'does support' : "doesn't appear to support"} Mobile Order.`,
        restaurantIds: [restaurant.restaurant_id],
        actions,
      };
    }
    return { kind: 'no-match', text: `Don't know how to check that for ${restaurant.restaurant}.` };
  }

  return { kind: 'unsupported', text: `Unrecognized queryType "${query.queryType}" -- not executing.` };
}
