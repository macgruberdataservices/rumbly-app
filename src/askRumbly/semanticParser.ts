import type {
  ClaimType,
  EntityType,
  LinkedEntity,
  ParserEntity,
  ParserVocabulary,
  QueryAction,
  QueryPlan,
  RestaurantFeature,
  SourceSpan,
} from './queryPlan.ts';
import { classifyWord, stripFunctionWordEdges } from './closedClass.ts';
import { matchFoodSpans } from './foodLexicon.ts';
import { canonicalGuestTerm } from './foodSynonyms.ts';
import {
  EDITORIAL_PATTERN,
  FOOD_PROXIMITY_CLOSE_PATTERN,
  RESTAURANT_PROXIMITY_CLOSE_PATTERN,
  resolveClaim,
} from './claimRules.ts';

const ALLERGEN_PATTERNS: ReadonlyArray<{ keys: string[]; pattern: RegExp }> = [
  // Disney publishes one combined Gluten/Wheat label. Keep that exact
  // source taxonomy instead of inventing two independent labels that no
  // menu row can satisfy.
  { keys: ['gluten-wheat'], pattern: /\b(?:gluten|wheat)[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\b(?:gluten|wheat) allerg(?:y|ic|ies)\b|\bgf\b/gi },
  { keys: ['milk'], pattern: /\b(?:dairy|milk)[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\b(?:dairy|milk) allerg(?:y|ic|ies)\b/gi },
  { keys: ['egg'], pattern: /\begg[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\begg allerg(?:y|ic|ies)\b/gi },
  { keys: ['fish'], pattern: /\bfish[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\bfish allerg(?:y|ic|ies)\b/gi },
  { keys: ['shellfish'], pattern: /\bshellfish[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\bshellfish allerg(?:y|ic|ies)\b/gi },
  { keys: ['peanut'], pattern: /\bpeanut[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\bpeanut allerg(?:y|ic|ies)\b/gi },
  { keys: ['tree-nut'], pattern: /\b(?:tree[\s-]?nut|nut)[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\b(?:tree[\s-]?nut|nut) allerg(?:y|ic|ies)\b/gi },
  { keys: ['sesame'], pattern: /\bsesame[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\bsesame allerg(?:y|ic|ies)\b/gi },
  { keys: ['soy'], pattern: /\bsoy[\s-]?(?:free|friendly|allerg(?:y|ic|ies))\b|\bsoy allerg(?:y|ic|ies)\b/gi },
  { keys: ['allergy-friendly'], pattern: /\ballergy[\s-]?(?:friendly|free)\b|\ballergen[\s-]?free\b/gi },
];

const FEATURE_PATTERNS: ReadonlyArray<{ feature: RestaurantFeature; pattern: RegExp }> = [
  { feature: 'mobile_order', pattern: /\bmobile[\s-]*order(?:ing)?\b/gi },
  { feature: 'walk_up_list', pattern: /\bwalk[\s-]*ups?\b(?:\s+(?:list|waitlist))?/gi },
  { feature: 'reservations', pattern: /\breservations?\b|\bbook(?:ing)?\b/gi },
  { feature: 'quick_service', pattern: /\b(?:quick|counter)[\s-]*service\b/gi },
  { feature: 'table_service', pattern: /\btable[\s-]*service\b|\bsit[\s-]*down\b/gi },
  { feature: 'character_dining', pattern: /\bcharacter (?:dining|breakfasts?|meals?)\b/gi },
  { feature: 'festival_booth', pattern: /\bfestival booths?\b|\bfood and wine(?: festival)?\b/gi },
  { feature: 'resort_bar', pattern: /\bresorts?\b[\s\S]{0,24}?\b(?:bars?|lounges?)\b|\b(?:bars?|lounges?)\b[\s\S]{0,24}?\bresorts?\b/gi },
  // Wait and queue vocabulary rather than the two phrasings ("without a huge
  // line", "waiting forever") that happened to appear in the corpus.
  { feature: 'wait_time', pattern: /\bwait\s?times?\b|\b(?:shortest|short|long|longest|huge|no|big)\s+(?:current\s+)?(?:wait|line|queue)\b|\bwaiting\b|\bhow long is the (?:wait|line|queue)\b/gi },
];

const DIETARY_PATTERNS = [
  { key: 'plant-based' as const, pattern: /\b(?:vegan|plant[\s-]?based)\b/gi },
  { key: 'vegetarian' as const, pattern: /\b(?:vegetarian|veggie)\b/gi },
  { key: 'kosher' as const, pattern: /\bkosher\b/gi },
  { key: 'kids' as const, pattern: /\b(?:kids?|children'?s|toddler)\b/gi },
];

const MEAL_PATTERNS = [
  { key: 'breakfast' as const, pattern: /\bbreakfasts?\b/gi },
  { key: 'lunch' as const, pattern: /\blunch\b/gi },
  { key: 'dinner' as const, pattern: /\bdinner\b/gi },
  { key: 'snack' as const, pattern: /\bsnacks?\b/gi },
];

const NAMED_ANCHOR_NEAR_RADIUS_MILES = 0.25;
// How far back "new" reaches. Rolling, so it stays meaningful as Rumbly's
// collection history lengthens.
const RECENCY_WINDOW_DAYS = 30;
const RECENCY_PATTERN = /\b(?:what(?:'s|s| is)?\s+new|anything\s+new|any\s+new|newly\s+(?:added|released)|recently\s+(?:added|released|new)|just\s+(?:added|released|dropped)|new\s+(?:items?|snacks?|foods?|menu items?|treats?|drinks?|desserts?|things?|additions?)|latest\s+(?:items?|snacks?|additions?|treats?)|\bnew\b)/gi;

function normalizeForMatching(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ');
}

function normalizeQueryWithSourceMap(value: string): { text: string; sourceIndexes: number[] } {
  let text = '';
  const sourceIndexes: number[] = [];
  let previousWasWhitespace = false;
  for (let index = 0; index < value.length; index += 1) {
    const original = value[index];
    const whitespace = /\s/.test(original);
    if (whitespace && previousWasWhitespace) continue;
    const normalized = whitespace
      ? ' '
      : original.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u2010-\u2015]/g, '-');
    text += normalized;
    sourceIndexes.push(index);
    previousWasWhitespace = whitespace;
  }
  return { text, sourceIndexes };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias: string): RegExp {
  // Hyphens and spaces are interchangeable in guest typing: "Sci-Fi Dine-In"
  // gets typed "sci fi dine in", and neither form should fail to link.
  // One pass over both separators. Doing spaces first and hyphens second
  // corrupts the character class the first pass just inserted.
  const escaped = escapeRegExp(normalizeForMatching(alias))
    .replace(/[ -]+/g, '\u0000')
    .replace(/\u0000/g, '[\\s-]+')
    .replace(/&/g, '(?:&|and)');
  return new RegExp(`(^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`, 'i');
}

function entityAliases(entity: ParserEntity): string[] {
  return Array.from(new Set([entity.label, ...entity.aliases]))
    .map(normalizeForMatching)
    .filter((alias) => alias.length >= 3)
    .sort((a, b) => b.length - a.length);
}

export function linkQueryEntities(query: string, vocabulary: ParserVocabulary): LinkedEntity[] {
  const normalized = normalizeQueryWithSourceMap(query);
  const candidates: LinkedEntity[] = [];
  for (const entity of vocabulary.entities) {
    for (const alias of entityAliases(entity)) {
      const match = normalized.text.match(aliasPattern(alias));
      if (!match || match.index == null) continue;
      const prefixLength = match[1]?.length ?? 0;
      const normalizedStart = match.index + prefixLength;
      const normalizedEnd = normalizedStart + match[2].length;
      const start = normalized.sourceIndexes[normalizedStart] ?? normalizedStart;
      const end = (normalized.sourceIndexes[normalizedEnd - 1] ?? normalizedEnd - 1) + 1;
      candidates.push({
        id: entity.id,
        label: entity.label,
        type: entity.type,
        matchedAlias: match[2],
        start,
        end,
        text: query.slice(start, end),
        distanceAnchor: entity.distanceAnchor,
      });
      break;
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const selected: LinkedEntity[] = [];
  for (const candidate of candidates) {
    if (selected.some((entity) => candidate.start < entity.end && candidate.end > entity.start)) continue;
    selected.push(candidate);
  }
  return selected.sort((a, b) => a.start - b.start);
}

function collectPatternSpans(query: string, pattern: RegExp): SourceSpan[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const spans: SourceSpan[] = [];
  for (const match of query.matchAll(regex)) {
    if (match.index == null) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return spans;
}

function withoutSpans(query: string, spans: SourceSpan[]): string {
  const chars = Array.from(query);
  for (const span of spans) {
    for (let index = Math.max(0, span.start); index < Math.min(chars.length, span.end); index += 1) chars[index] = ' ';
  }
  return chars.join('');
}

// Exported so tooling can reproduce the exact inputs claim detection receives.
export function extractAllergens(query: string): { keys: string[]; spans: SourceSpan[]; hasAllergyContext: boolean } {
  const keys = new Set<string>();
  const spans: SourceSpan[] = [];
  for (const entry of ALLERGEN_PATTERNS) {
    const matches = collectPatternSpans(query, entry.pattern);
    if (matches.length === 0) continue;
    entry.keys.forEach((key) => keys.add(key));
    spans.push(...matches);
  }
  const explicitAllergyContext = /\b(?:allerg(?:y|ies|ic|en|ens)|celiac|intoleran(?:t|ce))\b/i.test(query);
  const safetyAllergenContext = /\b(?:gluten|wheat|dairy|milk|egg|fish|shellfish|peanut|tree[\s-]?nut|nut|sesame|soy)\b[\s\S]{0,24}\b(?:safe|safely|safest)\b|\b(?:safe|safely|safest)\b[\s\S]{0,24}\b(?:gluten|wheat|dairy|milk|egg|fish|shellfish|peanut|tree[\s-]?nut|nut|sesame|soy)\b/i.test(query);
  const allergyContext = explicitAllergyContext || safetyAllergenContext;
  if (allergyContext) {
    const contextualAllergens: ReadonlyArray<{ key: string; pattern: RegExp }> = [
      { key: 'gluten-wheat', pattern: /\b(?:gluten|wheat|celiac)\b/gi },
      { key: 'milk', pattern: /\b(?:dairy|milk|lactose)\b/gi },
      { key: 'egg', pattern: /\beggs?\b/gi },
      { key: 'fish', pattern: /\bfish\b/gi },
      { key: 'shellfish', pattern: /\bshellfish\b/gi },
      { key: 'peanut', pattern: /\bpeanuts?\b/gi },
      { key: 'tree-nut', pattern: /\b(?:tree[\s-]?nuts?|nuts?)\b/gi },
      { key: 'sesame', pattern: /\bsesame\b/gi },
      { key: 'soy', pattern: /\bsoy\b/gi },
    ];
    for (const entry of contextualAllergens) {
      const matches = collectPatternSpans(query, entry.pattern);
      if (matches.length === 0) continue;
      keys.add(entry.key);
      spans.push(...matches);
    }
  }
  if (allergyContext && keys.size === 0 && /\blabel(?:ed|led|s|ing)?\b[\s\S]*\ballergens?\b|\ballergens?\b[\s\S]*\blabel(?:ed|led|s|ing)?\b/i.test(query)) {
    keys.add('allergy-friendly');
  }
  return { keys: Array.from(keys), spans, hasAllergyContext: allergyContext };
}

function extractFeatures(query: string): { features: RestaurantFeature[]; spans: SourceSpan[] } {
  const features: RestaurantFeature[] = [];
  const spans: SourceSpan[] = [];
  for (const entry of FEATURE_PATTERNS) {
    const matches = collectPatternSpans(query, entry.pattern);
    if (matches.length === 0) continue;
    features.push(entry.feature);
    spans.push(...matches);
  }
  return { features, spans };
}

function requestedAction(query: string, claimType: ClaimType, entities: LinkedEntity[]): QueryAction {
  const hasRestaurant = entities.some((entity) => entity.type === 'restaurant');
  if (claimType === 'live_park_operations' || claimType === 'general_information') return 'handoff';
  if (claimType === 'official_policy' || claimType === 'kitchen_process' || claimType === 'cross_contact') return 'explain_process';
  if (/\b(?:compare|difference (?:in menu )?between)\b/i.test(query)) return 'compare';
  if (/\b(?:versus|vs\.?)\b/i.test(query) && entities.filter((entity) => entity.type === 'restaurant').length > 1) return 'compare';
  if (/\b(?:what(?:'s| is) on the menu|what\s+(?:does|do|did)\b[\s\S]*?\b(?:have|serve|sell|offer)\s+(?:on\s+)?(?:the\s+)?menu|show (?:me )?(?:the )?menu|open (?:the )?menu|(?:draft|beer|cocktail) list)\b/i.test(query) && hasRestaurant) return 'open_menu';
  if (hasRestaurant && /\b(?:atmosphere|food style)\b/i.test(query)) return 'open_menu';
  if (/\b(?:see|view)\b[\s\S]*\bmenu\b/i.test(query) && hasRestaurant) return 'open_menu';
  if (claimType === 'restaurant_hours') return hasRestaurant ? 'hours' : 'find';
  if (claimType === 'restaurant_location') return hasRestaurant ? 'distance' : /\b(?:closest|nearest)\b/i.test(query) ? 'find' : 'distance';
  if (claimType === 'restaurant_feature' && hasRestaurant) return 'check_feature';
  if (/\b(?:still )?on (?:the )?menu\b/i.test(query) && hasRestaurant) return 'check_menu';
  if (/\b(?:does|do|has|have)\b/i.test(query) && hasRestaurant) return 'check_menu';
  return 'find';
}

function foodCapture(query: string): string {
  const patterns = [
    // Subjective ranking language still needs a concrete food object so the
    // app can transparently offer verified options without pretending it can
    // identify a winner.
    /^(?:(?:where(?:'s| is)|what(?:'s| is)|which is)\s+)?(?:(?:the|your)\s+)?(?:best|top|highest[ -]rated|favorite|must[ -]eat)\s+(?:place|restaurant|location|spot|stand)\s+(?:for|with|to\s+(?:get|find|buy|order|grab|eat|try))\s+(.+?)\??$/i,
    /^(?:(?:where(?:'s| is)|what(?:'s| is)|which is)\s+)?(?:(?:the|your)\s+)?(?:best|top|highest[ -]rated|favorite|must[ -]eat)\s+(.+?)\s+(?:place|restaurant|location|spot|stand)\??$/i,
    /\b(?:where(?:'s| is)|what(?:'s| is)|which is)\s+(?:(?:the|your)\s+)?(?:best|top|highest[ -]rated|favorite|must[ -]eat)\s+(.+?)\??$/i,
    /\bwhat\s+(.+?)\s+do you recommend\??$/i,
    /\brecommend\s+(?:me\s+)?(?!(?:(?:a|some)\s+)?(?:place|restaurant|location|spot|stand|somewhere)\b)(?:a\s+|some\s+)?(.+?)\??$/i,
    // Conversational wrappers should not make a guest translate their request
    // into search-engine grammar. Keep the bounded acquisition verb as the
    // semantic anchor, then parse the captured object normally.
    /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:help\s+(?:me|us)\s+)?(?:find|get|show|suggest|recommend)\s+(?:me\s+|us\s+)?(.+?)\??$/i,
    // "Suggest a place get a burger" is ordinary discovery language, not
    // a request for an editorial ranking. Guests often omit the optional
    // "to" in this compact app-query form, so accept both versions.
    /\b(?:suggest|suggests|suggested|recommend|recommends|recommended)\s+(?:me\s+)?(?:a\s+)?(?:place|restaurant|location|spot|stand|somewhere)\s+(?:to\s+)?(?:get|find|buy|order|grab|eat|have|try)\s+(.+?)\??$/i,
    /\b(?:suggest|suggests|suggested)\s+(?:me\s+)?(?:a\s+)?(.+?)\s+(?:place|restaurant|spot)\??$/i,
    /\b(?:does|do|has|have)\b[\s\S]*?\b(?:have|serve|sell|offer)\s+(.+?)\??$/i,
    /\b(?:what|which)\s+(?:place|restaurant|location|spot|stand)\s+(?:has|have|serves?|sells?|offers?)\s+(.+?)\??$/i,
    /\b(?:where|what place|which place|what restaurant|which restaurant|which locations?|which spots?|which stands?|what [\w-]+ (?:dining )?(?:option|location))[\s\S]*?\b(?:get|find|serves?|sells?|offers?|buy|order|grab|eat)\s+(.+?)\??$/i,
    /\bcan i\s+(?:get|find|buy|order|grab)\s+(.+?)\??$/i,
    /\bfind\s+(.+?)\??$/i,
    /\bwhere\s+are\s+(.+?)\??$/i,
    /\bwho\s+(?:has|serves|sells|offers)\s+(.+?)\??$/i,
    /\b(?:closest|nearest)\s+(?:restaurant|place|location|spot)\s+(?:for|with)\s+(.+?)\??$/i,
    /\b(?:cheapest|closest|nearest)\s+(?:place to get\s+)?(.+?)\??$/i,
    /\b(?:serve|serves|selling|sells)\s+(.+?)\??$/i,
    /\b(?:(?:i['’]?m|i am|we['’]?re|we are)\s+)?hungry\s+for\s+(.+?)\??$/i,
    /\bi want\s+(.+?)(?:,\s*where\b|\s+(?:at|in|near)\b|[?.!]*$)/i,
    /\b(?:we need|i need|looking for)\s+(.+?)(?:\s+(?:at|in|near)\b|[?.!]*$)/i,
    /\b(?:i(?:'d| would) like|craving)\s+(.+?)\??$/i,
    /\bshow me\s+(.+?)\??$/i,
    /\b(?:is|are)\s+(?:the\s+)?(.+?)\s+(?:still\s+)?(?:on (?:the )?menu|(?:still\s+)?(?:around|available|served|sold))\b/i,
    /\bare there\s+(.+?)\s+(?:options?|items?|dishes?|meals?|snacks?)\b/i,
    /\b(?:what|which)\s+(.+?)\s+(?:options?|items?|dishes?|meals?|snacks?)\s+(?:are|can|do|have)\b/i,
    /\b(?:what|which)\s+(.+?\b(?:options?|items?|dishes?|meals?|snacks?))\s+(?:are|can|do|have)\b/i,
    /\bwhat are (?:the )?(?:most unique )?(.+?)\s+available\b/i,
    /\bany\s+(.+?\b(?:snacks?|meals?|desserts?|drinks?))\b/i,
    /\bare (?:the )?(.+?)\s+(?:gluten|wheat|dairy|milk|egg|soy|nut|peanut|shellfish)[\s-]?(?:free|friendly)\b/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function stripTrailingLocation(text: string, locations: LinkedEntity[]): string {
  let result = text
    .replace(/\s+(?:right now|currently|today|tonight|tomorrow|rn)\s*$/i, '')
    .replace(/\s+(?:near|around|by)\s+me\s*$/i, '')
    .replace(/\s+close\s*$/i, '')
    .replace(/\s+(?:at|in|across)\s+(?:all of )?(?:walt )?disney world\s*$/i, '')
    .replace(/\s+across all four parks\s*$/i, '')
    .trim();
  for (const location of locations) {
    result = result.replace(new RegExp(`\\s+(?:at|in|inside|near|around|by|to|from)\\s+(?:the\\s+)?${escapeRegExp(location.text)}[\\s\\S]*$`, 'i'), '');
    result = result.replace(new RegExp(`\\s+(?:at|in|near|around|by|to|from)\\s+(?:the\\s+)?${escapeRegExp(location.text)}[?.!]*$`, 'i'), '');
  }
  return result
    .replace(/\s+(?:right now|currently|today|tonight|tomorrow|rn)\s*$/i, '')
    .trim();
}

function extractCuisine(query: string, vocabulary: ParserVocabulary): { value?: string; spans: SourceSpan[] } {
  const contextualAliases: Array<{ value: string; pattern: RegExp }> = [
    { value: 'british', pattern: /\bUnited Kingdom pavilion\b/i },
    { value: 'mexican', pattern: /\bMexico Pavilion\b/i },
    { value: 'african', pattern: /\bAfrican spices?\b/i },
    { value: 'polynesian', pattern: /\bPolynesian[\s-]inspired\b/i },
  ];
  for (const alias of contextualAliases) {
    const match = query.match(alias.pattern);
    if (match?.index != null && (vocabulary.cuisines ?? []).some((value) => normalizeForMatching(value) === alias.value)) {
      return { value: alias.value, spans: [{ start: match.index, end: match.index + match[0].length, text: match[0] }] };
    }
  }
  const cuisines = [...(vocabulary.cuisines ?? [])].sort((a, b) => b.length - a.length);
  for (const cuisine of cuisines) {
    const match = normalizeForMatching(query).match(aliasPattern(cuisine));
    if (!match || match.index == null) continue;
    const start = match.index + (match[1]?.length ?? 0);
    return { value: cuisine, spans: [{ start, end: start + match[2].length, text: query.slice(start, start + match[2].length) }] };
  }
  return { spans: [] };
}

function normalizeFoodTerm(term: string): string {
  const normalized = stripFunctionWordEdges(term
    .replace(/,/g, ' ')
    .replace(/^[\s,]+/, '')
    .replace(/^[\s,]*(?:(?:a|an|the|some|any|those|that)\s+)+/i, '')
    .replace(/^(?:a|an|the)$/i, '')
    .replace(/^(?:best|top(?:\s+\d+)?|highest[ -]rated|favorite|must[ -]eat|most famous|signature)\s+/i, '')
    .replace(/^(?:iconic disney snacks like|disney (?:snacks )?like|comfort (?:food )?classics like)\s+/i, '')
    .replace(/^(?:(?:big|classic|fresh|freshly made|warm|savory|authentic|famous|iconic|refreshing|specialty|custom|customized|giant|quick|full|alcoholic|non-alcoholic)\s+)+/i, '')
    .replace(/^or\s+/i, '')
    .replace(/\s+(?:walt )?disney world$/i, '')
    .replace(/\s+(?:cart|stand|location|pavilion)$/i, '')
    .replace(/^(?:cart|stand|location|restaurant|place|spot)$/i, '')
    .replace(/\s+across all four parks\s*$/i, '')
    .replace(/\s+(?:with|for)\s*$/i, '')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase());
  return canonicalGuestTerm(normalized);
}

// Adjectives that decorate a request without narrowing what would satisfy it.
// They are absorbed into the consumed span so they stop counting as unexplained
// meaning, but they never enter the term itself. Preparation modifiers such as
// "wood-fired" are deliberately absent: those change what counts as evidence
// and must survive into the item search.
const GENERIC_FOOD_MODIFIER = /^(?:big|classic|fresh|freshly|made|warm|savory|authentic|famous|iconic|refreshing|specialty|custom|customized|giant|quick|full|alcoholic|non-alcoholic|nice|tasty|delicious|yummy)$/i;

/**
 * Widen a recognised food span leftward over the words that modify it.
 *
 * The lexicon match alone is the head noun. A guest asking for a
 * "wood-fired style pizza" must not have that reduced to "pizza" — dropping
 * the modifier would turn a request Rumbly cannot verify into a confident
 * answer about a different dish. Anything unclaimed, contiguous, and carrying
 * content is therefore pulled into the term.
 */
function extendFoodSpanLeft(
  query: string,
  match: { start: number; end: number },
  blocked: ReadonlyArray<{ start: number; end: number }>,
): number {
  let start = match.start;
  const wordPattern = /[a-z0-9]+(?:'[a-z]+)?/gi;
  const words: SourceSpan[] = [];
  for (const found of query.matchAll(wordPattern)) {
    if (found.index == null || found.index >= match.start) continue;
    words.push({ start: found.index, end: found.index + found[0].length, text: found[0] });
  }
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    // Only a space or a hyphen may separate a modifier from what it modifies.
    if (!/^[\s-]*$/.test(query.slice(word.end, start))) break;
    if (blocked.some((span) => word.start < span.end && span.start < word.end)) break;
    if (classifyWord(word.text) !== 'content') break;
    start = word.start;
  }
  return start;
}

/**
 * Recognise food against the data-derived lexicon.
 *
 * This is the primary path. Because every term must be anchored by a word that
 * already exists in Rumbly's own menu vocabulary, surrounding grammar cannot
 * end up inside a food term — the failure mode that produced searches for
 * "burger while we are" and "dole whip to me". Spans that another typed
 * constraint already claimed (restaurant and park names, allergen wording,
 * dietary, meal, cuisine, and feature phrases) are excluded, so a food inside a
 * restaurant's own name is not mistaken for the request.
 */
// Words that separate one request into two. Everything else that can sit
// between two recognised foods ("float *with* rum", "chicken *over* rice")
// belongs to a single dish and must stay in one term, or the proof layer will
// be asked to verify a weaker claim than the guest actually made.
const FOOD_COORDINATION = /(?:^|\s)(?:and|or|vs\.?|versus|plus)(?:\s|$)|[,+/]/i;
const MAX_FOOD_JOIN_GAP = 25;
// Deliberately unspecific subjects. The executor and result proof already
// treat these as generic rather than as an item name to match.
const GENERIC_SUBJECT_TERM = /^(?:foods?|meals?|options?|dish(?:es)?|items?)$/i;

function recognizeFoods(
  query: string,
  claimedSpans: SourceSpan[],
  vocabulary: ParserVocabulary
): { terms: string[]; mode: 'all' | 'any'; spans: SourceSpan[] } | null {
  if (!vocabulary.foodLexicon) return null;
  const rawMatches = matchFoodSpans(query, vocabulary.foodLexicon, claimedSpans);
  if (rawMatches.length === 0) return null;

  // Disney's own naming means one dish often produces several lexicon hits
  // ("wood fired" + "pizza"). Rejoin anything the guest wrote as a single
  // request, and split only on real coordination.
  const groups: Array<{ start: number; end: number; union: boolean }> = [];
  for (const match of rawMatches) {
    const previous = groups[groups.length - 1];
    const between = previous ? query.slice(previous.end, match.start) : '';
    const separated = !previous
      || between.length > MAX_FOOD_JOIN_GAP
      || FOOD_COORDINATION.test(between)
      || claimedSpans.some((span) => previous.end < span.end && span.start < match.start);
    if (separated) {
      groups.push({ start: match.start, end: match.end, union: /\b(?:or|vs\.?|versus)\b/i.test(between) });
    } else previous.end = match.end;
  }

  const spans = groups.map((group, index) => {
    const blocked = [...claimedSpans, ...groups.filter((_, other) => other !== index)];
    const start = extendFoodSpanLeft(query, group, blocked);
    return { start, end: group.end, text: query.slice(start, group.end) };
  });
  const terms = spans.map((span) => span.text
    .split(/\s+/)
    // Decorative adjectives are consumed but dropped from the searched term.
    .filter((word, position, all) => position >= all.findIndex((candidate) => !GENERIC_FOOD_MODIFIER.test(candidate)))
    .join(' ')
    .replace(/[?.!,]+$/g, '')
    .toLowerCase()
    .trim());

  const mode: 'all' | 'any' = groups.some((group) => group.union) ? 'any' : 'all';
  const resolved = terms.map((term) => canonicalGuestTerm(term)).filter((term) => term.length > 0);
  if (resolved.length === 0) return null;
  return { terms: resolved, mode, spans };
}

function extractFoods(
  query: string,
  entities: LinkedEntity[],
  allergens: SourceSpan[],
  constraintSpans: SourceSpan[],
  vocabulary: ParserVocabulary
): { terms: string[]; mode: 'all' | 'any'; spans: SourceSpan[] } {
  const recognized = recognizeFoods(query, [...entities, ...allergens, ...constraintSpans], vocabulary);
  if (recognized) return recognized;
  const fallback = captureFoods(query, entities, allergens, constraintSpans, vocabulary);
  // The capture path exists for food Rumbly has never listed, not for text that
  // names no food at all. A phrase whose head word is grammar or search
  // scaffolding ("hours", "the menu", "quick service places", "open right now")
  // is the question's shape, and searching menus for it produces a confident
  // no-match for something the guest never asked about.
  const named = fallback.terms.filter((term) => {
    const words = term.split(/\s+/).filter(Boolean);
    if (words.length === 0) return false;
    // "a meal", "food", "options" name a deliberately unspecific subject that
    // the executor and proof layer already understand as generic. They are the
    // one scaffolding shape that is genuinely the thing being asked for.
    if (words.length === 1 && GENERIC_SUBJECT_TERM.test(words[0])) return true;
    if (classifyWord(words[words.length - 1]) !== 'content') return false;
    return words.some((word) => classifyWord(word) === 'content');
  });
  if (named.length !== fallback.terms.length) return { terms: named, mode: fallback.mode, spans: fallback.spans };
  return fallback;
}

function captureFoods(
  query: string,
  entities: LinkedEntity[],
  allergens: SourceSpan[],
  constraintSpans: SourceSpan[],
  vocabulary: ParserVocabulary
): { terms: string[]; mode: 'all' | 'any'; spans: SourceSpan[] } {
  // Fallback for food Rumbly's menus have never listed. The request still
  // deserves an honest answer, so the original capture path runs — but its
  // output is trimmed of grammatical edges before it reaches the item matcher.
  const locationEntities = entities.filter((entity) => entity.type !== 'restaurant');
  let captured = stripTrailingLocation(foodCapture(query), locationEntities);
  const terseEntityQuery = entities.length > 0
    && !/\b(?:what|where|when|who|how|does|do|did|is|are|am|can|could|would|should|i|i'm|we|we're|my|our|have|has|serve|serves|sell|sells|offer|offers|find|get|want|need|open|close|menu|near|at|in)\b/i.test(query);
  const shortKeywordLookup = query.split(/\s+/).length <= 10
    && !/\b(?:i|i'm|we|we're|my|our|have|has|am|is|are|can|could|would|should|do|does|did)\b/i.test(query)
    && (locationEntities.length > 0
      || /\b(?:location|where to (?:get|buy))\s*[?.!]*$/i.test(query)
      || /\b(?:near me|nearby|close)\s*[?.!]*$/i.test(query));
  if (!captured && (terseEntityQuery || shortKeywordLookup)) {
    // Terse guest input commonly omits a verb: "Animal Kingdom ice cream
    // sandwich" or "Cosmic Ray's fries". Linked entities and typed
    // constraints provide a safe boundary for treating the remaining
    // contiguous text as the requested food rather than guessing globally.
    captured = withoutSpans(query, [...entities, ...allergens, ...constraintSpans])
      .replace(/\bwhere to (?:get|buy)\b/gi, ' ')
      .replace(/\b(?:closest|nearest|nearby|near|around|by|at|in|location)\b/gi, ' ')
      .replace(/\b(?:cart|stand|pavilion)\b\s*$/i, ' ')
      .replace(/[?.!]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!captured) return { terms: [], mode: 'all', spans: [] };
  const capturedSource = captured;
  const protectedPhrases = (vocabulary.protectedFoodPhrases ?? []).sort((a, b) => b.length - a.length);
  const preservedPhrases = new Map<string, string>();
  protectedPhrases.forEach((phrase, index) => {
    const token = `__preserved_food_${index}__`;
    const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'ig');
    if (!regex.test(captured)) return;
    captured = captured.replace(regex, token);
    preservedPhrases.set(token, phrase);
  });
  // Every linked entity, not just restaurants: a park name left inside the
  // capture becomes a food term ("I'm vegan, where should I eat in Animal
  // Kingdom?" searched menus for "animal kingdom").
  for (const entity of entities) {
    captured = captured.replace(new RegExp(escapeRegExp(entity.text), 'ig'), '');
  }
  for (const allergen of allergens) captured = captured.replace(new RegExp(escapeRegExp(allergen.text), 'ig'), '');
  for (const constraint of constraintSpans) captured = captured.replace(new RegExp(escapeRegExp(constraint.text), 'ig'), '');
  preservedPhrases.forEach((phrase, token) => { captured = captured.replace(token, phrase); });
  captured = captured.replace(/\b(?:at|in|near)\b\s*$/i, '');
  // Exclusions and price ceilings are constraints, not part of the food
  // phrase handed to the item matcher.
  captured = captured
    .replace(/\s+\b(?:that\s+)?(?:isn't|is not|aren't|are not|other than|besides)\b[\s\S]*$/i, '')
    .replace(/\s+\b(?:under|below|less than|up to)\s*\$\s*\d+(?:\.\d{1,2})?\b/i, '')
    .replace(/\b(?:good|great|decent)\b/gi, '')
;
  captured = captured.replace(/\b(?:food|foods|options?|items?|dishes?|something|anything)\b/gi, '').trim();
  if (!captured) return { terms: [], mode: 'all', spans: [] };

  const placeholders = new Map<string, string>();
  let protectedText = captured;
  protectedPhrases.forEach((phrase, index) => {
    const token = `__food_${index}__`;
    const regex = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'ig');
    if (!regex.test(protectedText)) return;
    protectedText = protectedText.replace(regex, token);
    placeholders.set(token, phrase);
  });
  const mode: 'all' | 'any' = /\s+(?:or|vs\.?|versus)\s+/i.test(protectedText) ? 'any' : 'all';
  const hasConnector = mode === 'any' ? /\s+(?:or|vs\.?|versus)\s+/i.test(protectedText) : /\s+and\s+/i.test(protectedText);
  const connector = mode === 'any' ? /\s*,\s*|\s+(?:or|vs\.?|versus)\s+/i : /\s*,\s*|\s+and\s+/i;
  const rawTerms = hasConnector ? protectedText.split(connector) : [protectedText];
  const terms = rawTerms.map((term) => {
    let restored = term;
    placeholders.forEach((phrase, token) => { restored = restored.replace(token, phrase); });
    return normalizeFoodTerm(restored);
  }).filter(Boolean);
  // Prefer the last occurrence that is not part of a linked restaurant name.
  // A venue such as "Plaza Ice Cream Parlor" repeats the requested food in
  // its own name; binding the first occurrence would leave the actual food
  // phrase unconsumed and incorrectly lower plan confidence.
  const queryLower = query.toLowerCase();
  const capturedLower = capturedSource.toLowerCase();
  let sourceIndex = queryLower.lastIndexOf(capturedLower);
  while (sourceIndex >= 0 && entities.some((entity) => sourceIndex < entity.end && entity.start < sourceIndex + capturedSource.length)) {
    sourceIndex = queryLower.lastIndexOf(capturedLower, sourceIndex - 1);
  }
  if (sourceIndex < 0) sourceIndex = queryLower.indexOf(capturedLower);
  const spans = sourceIndex >= 0 ? [{ start: sourceIndex, end: sourceIndex + capturedSource.length, text: query.slice(sourceIndex, sourceIndex + capturedSource.length) }] : [];
  return { terms, mode, spans };
}

function extractExcludedFoods(query: string): { terms: string[]; spans: SourceSpan[] } {
  const pattern = /\b(?:isn't|is not|aren't|are not|other than|besides|don'?t (?:wanna|want to) eat)\s+(?:just\s+)?(?:a|an|the)?\s*([a-z][a-z '&-]{1,40}?)(?=\s+again\b|[?.!,]|$)/gi;
  const terms: string[] = [];
  const spans: SourceSpan[] = [];
  for (const match of query.matchAll(pattern)) {
    if (match.index == null || !match[1]) continue;
    terms.push(normalizeFoodTerm(match[1]));
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return { terms, spans };
}

function isLocationEntity(entity: LinkedEntity): entity is LinkedEntity & { type: 'park' | 'area' | 'resort' } {
  return entity.type === 'park' || entity.type === 'area' || entity.type === 'resort';
}

function distanceAnchorConstraint(query: string, entities: LinkedEntity[]): QueryPlan['constraints']['distanceAnchor'] {
  const candidates = entities.filter((entity) => entity.distanceAnchor != null);
  for (const entity of [...candidates].reverse()) {
    const prefix = query.slice(Math.max(0, entity.start - 40), entity.start);
    if (/\b(?:from|to|near|around|by)\s+(?:the\s+)?$/i.test(prefix)) return entity.distanceAnchor;
  }
  return undefined;
}

function distanceAnchorRadius(query: string, anchor: QueryPlan['constraints']['distanceAnchor'], entities: LinkedEntity[]): number | undefined {
  if (!anchor) return undefined;
  const entity = entities.find((candidate) => candidate.distanceAnchor?.entityId === anchor.entityId);
  if (!entity) return undefined;
  const prefix = query.slice(Math.max(0, entity.start - 40), entity.start);
  return /\b(?:near|around|by)\s+(?:the\s+)?$/i.test(prefix) ? NAMED_ANCHOR_NEAR_RADIUS_MILES : undefined;
}

function locationConstraints(query: string, entities: LinkedEntity[]): NonNullable<QueryPlan['constraints']['locations']> {
  return entities
    .filter(isLocationEntity)
    .map((location) => {
      const prefix = query.slice(Math.max(0, location.start - 32), location.start);
      const relation = /\b(?:near|around|by)\s+(?:the\s+)?$/i.test(prefix)
        || /\b(?:closest|nearest)\b[\s\S]*\bto\s+(?:the\s+)?$/i.test(prefix) ? 'near' as const : 'in' as const;
      return { relation, entityId: location.id, entityType: location.type, label: location.label };
    });
}

/**
 * Text the parser could not explain.
 *
 * Previously this was one ~170-alternative stopword regex, which meant the fix
 * for any false "unconsumed meaning" report was to append another word — a
 * change that quietly weakened the confidence gate for every other question.
 * Word class now decides: grammar and dining-search scaffolding are explained
 * by definition, and anything left is a content word the parser genuinely
 * failed to account for. See closedClass.ts.
 */
function meaningfulUnconsumed(query: string, spans: SourceSpan[]): string {
  const chars = Array.from(query);
  for (const span of spans) {
    for (let index = Math.max(0, span.start); index < Math.min(chars.length, span.end); index += 1) chars[index] = ' ';
  }
  return chars.join('')
    .replace(/[’]/g, "'")
    .split(/[^a-z0-9']+/i)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length > 0 && classifyWord(word) === 'content')
    .join(' ')
    .trim();
}

export function parseQueryPlan(query: string, vocabulary: ParserVocabulary): QueryPlan {
  const sourceText = query.trim();
  // These substitutions preserve string length, so every extracted span still
  // points into the original user text while grammar matching sees one stable
  // punctuation form.
  const analysisText = sourceText
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, '-');
  const grammarText = analysisText.replace(/\s+/g, ' ');
  const proximityClose = FOOD_PROXIMITY_CLOSE_PATTERN.test(grammarText);
  const linkedEntities = linkQueryEntities(sourceText, vocabulary);
  const allergens = extractAllergens(analysisText);
  const features = extractFeatures(analysisText);
  const excludedFeatures: RestaurantFeature[] = /\b(?:do not|don't|does not|doesn't|without)\s+(?:require|requiring|need|needing)?\s*(?:advance dining )?reservations?\b/i.test(analysisText)
    ? ['reservations']
    : [];
  const requiredFeatures = features.features.filter((feature) => !excludedFeatures.includes(feature));
  // Spans inside a linked entity belong to its name, not to the request:
  // "Woody's Lunch Box" is a venue, not a lunch request, and "Sunshine
  // Seasons" is not a season.
  const insideEntity = (span: SourceSpan) =>
    linkedEntities.some((entity) => span.start < entity.end && entity.start < span.end);
  const dietarySpans = DIETARY_PATTERNS
    .flatMap((entry) => collectPatternSpans(analysisText, entry.pattern))
    .filter((span) => !insideEntity(span));
  const dietary = DIETARY_PATTERNS.flatMap((entry) =>
    collectPatternSpans(analysisText, entry.pattern).some((span) => !insideEntity(span)) ? [entry.key] : []);
  const protectedFoodSpans = (vocabulary.protectedFoodPhrases ?? []).flatMap((phrase) =>
    collectPatternSpans(analysisText, new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi')));
  const mealMatches = MEAL_PATTERNS.map((entry) => ({
    key: entry.key,
    spans: collectPatternSpans(analysisText, entry.pattern).filter((span) => !insideEntity(span) && !protectedFoodSpans.some(
      (food) => span.start < food.end && food.start < span.end,
    )),
  }));
  const meals = mealMatches.flatMap((entry) => entry.spans.length > 0 ? [entry.key] : []);
  const mealSpans = mealMatches.flatMap((entry) => entry.spans);
  const characterDetailSpans = collectPatternSpans(analysisText, /\bprincess(?:es)?\b/gi);
  const extractedCuisine = extractCuisine(analysisText, vocabulary);
  const cuisineOverlapsEntity = extractedCuisine.spans.some((span) => linkedEntities.some((entity) => span.start < entity.end && entity.start < span.end));
  const cuisineOverlapsProtectedFood = extractedCuisine.spans.some((span) => protectedFoodSpans.some((food) => span.start < food.end && food.start < span.end));
  const cuisine = cuisineOverlapsEntity || cuisineOverlapsProtectedFood ? { spans: [] as SourceSpan[], value: undefined } : extractedCuisine;
  const hungerOnly = /^\s*(?:(?:i['’]?m|i am|we['’]?re|we are)\s+)?(?:really\s+|so\s+|very\s+)?hungry\s*[?.!]*$/i.test(sourceText);
  const hungerSpans = hungerOnly ? collectPatternSpans(analysisText, /[\s\S]+/g) : [];
  const discourseSpans = collectPatternSpans(
    analysisText,
    /\b(?:hey|hi|hello|okay|ok)[,\s]+(?:rumbly\b[,\s]*)?|\brumbly\b[,\s]*|\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:help\s+(?:me|us)\s+)?(?:find|get|show|suggest|recommend)\s+(?:me|us\s+)?|\b(?:(?:i['’]?m|i am|we['’]?re|we are)\s+)?hungry\s+for\s+/gi
  );
  const menuRoutingSpans = collectPatternSpans(analysisText, /\b(?:draft|beer|cocktail) list\b/gi);
  const excludedFoods = extractExcludedFoods(analysisText);
  const asksWhatsNew = /\b(?:what(?:'s|s| is)?\s+new|anything\s+new|any\s+new|newly\s+(?:added|released)|recently\s+(?:added|released|new)|just\s+(?:added|released|dropped)|new\s+(?:items?|snacks?|foods?|menu items?|treats?|drinks?|desserts?|things?|additions?)|latest\s+(?:items?|snacks?|additions?|treats?))\b/i.test(analysisText);
  const recencySpans = asksWhatsNew ? collectPatternSpans(analysisText, RECENCY_PATTERN) : [];
  // The resort's own name is a scope, not a food or a leftover word.
  const resortScopeSpans = collectPatternSpans(analysisText, /\b(?:walt\s+)?disney\s+world\b/gi);
  const semanticText = withoutSpans(analysisText, linkedEntities).replace(/\s+/g, ' ');
  const claimResolution = resolveClaim({
    text: semanticText,
    allergenKeys: allergens.keys,
    hasAllergyContext: allergens.hasAllergyContext,
    hasRestaurantEntity: linkedEntities.some((entity) => entity.type === 'restaurant'),
    hasLocationEntity: linkedEntities.some((entity) => isLocationEntity(entity)),
    locationIsHoursSubject: linkedEntities.some((entity) => isLocationEntity(entity)
      && /\b(?:does|do|is|are|will|did)\s+(?:the\s+)?$/i.test(analysisText.slice(Math.max(0, entity.start - 24), entity.start))),
  });
  let claimType = claimResolution.claim;
  let action = requestedAction(grammarText, claimType, linkedEntities);
  const foods = extractFoods(
    analysisText,
    linkedEntities,
    allergens.spans,
    // Excluded foods are claimed here so a "not a hot dog" exclusion cannot
    // also be recognised as the food being requested.
    [...features.spans, ...dietarySpans, ...mealSpans, ...characterDetailSpans, ...cuisine.spans,
      ...discourseSpans, ...hungerSpans, ...menuRoutingSpans, ...excludedFoods.spans, ...resortScopeSpans,
      ...recencySpans],
    vocabulary
  );
  let foodTerms = foods.terms.filter((term) => normalizeForMatching(term) !== normalizeForMatching(cuisine.value ?? ''));
  let fallbackFoodSpan: SourceSpan | undefined;
  if (foodTerms.length === 0 && allergens.keys.length > 0) {
    const match = analysisText.match(/\b(?:gluten|wheat|dairy|milk|egg|soy|nut|peanut|shellfish)[\s-]?free\s+([a-z]+(?:\s+(?!anywhere\b|at\b|in\b|near\b|or\b)[a-z]+)?)(?=\s+(?:anywhere|at|in|near|or am)\b|[?.!]*$)/i);
    if (match?.[1] && match.index != null) {
      let fallbackText = match[1];
      for (const location of linkedEntities.filter((entity) => entity.type !== 'restaurant')) {
        fallbackText = fallbackText.replace(new RegExp(`\\s*${escapeRegExp(location.text)}\\s*$`, 'i'), '');
      }
      foodTerms = [normalizeFoodTerm(fallbackText)].filter(Boolean);
      const relative = match[0].indexOf(match[1]);
      fallbackFoodSpan = { start: match.index + relative, end: match.index + relative + match[1].length, text: match[1] };
    }
  }
  if (meals.includes('snack') && foodTerms.every((term) => /^snacks?$/.test(term))) foodTerms = [];
  // Menu-page requests are routing intents, not claims about a literal item
  // called "on the menu". Drop any food-capture residue before execution so
  // the proof layer validates the restaurant route rather than inventing a
  // menu-item requirement.
  if (action === 'open_menu') foodTerms = [];
  // Constraint spans are stripped in order, so an earlier meal span can consume
  // "snacks" out of "new snacks" before the recency span matches, leaving the
  // bare adjective behind as a food term.
  if (asksWhatsNew) foodTerms = foodTerms.filter((term) => !/^(?:new|newest|latest|recent|recently)$/i.test(term));
  // A named restaurant with nothing else being asked about is a request for
  // that restaurant's menu. Without this the executor is handed an item search
  // with no item and returns a raw adapter error to the guest.
  if (claimType === 'menu_presence'
    && foodTerms.length === 0
    && (action === 'find' || action === 'check_menu')
    && linkedEntities.some((entity) => entity.type === 'restaurant')) {
    action = 'open_menu';
  }
  const operationSpans = [
    ...collectPatternSpans(analysisText, /\b(?:under|below|less than|up to)\s*\$\s*\d+(?:\.\d{1,2})?/gi),
    ...collectPatternSpans(analysisText, /\b(?:right now|currently|open now|today|tomorrow|this morning|rn)\b/gi),
    ...collectPatternSpans(analysisText, /\b(?:near me|nearby)\b/gi),
    ...collectPatternSpans(analysisText, /\b(?:across all four parks|at Walt Disney World)\b/gi),
    ...collectPatternSpans(analysisText, /\bdifferences?\s+(?:in\s+menu\s+)?between\b/gi),
    ...collectPatternSpans(analysisText, /\b(?:do not|don't|does not|doesn't|without)\s+(?:require|requiring|need|needing)?\s*(?:advance dining )?reservations?\s+for\s+walk[ -]in seating\b/gi),
    ...(proximityClose ? collectPatternSpans(analysisText, /\bclose(?=\s*[?.!]*$)/gi) : []),
    ...(claimType === 'restaurant_hours' ? collectPatternSpans(analysisText, /\b(?:hours?|open|close|closing|when|what\s+time)\b/gi) : []),
    ...(claimType === 'restaurant_location' ? collectPatternSpans(analysisText, /\b(?:how\s+)?(?:far(?:\s+away)?|close(?:\s+by)?)\b/gi) : []),
    ...collectPatternSpans(analysisText, /\b(?:cart|stand|location)(?=\s+(?:at|in|near|around|by)?\s*[a-z]|\s*[?.!]*$)/gi),
    ...collectPatternSpans(analysisText, /\b(?:draft|beer|cocktail) list\b/gi),
    ...(claimType === 'editorial_judgment' ? collectPatternSpans(analysisText, EDITORIAL_PATTERN) : []),
    ...(fallbackFoodSpan ? [fallbackFoodSpan] : []),
  ];
  const parsedLocations = locationConstraints(analysisText, linkedEntities);
  const distanceAnchor = distanceAnchorConstraint(analysisText, linkedEntities);
  // A named area used as a distance origin is not also a search boundary.
  // "In Fantasyland" remains a strict scope, while "near Fantasyland" and
  // "nearest to Fantasyland" use the trusted central-area coordinate only.
  const scopedLocations = parsedLocations.filter((location) => location.entityId !== distanceAnchor?.entityId);
  const consumedSpans: SourceSpan[] = [...linkedEntities, ...allergens.spans, ...features.spans, ...dietarySpans, ...mealSpans, ...characterDetailSpans, ...cuisine.spans, ...discourseSpans, ...hungerSpans, ...menuRoutingSpans, ...resortScopeSpans, ...recencySpans, ...foods.spans, ...excludedFoods.spans, ...operationSpans];
  const unconsumed = meaningfulUnconsumed(analysisText, consumedSpans);
  const reasons: string[] = [];

  if (claimType === 'allergy_safety') reasons.push('Safety cannot be inferred; offer to search Disney-published labels instead.');
  if (claimType === 'cross_contact') reasons.push('Cross-contact is not represented in the local dataset.');
  if (claimType === 'kitchen_process') reasons.push('Kitchen procedures are not represented in the local dataset.');
  if (claimType === 'official_policy') reasons.push('Ordering process requires a maintained official Disney handoff.');
  if (claimType === 'ingredient_content') reasons.push('Menu descriptions are not complete ingredient evidence.');
  if (claimType === 'editorial_judgment') reasons.push('The dataset cannot support rankings or safety judgments.');
  if (hungerOnly) {
    action = 'clarify';
    reasons.push('What kind of food are you in the mood for, and where would you like to search?');
  }
  if (characterDetailSpans.length > 0) {
    action = 'clarify';
    reasons.push('The current restaurant data identifies character dining but not which specific characters appear. Did you mean any character meal?');
  }

  if (/\b(?:closest|nearest)\b[\s\S]*\b(?:from|to\s+(?!get\b|find\b|buy\b|eat\b|grab\b|order\b))/i.test(grammarText)
    && linkedEntities.some((entity) => entity.type !== 'restaurant')
    && !distanceAnchor) {
    action = 'clarify';
    reasons.push('I cannot yet measure from that exact landmark. Did you mean near the linked park area, or nearest to your current location?');
  }

  const needsRestaurant = ['check_menu', 'check_feature', 'open_menu', 'hours', 'distance'].includes(action);
  if (needsRestaurant && !linkedEntities.some((entity) => entity.type === 'restaurant')) {
    action = 'clarify';
    reasons.push(/\b(?:closest|nearest)\b[\s\S]*\b(?:from|to\s+(?!get\b|find\b|buy\b|eat\b|grab\b|order\b))/i.test(grammarText)
      ? 'I cannot yet measure from that exact landmark. Did you mean near the linked park area, or nearest to your current location?'
      : 'A restaurant must be identified before this plan can execute.');
  }
  if (claimType === 'allergy_safety') action = 'clarify';
  if (action === 'compare' && claimType === 'disney_label' && allergens.keys.length === 0) {
    action = 'clarify';
    reasons.push('A specific allergen is required before comparing Disney-published labels.');
  }
  // Any clock time, not only an explicit after/before bound. "Still serving
  // breakfast at 11am" names a moment the typed `time` constraint cannot
  // express, and answering from today's opening hours silently drops it.
  if (/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(grammarText)
    && ['menu_presence', 'restaurant_hours', 'restaurant_feature'].includes(claimType)) {
    action = 'clarify';
    reasons.push('A clock-time boundary is present but is not represented by the current time constraint.');
  }
  // Nothing to search. Reaching the executor with no food, no restaurant, and
  // no constraint produces an adapter error, which the guest sees as a generic
  // "something went wrong" for a question that was simply too open-ended.
  if (action === 'find'
    && claimType === 'menu_presence'
    && foodTerms.length === 0
    && linkedEntities.length === 0
    && scopedLocations.length === 0
    && allergens.keys.length === 0
    && dietary.length === 0
    && meals.length === 0
    && requiredFeatures.length === 0
    && !cuisine.value
    && !distanceAnchor
    && !/\b(?:cheapest|lowest priced|least expensive|under|below|less than|up to)\b/i.test(grammarText)
    && !/\b(?:closest|nearest|near me|nearby)\b/i.test(grammarText)) {
    action = 'clarify';
    reasons.push('What food are you looking for, and which park or area should I search?');
  }
  if (foodTerms.some((term) => /^(?:quick bite|bite|something|anything)(?:\s|$)/i.test(term))) {
    action = 'clarify';
    reasons.push('A specific food or restaurant feature is needed for this request.');
  }
  if (foodTerms.some((term) => /^late[ -]night(?:\s+food)?$/i.test(term))) {
    action = 'clarify';
    reasons.push('What time should count as late night for this search?');
  }

  const riskyUnconsumed = unconsumed && !/^(?:cheapest|closest|nearest|menu|hours?|open|close|cart|stand|location|mobile order|walk up list|reservations?)$/i.test(unconsumed);
  const confidence = riskyUnconsumed ? 'low' : reasons.length > 0 ? 'medium' : 'high';
  if (riskyUnconsumed) reasons.push(`Unconsumed meaning remains: "${unconsumed}".`);

  return {
    version: 1,
    sourceText,
    action,
    claimType,
    subject: {
      foodTerms,
      excludedFoodTerms: excludedFoods.terms,
      foodMode: foods.mode,
      restaurantIds: linkedEntities.filter((entity) => entity.type === 'restaurant').map((entity) => entity.id),
    },
    constraints: {
      allergenKeys: allergens.keys,
      allergenMode: 'all',
      dietaryKeys: dietary,
      mealPeriods: meals,
      location: scopedLocations.length === 1 ? scopedLocations[0] : undefined,
      locations: scopedLocations.length > 1 ? scopedLocations : undefined,
      locationMode: scopedLocations.length > 1 ? 'any' : undefined,
      locationSet: /\b(?:across|in)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:four|4)\s+(?:theme\s+)?parks\b|\bacross all four parks\b/i.test(grammarText)
        ? 'theme_parks'
        : undefined,
      requiredFeatures,
      excludedFeatures,
      serviceStyle: requiredFeatures.includes('quick_service') ? 'Quick Service' : undefined,
      cuisine: cuisine.value,
      recency: asksWhatsNew ? { withinDays: RECENCY_WINDOW_DAYS } : undefined,
      priceOperation: /\b(?:cheapest|lowest priced|least expensive)\b/i.test(grammarText)
        ? 'cheapest'
        : /\b(?:under|below|less than|up to)\s*\$/i.test(grammarText) ? 'maximum' : undefined,
      maxPrice: Number(grammarText.match(/\b(?:under|below|less than|up to)\s*\$\s*(\d+(?:\.\d{1,2})?)/i)?.[1]) || undefined,
      distanceOperation: /\b(?:closest|nearest|near me|nearby)\b/i.test(grammarText) || proximityClose ? 'nearest' : undefined,
      distanceAnchor,
      distanceRadiusMiles: distanceAnchorRadius(analysisText, distanceAnchor, linkedEntities),
      time: /\btomorrow\b/i.test(grammarText) ? 'tomorrow' : /\b(?:right now|currently|open now|rn)\b/i.test(grammarText) ? 'now' : /\b(?:today|this morning)\b/i.test(grammarText) ? 'today' : undefined,
    },
    linkedEntities,
    diagnostics: {
      confidence,
      consumedSpans,
      meaningfulUnconsumedText: unconsumed,
      reasons,
      // Which rule decided the claim, and on what evidence. A wrong claim is
      // then read directly off the plan — including in a thumbs-down feedback
      // record — instead of being re-derived from the pattern table by hand.
      claimRule: claimResolution.rule,
      claimFeatures: claimResolution.features,
    },
  };
}
