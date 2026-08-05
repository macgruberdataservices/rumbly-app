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
  { feature: 'walk_up_list', pattern: /\bwalk[\s-]*up\s+(?:list|waitlist)\b/gi },
  { feature: 'reservations', pattern: /\breservations?\b|\bbook(?:ing)?\b/gi },
  { feature: 'quick_service', pattern: /\bquick[\s-]*service\b/gi },
  { feature: 'character_dining', pattern: /\bcharacter (?:dining|breakfasts?|meals?)\b/gi },
  { feature: 'festival_booth', pattern: /\bfestival booths?\b|\bfood and wine(?: festival)?\b/gi },
  { feature: 'resort_bar', pattern: /\bresort (?:bars?|lounges?)\b/gi },
  { feature: 'wait_time', pattern: /\b(?:(?:shortest|huge) (?:current )?(?:wait|line)|wait times?|without (?:a )?(?:huge|long) line|waiting forever)\b/gi },
];

const DIETARY_PATTERNS = [
  { key: 'plant-based' as const, pattern: /\b(?:vegan|plant[\s-]?based)\b/gi },
  { key: 'vegetarian' as const, pattern: /\bvegetarian\b/gi },
  { key: 'kosher' as const, pattern: /\bkosher\b/gi },
  { key: 'kids' as const, pattern: /\b(?:kids?|children'?s|toddler)\b/gi },
];

const MEAL_PATTERNS = [
  { key: 'breakfast' as const, pattern: /\bbreakfasts?\b/gi },
  { key: 'lunch' as const, pattern: /\blunch\b/gi },
  { key: 'dinner' as const, pattern: /\bdinner\b/gi },
  { key: 'snack' as const, pattern: /\bsnacks?\b/gi },
];

const PROCESS_PATTERN = /\b(?:process|procedure|how (?:do|can|should) i|talk (?:to|with)|speak (?:to|with)|notify|tell (?:a|the)|ordering? allergy|special dietary request)\b/i;
const KITCHEN_PATTERN = /\b(?:dedicated,?\s+(?:(?:allergy[\s-]?(?:friendly )?)|(?:gluten[\s-]?free|gf) )?(?:kitchen|fryers?|equipment|prep area|facility|waffle iron)|shared (?:fryers?|equipment|oil)|same oil|separate (?:allergy[\s-]?(?:friendly )?)?(?:kitchen|fryers?|equipment|prep area|facility)|separate prep|swapped ingredients|without (?:needing )?(?:advance )?notice)\b/i;
const CROSS_CONTACT_PATTERN = /\bcross[\s-]?(?:contact|contamination)\b|\bcontaminat(?:e|ed|ion)\b/i;
const INGREDIENT_PATTERN = /\b(?:ingredients?|contain|made (?:with|from)|what(?:'s| is) in|avoid|free of|healthy|nutritious|nutrition(?:al)?|isn't fried|is not fried|not fried|keto(?:[ -]friendly)?|low[ -]carb|zero[ -]carb(?:ohydrate)?|sugar[ -]free|low[ -]glycemic)\b|\bis there\s+(?:soy|milk|dairy|egg|sesame|peanut|tree nut|fish|shellfish|gluten|wheat)\s+in\b/i;
const SAFETY_PATTERN = /\b(?:safe|safely|safest|safety|certified|risk[- ]free|guarantee|trust)\b/i;
const EDITORIAL_PATTERN = /\b(?:best|better|worst|good|great|decent|signature|downgrade|worth(?: the splurge| it| eating)?|hype|overrated|overpriced|quietest|tourist traps?|secret menu|food crawl|weird|gimmicky|funny|fancy date|highest[ -]rated|hidden gem|must[ -]eat|ultimate|top \d+|top dessert|most famous|real bbq|fake theme park|good value|fastest|shortest|most accommodating|most thorough|least risky|recommend(?:ed|ation)?|reviews?|mistakes?|gotten worse)\b/i;
const REPORTED_OUTCOME_PATTERN = /\b(?:reviews?|mistakes?|reported recently|gotten worse)\b/i;
const VENUE_AMENITY_PATTERN = /\b(?:quiet(?:est)?|shade|shaded|outdoor seating|air[ -]con(?:ditioned)?|air[ -]conditioned|indoors?|out of (?:the )?(?:heat|rain)|views?|castle views?|fireworks? (?:views?|show)|view (?:the )?(?:nighttime )?fireworks|live music(?:al entertainment)?|away from crowds|giant aquarium|surrounded by sea life|latte art|printed on the foam)\b/i;
const LIVE_AVAILABILITY_PATTERN = /\b(?:available|availability|join|wait ?list|wait times?|line time|huge wait|same[\s-]?day|right now|currently|still (?:get|book)|to[ -]?go[\s\S]*app)\b/i;
const PARK_OPERATIONS_PATTERN = /\b(?:park|epcot|magic kingdom|animal kingdom|hollywood studios)\b[\s\S]*\b(?:open|close|hours?|rope drop)\b|\b(?:open|close|hours?|rope drop)\b[\s\S]*\b(?:park|epcot|magic kingdom|animal kingdom|hollywood studios)\b/i;
const GENERAL_PATTERN = /\b(?:weather|forecast|temperature|ride|attraction|parade|mickey mouse|parking|refill stations?|first aid|medical|emergency|records? of past allergy orders?)\b/i;
const OFFICIAL_POLICY_PATTERN = /\b(?:outside food|bring (?:my|our|your|their|any )?(?:own )?food|mobile order (?:work|rules?)|dining plan|park hopper[\s\S]*dining|popcorn bucket[\s\S]*refill|cancel[\s\S]*reservation|reservation[\s\S]*(?:fee|deadline|rules?)|(?:need )?reservations?[\s\S]*(?:for )?quick[ -]service|quick[ -]service vs\.? table[ -]service|hotel restaurants?[\s\S]*park tickets?|tips? included|cash payment|physical register|dress code|adults? order (?:off )?(?:the )?(?:kids?|children'?s) (?:menu|meals?)|free cups? of water)\b/i;
const FOOD_PROXIMITY_CLOSE_PATTERN = /\b(?:where|who)\b[\s\S]*\b(?:get|find|buy|order|grab|eat|has|serves?|sells?|offers?)\b[\s\S]*\bclose\s*[?.!]*$/i;

function normalizeForMatching(value: string): string {
  return value
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
  const escaped = escapeRegExp(normalizeForMatching(alias))
    .replace(/ /g, '\\s+')
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

function extractAllergens(query: string): { keys: string[]; spans: SourceSpan[]; hasAllergyContext: boolean } {
  const keys = new Set<string>();
  const spans: SourceSpan[] = [];
  for (const entry of ALLERGEN_PATTERNS) {
    const matches = collectPatternSpans(query, entry.pattern);
    if (matches.length === 0) continue;
    entry.keys.forEach((key) => keys.add(key));
    spans.push(...matches);
  }
  const allergyContext = /\b(?:allerg(?:y|ies|ic|en|ens)|celiac|intoleran(?:t|ce))\b/i.test(query);
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

function requestedClaim(query: string, allergenKeys: string[], hasAllergyContext: boolean): ClaimType {
  if (PARK_OPERATIONS_PATTERN.test(query)) return 'live_park_operations';
  if (GENERAL_PATTERN.test(query)) return 'general_information';
  if (OFFICIAL_POLICY_PATTERN.test(query)) return 'official_policy';
  if (CROSS_CONTACT_PATTERN.test(query)) return 'cross_contact';
  if (/\b(?:most thorough|most accommodating|best\b[\s\S]*\baccommodat)\b/i.test(query)) return 'editorial_judgment';
  if (hasAllergyContext && (PROCESS_PATTERN.test(query) || /\b(?:request to speak|handle|accommodat|doctor'?s note|in advance|need to tell|check the allergy)\b/i.test(query))) return 'official_policy';
  if (/\bhow can i see\b[\s\S]*\b(?:ingredients?|nutrition(?:al)?)\b/i.test(query)) return 'official_policy';
  if (hasAllergyContext && /\bwithout needing to talk\b/i.test(query)) return 'kitchen_process';
  if (KITCHEN_PATTERN.test(query)) return 'kitchen_process';
  if (/\b(?:chef will|manager on[ -]site|allergy[ -]trained (?:chef|manager|staff))\b/i.test(query)) return 'kitchen_process';
  if (REPORTED_OUTCOME_PATTERN.test(query)) return 'editorial_judgment';
  if ((hasAllergyContext || allergenKeys.length > 0) && (SAFETY_PATTERN.test(query) || /\b(?:better for allergies|avoid entirely|everywhere (?:it'?s )?served)\b/i.test(query))) return 'allergy_safety';
  if (/\b(?:current|shortest)\b[\s\S]*\bwait\b|\bwait times?\b/i.test(query)) return 'live_availability';
  const hasObjectivePrice = /\b(?:under|below|less than|up to)\s*\$/i.test(query);
  const onlySoftSubjective = /\b(?:good|great|decent)\b/i.test(query) && !/\b(?:best|better|worst|fastest|shortest|recommend|reviews?|mistakes?|gotten worse|splurge)\b/i.test(query);
  const canIgnoreSoftSubjective = onlySoftSubjective
    && ((hasObjectivePrice && !/\bgood value\b/i.test(query)) || allergenKeys.length > 0);
  if ((EDITORIAL_PATTERN.test(query) && !canIgnoreSoftSubjective) || /^should i (?:eat|try|choose)\b/i.test(query.trim())) return 'editorial_judgment';
  if (/\b(?:spicy|spiciness|mild|hot and spicy)\b/i.test(query)) return 'sensory_attribute';
  if (LIVE_AVAILABILITY_PATTERN.test(query) && /\b(?:reservation|book|mobile[\s-]?order|walk[\s-]?up|wait ?list|wait times?|line time|huge wait|to[ -]?go)\b/i.test(query)) return 'live_availability';
  if (VENUE_AMENITY_PATTERN.test(query)) return 'venue_amenity';
  if (/\bpriced (?:the )?same|\bsame price\b|\bcompare prices?\b/i.test(query)) return 'price_comparison';
  if (INGREDIENT_PATTERN.test(query)) return 'ingredient_content';
  if (allergenKeys.length > 0 || hasAllergyContext) return 'disney_label';
  if (/\b(?:mobile[\s-]?order|walk[\s-]?up|reservations?|book(?:ing)?)\b/i.test(query)) return 'restaurant_feature';
  if (/\bquick[\s-]?service\b/i.test(query) && !/\b(?:vegan|vegetarian|allerg|meal|food|options?|items?|dishes?|serves?|get|find|eat|buy|order)\b/i.test(query)) return 'restaurant_feature';
  // In acquisition phrasing, a terminal “close” means nearby (“where can I
  // get fried rice close”), not a restaurant's closing time.
  if (/\b(?:hours?|open|close|closing)\b/i.test(query) && !FOOD_PROXIMITY_CLOSE_PATTERN.test(query)) return 'restaurant_hours';
  if (/\bserving\b[\s\S]*\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(query)) return 'restaurant_hours';
  const nearestNamesAnObject = /\b(?:closest|nearest)\s+(?!restaurant\b|place\b|location\b|spot\b)[a-z][\w'-]*/i.test(query)
    && !/\b(?:closest|nearest)\b[\s\S]*\bfrom\b/i.test(query);
  const nearestPlaceNamesFood = /\b(?:closest|nearest)\s+(?:restaurant|place|location|spot)\s+(?:for|with)\s+[a-z]/i.test(query);
  if (/\b(?:distance|far|walk|closest|nearest)\b/i.test(query)
    && !/\b(?:food|dish|item|serve|get|eat|buy|order)\b/i.test(query)
    && !nearestNamesAnObject
    && !nearestPlaceNamesFood) return 'restaurant_location';
  return 'menu_presence';
}

function requestedAction(query: string, claimType: ClaimType, entities: LinkedEntity[]): QueryAction {
  const hasRestaurant = entities.some((entity) => entity.type === 'restaurant');
  if (claimType === 'live_park_operations' || claimType === 'general_information') return 'handoff';
  if (claimType === 'official_policy' || claimType === 'kitchen_process' || claimType === 'cross_contact') return 'explain_process';
  if (/\b(?:compare|difference (?:in menu )?between)\b/i.test(query)) return 'compare';
  if (/\b(?:versus|vs\.?)\b/i.test(query) && entities.filter((entity) => entity.type === 'restaurant').length > 1) return 'compare';
  if (/\b(?:what(?:'s| is) on the menu|show (?:me )?(?:the )?menu|open (?:the )?menu|(?:draft|beer|cocktail) list)\b/i.test(query) && hasRestaurant) return 'open_menu';
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
    /\b(?:does|do|has|have)\b[\s\S]*?\b(?:have|serve|sell|offer)\s+(.+?)\??$/i,
    /\b(?:where|what place|which place|what restaurant|which restaurant|which locations?|which spots?|which stands?|what [\w-]+ (?:dining )?(?:option|location))[\s\S]*?\b(?:get|find|serves?|sells?|offers?|buy|order|grab|eat)\s+(.+?)\??$/i,
    /\bcan i\s+(?:get|find|buy|order|grab)\s+(.+?)\??$/i,
    /\bwhere\s+are\s+(.+?)\??$/i,
    /\bwho\s+(?:has|serves|sells|offers)\s+(.+?)\??$/i,
    /\b(?:closest|nearest)\s+(?:restaurant|place|location|spot)\s+(?:for|with)\s+(.+?)\??$/i,
    /\b(?:cheapest|closest|nearest)\s+(?:place to get\s+)?(.+?)\??$/i,
    /\b(?:serve|serves|selling|sells)\s+(.+?)\??$/i,
    /\bi want\s+(.+?)(?:,\s*where\b|\s+(?:at|in|near)\b|[?.!]*$)/i,
    /\b(?:we need|i need|looking for)\s+(.+?)(?:\s+(?:at|in|near)\b|[?.!]*$)/i,
    /\b(?:i(?:'d| would) like|craving)\s+(.+?)\??$/i,
    /\bshow me\s+(.+?)\??$/i,
    /\bis (?:the )?(.+?)\s+(?:still )?on (?:the )?menu\b/i,
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
    result = result.replace(new RegExp(`\\s+(?:at|in|inside|near|around|by|to)\\s+(?:the\\s+)?${escapeRegExp(location.text)}[\\s\\S]*$`, 'i'), '');
    result = result.replace(new RegExp(`\\s+(?:at|in|near|around|by|to)\\s+(?:the\\s+)?${escapeRegExp(location.text)}[?.!]*$`, 'i'), '');
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
  return term
    .replace(/,/g, ' ')
    .replace(/^[\s,]+/, '')
    .replace(/^[\s,]*(?:(?:a|an|the|some|any|those|that)\s+)+/i, '')
    .replace(/^(?:a|an|the)$/i, '')
    .replace(/^(?:iconic disney snacks like|disney (?:snacks )?like|comfort (?:food )?classics like)\s+/i, '')
    .replace(/^(?:(?:big|classic|fresh|freshly made|warm|savory|authentic|famous|iconic|refreshing|specialty|custom|customized|giant|quick|full|alcoholic|non-alcoholic)\s+)+/i, '')
    .replace(/^or\s+/i, '')
    .replace(/\s+(?:walt )?disney world$/i, '')
    .replace(/\s+(?:cart|stand|location|pavilion)$/i, '')
    .replace(/^(?:cart|stand|location|restaurant|place|spot)$/i, '')
    .replace(/\s+(?:that non-vegans will also love|across all four parks)\s*$/i, '')
    .replace(/\s+(?:with|for)\s*$/i, '')
    .replace(/[?.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractFoods(
  query: string,
  entities: LinkedEntity[],
  allergens: SourceSpan[],
  constraintSpans: SourceSpan[],
  vocabulary: ParserVocabulary
): { terms: string[]; mode: 'all' | 'any'; spans: SourceSpan[] } {
  const locationEntities = entities.filter((entity) => entity.type !== 'restaurant');
  let captured = stripTrailingLocation(foodCapture(query), locationEntities);
  const terseEntityQuery = entities.length > 0
    && !/\b(?:what|where|when|who|how|does|do|did|is|are|am|can|could|would|should|i|i'm|we|we're|my|our|have|has|serve|serves|sell|sells|offer|offers|find|get|want|need|open|close|menu|near|at|in)\b/i.test(query);
  const shortKeywordLookup = query.split(/\s+/).length <= 10
    && !/\b(?:i|i'm|we|we're|my|our|have|has|am|is|are|can|could|would|should|do|does|did)\b/i.test(query)
    && (locationEntities.length > 0 || /\b(?:location|where to (?:get|buy))\s*[?.!]*$/i.test(query));
  if (!captured && (terseEntityQuery || shortKeywordLookup)) {
    // Terse guest input commonly omits a verb: "Animal Kingdom ice cream
    // sandwich" or "Cosmic Ray's fries". Linked entities and typed
    // constraints provide a safe boundary for treating the remaining
    // contiguous text as the requested food rather than guessing globally.
    captured = withoutSpans(query, [...entities, ...allergens, ...constraintSpans])
      .replace(/\bwhere to (?:get|buy)\b/gi, ' ')
      .replace(/\b(?:closest|nearest|near|around|by|at|in|location)\b/gi, ' ')
      .replace(/\b(?:cart|stand|pavilion)\b\s*$/i, ' ')
      .replace(/[?.!]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!captured) return { terms: [], mode: 'all', spans: [] };
  const capturedSource = captured;
  for (const entity of entities.filter((entry) => entry.type === 'restaurant')) {
    captured = captured.replace(new RegExp(escapeRegExp(entity.text), 'ig'), '');
  }
  for (const allergen of allergens) captured = captured.replace(new RegExp(escapeRegExp(allergen.text), 'ig'), '');
  for (const constraint of constraintSpans) captured = captured.replace(new RegExp(escapeRegExp(constraint.text), 'ig'), '');
  captured = captured.replace(/\b(?:at|in|near)\b\s*$/i, '');
  // Exclusions and price ceilings are constraints, not part of the food
  // phrase handed to the item matcher.
  captured = captured
    .replace(/\s+\b(?:that\s+)?(?:isn't|is not|aren't|are not|other than|besides)\b[\s\S]*$/i, '')
    .replace(/\s+\b(?:under|below|less than|up to)\s*\$\s*\d+(?:\.\d{1,2})?\b/i, '')
    .replace(/\bfor\s+per person\b/gi, '')
    .replace(/\b(?:good|great|decent)\b/gi, '')
    .replace(/\bthat non-vegans will also love\b/gi, '')
    .replace(/\s+(?:or am i dreaming|asap|rn)\s*$/i, '');
  captured = captured.replace(/\b(?:food|foods|options?|items?|dishes?|something|anything)\b/gi, '').trim();
  if (!captured) return { terms: [], mode: 'all', spans: [] };

  const protectedPhrases = (vocabulary.protectedFoodPhrases ?? []).sort((a, b) => b.length - a.length);
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
  const sourceIndex = query.toLowerCase().indexOf(capturedSource.toLowerCase());
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

function locationConstraint(query: string, entities: LinkedEntity[]): QueryPlan['constraints']['location'] {
  const locations = entities.filter((entity): entity is LinkedEntity & { type: Exclude<EntityType, 'restaurant'> } => entity.type !== 'restaurant');
  const location = locations.at(-1);
  if (!location) return undefined;
  const prefix = query.slice(Math.max(0, location.start - 32), location.start);
  const relation = /\b(?:near|around|by)\s+(?:the\s+)?$/i.test(prefix)
    || /\b(?:closest|nearest)\b[\s\S]*\bto\s+(?:the\s+)?$/i.test(prefix) ? 'near' : 'in';
  return { relation, entityId: location.id, entityType: location.type, label: location.label };
}

function locationConstraints(query: string, entities: LinkedEntity[]): NonNullable<QueryPlan['constraints']['locations']> {
  return entities
    .filter((entity): entity is LinkedEntity & { type: Exclude<EntityType, 'restaurant'> } => entity.type !== 'restaurant')
    .map((location) => {
      const prefix = query.slice(Math.max(0, location.start - 32), location.start);
      const relation = /\b(?:near|around|by)\s+(?:the\s+)?$/i.test(prefix)
        || /\b(?:closest|nearest)\b[\s\S]*\bto\s+(?:the\s+)?$/i.test(prefix) ? 'near' as const : 'in' as const;
      return { relation, entityId: location.id, entityType: location.type, label: location.label };
    });
}

function meaningfulUnconsumed(query: string, spans: SourceSpan[]): string {
  const chars = Array.from(query);
  for (const span of spans) {
    for (let index = Math.max(0, span.start); index < Math.min(chars.length, span.end); index += 1) chars[index] = ' ';
  }
  return chars.join('')
    .replace(/\bi['’]?m\b/gi, ' ')
    .replace(/\b(?:what|where|who|how|there|it)['’]s\b/gi, ' ')
    .replace(/[^a-z0-9'&-]+/gi, ' ')
    .replace(/(?:^|\s)'s(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)'(?:re|ve|ll|d|t)(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)-(?:\s|$)/g, ' ')
    .replace(/(?:^|\s)'?m(?:\s|$)/gi, ' ')
    .replace(/\b(?:what|whats|where|which|who|how|does|do|is|are|am|can|could|would|should|i|im|my|me|we|our|son|wife|daughter|kid|yo|rn|asap|a|an|the|this|that|at|in|inside|near|around|by|to|for|of|on|with|and|or|as|about|through|before|please|tell|help|get|find|show|see|view|want|wanna|need|go|heading|later|place|places|location|locations|spot|spots|stand|stands|restaurant|restaurants|resort|dining|have|has|sell|sells|offer|offers|allow|allows|buy|order|grab|serve|serves|serving|eat|eating|food|foods|option|options|item|items|dish|dishes|meal|meals|anything|something|any|anywhere|there|right|now|today|tomorrow|tonight|morning|still|actually|also|too|again|standing|together|family|unique|year|available|advance|app|clearly|accommodate|accommodates|accommodation|accommodations|disney|list|lists|listed|label|labels|labeled|labelled|menu|allergy|allergies|allergic|allergen|allergens|safe|safely|safest|safety|best|better|worst|good|compare|cheapest|closest|nearest|open|broke|send|dreaming|per|person)\b/gi, ' ')
    .replace(/(?:^|\s)'(?:re|ve|ll|d|t)(?:\s|$)/gi, ' ')
    .replace(/(?:^|\s)&(?:\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
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
  const dietary = DIETARY_PATTERNS.flatMap((entry) => collectPatternSpans(analysisText, entry.pattern).length > 0 ? [entry.key] : []);
  const dietarySpans = DIETARY_PATTERNS.flatMap((entry) => collectPatternSpans(analysisText, entry.pattern));
  const meals = MEAL_PATTERNS.flatMap((entry) => collectPatternSpans(analysisText, entry.pattern).length > 0 ? [entry.key] : []);
  const mealSpans = MEAL_PATTERNS.flatMap((entry) => collectPatternSpans(analysisText, entry.pattern));
  const characterDetailSpans = collectPatternSpans(analysisText, /\bprincess(?:es)?\b/gi);
  const extractedCuisine = extractCuisine(analysisText, vocabulary);
  const cuisineOverlapsEntity = extractedCuisine.spans.some((span) => linkedEntities.some((entity) => span.start < entity.end && entity.start < span.end));
  const protectedFoodSpans = (vocabulary.protectedFoodPhrases ?? []).flatMap((phrase) =>
    collectPatternSpans(analysisText, new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi')));
  const cuisineOverlapsProtectedFood = extractedCuisine.spans.some((span) => protectedFoodSpans.some((food) => span.start < food.end && food.start < span.end));
  const cuisine = cuisineOverlapsEntity || cuisineOverlapsProtectedFood ? { spans: [] as SourceSpan[], value: undefined } : extractedCuisine;
  const hungerOnly = /^\s*(?:(?:i['’]?m|i am|we['’]?re|we are)\s+)?(?:really\s+|so\s+|very\s+)?hungry\s*[?.!]*$/i.test(sourceText);
  const hungerSpans = hungerOnly ? collectPatternSpans(analysisText, /[\s\S]+/g) : [];
  const discourseSpans = collectPatternSpans(
    analysisText,
    /\b(?:yo|asap|send help|or am i dreaming|my wife'?s|i'?m broke|we'?re)\b/gi
  );
  const menuRoutingSpans = collectPatternSpans(analysisText, /\b(?:draft|beer|cocktail) list\b/gi);
  const excludedFoods = extractExcludedFoods(analysisText);
  const groupOrderSpans = collectPatternSpans(analysisText, /\beat together as a family without three separate orders\b/i);
  const semanticText = withoutSpans(analysisText, linkedEntities).replace(/\s+/g, ' ');
  const claimType = requestedClaim(semanticText, allergens.keys, allergens.hasAllergyContext);
  let action = requestedAction(grammarText, claimType, linkedEntities);
  const foods = extractFoods(
    analysisText,
    linkedEntities,
    allergens.spans,
    [...features.spans, ...dietarySpans, ...mealSpans, ...characterDetailSpans, ...cuisine.spans, ...discourseSpans, ...hungerSpans, ...menuRoutingSpans],
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
  const allergenBurgerBun = analysisText.match(/\bbuns?\s+options?\s+for\s+(?:the\s+)?burgers?\b/i);
  if (allergenBurgerBun && allergens.keys.length > 0) foodTerms = ['burger'];
  if (meals.includes('snack') && foodTerms.every((term) => /^snacks?$/.test(term))) foodTerms = [];
  const allergenBurgerBun = analysisText.match(/\bbuns?\s+options?\s+for\s+(?:the\s+)?burgers?\b/i);
  if (allergenBurgerBun && allergens.keys.length > 0) foodTerms = ['burger'];
  const operationSpans = [
    ...collectPatternSpans(analysisText, /\b(?:under|below|less than|up to)\s*\$\s*\d+(?:\.\d{1,2})?/gi),
    ...collectPatternSpans(analysisText, /\b(?:right now|currently|open now|today|tomorrow|this morning|rn)\b/gi),
    ...collectPatternSpans(analysisText, /\b(?:across all four parks|at Walt Disney World)\b/gi),
    ...collectPatternSpans(analysisText, /\b(?:difference in menu between|atmosphere and food style)\b/gi),
    ...collectPatternSpans(analysisText, /\bbuns?\s+options?\s+for\s+(?:the\s+)?burgers?\b/gi),
    ...collectPatternSpans(analysisText, /\bbuns?\s+options?\s+for\s+(?:the\s+)?burgers?\b/gi),
    ...collectPatternSpans(analysisText, /\b(?:do not|don't|does not|doesn't|without)\s+(?:require|requiring|need|needing)?\s*(?:advance dining )?reservations?\s+for\s+walk[ -]in seating\b/gi),
    ...(proximityClose ? collectPatternSpans(analysisText, /\bclose(?=\s*[?.!]*$)/gi) : []),
    ...(claimType === 'restaurant_hours' ? collectPatternSpans(analysisText, /\b(?:hours?|open|close|closing)\b/gi) : []),
    ...collectPatternSpans(analysisText, /\b(?:cart|stand|location)(?=\s+(?:at|in|near|around|by)?\s*[a-z]|\s*[?.!]*$)/gi),
    ...collectPatternSpans(analysisText, /\b(?:draft|beer|cocktail) list\b/gi),
    ...(fallbackFoodSpan ? [fallbackFoodSpan] : []),
  ];
  const parsedLocations = locationConstraints(analysisText, linkedEntities);
  const consumedSpans: SourceSpan[] = [...linkedEntities, ...allergens.spans, ...features.spans, ...dietarySpans, ...mealSpans, ...characterDetailSpans, ...cuisine.spans, ...discourseSpans, ...hungerSpans, ...menuRoutingSpans, ...foods.spans, ...excludedFoods.spans, ...groupOrderSpans, ...operationSpans];
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
    && linkedEntities.some((entity) => entity.type !== 'restaurant')) {
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
  if (/\b(?:after|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(grammarText)
    && ['menu_presence', 'restaurant_hours', 'restaurant_feature'].includes(claimType)) {
    action = 'clarify';
    reasons.push('A clock-time boundary is present but is not represented by the current time constraint.');
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
      location: locationConstraint(analysisText, linkedEntities),
      locations: parsedLocations.length > 1 ? parsedLocations : undefined,
      locationMode: parsedLocations.length > 1 ? 'any' : undefined,
      locationSet: /\b(?:across|in)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:four|4)\s+(?:theme\s+)?parks\b|\bacross all four parks\b/i.test(grammarText)
        ? 'theme_parks'
        : undefined,
      requiredFeatures,
      excludedFeatures,
      serviceStyle: requiredFeatures.includes('quick_service') ? 'Quick Service' : undefined,
      cuisine: cuisine.value,
      priceOperation: /\b(?:cheapest|lowest priced|least expensive)\b/i.test(grammarText)
        ? 'cheapest'
        : /\b(?:under|below|less than|up to)\s*\$/i.test(grammarText) ? 'maximum' : undefined,
      maxPrice: Number(grammarText.match(/\b(?:under|below|less than|up to)\s*\$\s*(\d+(?:\.\d{1,2})?)/i)?.[1]) || undefined,
      distanceOperation: /\b(?:closest|nearest|near me|nearby)\b/i.test(grammarText) || proximityClose ? 'nearest' : undefined,
      time: /\btomorrow\b/i.test(grammarText) ? 'tomorrow' : /\b(?:right now|currently|open now|rn)\b/i.test(grammarText) ? 'now' : /\b(?:today|this morning)\b/i.test(grammarText) ? 'today' : undefined,
    },
    linkedEntities,
    diagnostics: { confidence, consumedSpans, meaningfulUnconsumedText: unconsumed, reasons },
  };
}
