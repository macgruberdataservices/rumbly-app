// What claim is the guest asking Rumbly to make?
//
// This used to be 27 sequential `return` statements over one string. Rule
// position *was* the semantics: adding a condition meant reasoning about every
// condition above it and every condition below, so each new capability had a
// real chance of silently shadowing an older one. That is the mechanism behind
// the whack-a-mole feel, and it grows quadratically with the number of rules.
//
// The same evidence now runs in two separable stages. Every pattern contributes
// one named, independent feature, and a declared table maps feature sets to
// claims. Three things follow:
//
//   - a rule can be asserted in a test by name, without depending on the rules
//     around it;
//   - `matchingClaimRules` reports *every* rule a question satisfies, so
//     shadowing is visible instead of silent;
//   - a wrong claim is diagnosed by reading which features fired, rather than
//     by re-deriving 27 regexes by hand. The features travel on the plan, so
//     thumbs-down feedback records carry them too.
//
// Order still breaks ties, but it is now declared data with a stated reason
// rather than an accident of where someone inserted a line.

import type { ClaimType } from './queryPlan';

export type ClaimFeature =
  | 'park_operations'
  | 'general_topic'
  | 'official_policy_topic'
  | 'cross_contact'
  | 'accommodation_ranking'
  | 'kitchen_conversation'
  | 'ordering_process'
  | 'allergy_process_request'
  | 'kitchen_equipment'
  | 'trained_staff'
  | 'reported_outcome'
  | 'safety_language'
  | 'allergy_comparison'
  | 'wait_time'
  | 'editorial_language'
  | 'should_i_choose'
  | 'soft_subjective_ignorable'
  | 'sensory'
  | 'live_availability_language'
  | 'bookable_subject'
  | 'venue_amenity'
  | 'price_comparison'
  | 'ingredient'
  | 'allergy_present'
  | 'allergy_context'
  | 'feature_subject'
  | 'quick_service'
  | 'dining_object'
  | 'hours_language'
  | 'serving_clock_time'
  | 'food_proximity_close'
  | 'restaurant_proximity_close'
  | 'proximity_language'
  | 'food_acquisition'
  | 'nearest_names_object'
  | 'nearest_place_names_food'
  | 'restaurant_entity'
  | 'location_is_hours_subject'
  | 'location_entity'
  | 'needs_reservation';

// These three are exported because the parser also consumes their spans outside
// claim detection: editorial wording is marked consumed, and the two proximity
// patterns decide whether a terminal "close" means nearby or closing time.
//
// Judgment vocabulary, not remembered sentences. Every alternation here names a
// way guests express preference or ranking; phrases that were only ever in one
// development-corpus question ("tourist traps", "fancy date", "real bbq",
// "fake theme park", "food crawl", "secret menu", "top dessert") were removed,
// because matching them raised corpus scores without adding capability.
export const EDITORIAL_PATTERN = /\b(?:best|better|worse|worst|good|great|decent|favorite|signature|worth|hype|overrated|overpriced|weird|gimmicky|highest[ -]rated|hidden gem|must[ -]eat|ultimate|top \d+|most famous|fastest|shortest|recommend(?:ed|ation)?|reviews?|mistakes?)\b|\b(?:most|least)\s+(?!of\b|people\b|places?\b|restaurants?\b|items?\b)[a-z][a-z-]{3,}\b/i;
export const FOOD_PROXIMITY_CLOSE_PATTERN = /\b(?:where|who)\b[\s\S]*\b(?:get|find|buy|order|grab|eat|has|serves?|sells?|offers?)\b[\s\S]*\bclose\s*[?.!]*$/i;
export const RESTAURANT_PROXIMITY_CLOSE_PATTERN = /\b(?:how\s+)?close(?:\s+by)?\s+(?:is|are)\b/i;

const PROCESS_PATTERN = /\b(?:process|procedure|how (?:do|can|should) i|talk (?:to|with)|speak (?:to|with)|notify|tell (?:a|the)|ordering? allergy|special dietary request)\b/i;
const KITCHEN_CONVERSATION_PATTERN = /\b(?:talk|speak|chat)\s+(?:to|with|through)\s+(?:a\s+)?(?:chef|manager|cast member|someone|anyone)\b/i;
const KITCHEN_PATTERN = /\b(?:dedicated,?\s+(?:(?:allergy[\s-]?(?:friendly )?)|(?:gluten[\s-]?free|gf) )?(?:kitchen|fryers?|equipment|prep area|facility|waffle iron)|shared (?:fryers?|equipment|oil)|same oil|separate (?:allergy[\s-]?(?:friendly )?)?(?:kitchen|fryers?|equipment|prep area|facility)|separate prep|swapped ingredients|without (?:needing )?(?:advance )?notice)\b/i;
const CROSS_CONTACT_PATTERN = /\bcross[\s-]?(?:contact|contamination)\b|\bcontaminat(?:e|ed|ion)\b/i;
const INGREDIENT_PATTERN = /\b(?:ingredients?|contain|made (?:with|from)|avoid|free of|healthy|nutritious|nutrition(?:al)?|isn't fried|is not fried|not fried|keto(?:[ -]friendly)?|low[ -]carb|zero[ -]carb(?:ohydrate)?|sugar[ -]free|low[ -]glycemic)\b|\bwhat(?:'s|s| is)? in\s+(?:the\s+)?[a-z0-9]|\bis there\s+(?:soy|milk|dairy|egg|sesame|peanut|tree nut|fish|shellfish|gluten|wheat)\s+in\b/i;
const SAFETY_PATTERN = /\b(?:safe|safely|safest|safety|certified|risk[- ]free|guarantee|trust)\b/i;
const REPORTED_OUTCOME_PATTERN = /\b(?:reviews?|mistakes?|complaints?|reported|ratings?)\b/i;
// Amenity concepts the structured dataset cannot establish. "Giant aquarium",
// "surrounded by sea life", "latte art", and "printed on the foam" were single
// corpus sentences; the general concepts (aquarium, decoration) replace them.
const VENUE_AMENITY_PATTERN = /\b(?:quiet(?:est)?|shade|shaded|outdoor seating|air[ -]con(?:ditioned)?|air[ -]conditioned|indoors?|out of (?:the )?(?:heat|rain)|views?|fireworks?\s+(?:views?|show)|view(?:ing)?[\s\S]{0,20}fireworks?|live music(?:al entertainment)?|away from crowds|crowd levels?|aquarium|ambiance|ambience|atmosphere|decor(?:ated|ations?)?|themed? (?:seating|dining room))\b/i;
const LIVE_AVAILABILITY_PATTERN = /\b(?:availability|wait times?|line time|huge wait|same[\s-]?day|right now|currently|at the moment|today|tonight|still (?:get|book|available)|to[ -]?go[\s\S]*app)\b/i;
// Named parks are linked entities whose spans are blanked before claim
// detection, so listing them here never fired; the typed `park-hours-subject`
// rule handles that case. What remains is the literal word "park" and
// operations vocabulary.
const PARK_OPERATIONS_PATTERN = /\bparks?\b[\s\S]*\b(?:open|close|hours?|rope drop)\b|\b(?:open|close|hours?|rope drop)\b[\s\S]*\bparks?\b/i;
// "Records of past allergy orders" was one corpus sentence. An identity
// question ("who is ...") generalizes the Mickey Mouse example from the product
// contract without hard-coding a character name.
const GENERAL_PATTERN = /\b(?:weather|forecast|temperature|rides?|attractions?|parade|fireworks show|parking|refill stations?|first aid|medical|emergency|restrooms?|bathrooms?|lockers?|strollers?|wheelchairs?|ecv|guest services?|guest relations|concierge|monorail|buses|bus stop|skyliner|tram|ferry|transportation|atm|baby care|nursing|wifi|wi-fi|charging|gift shops?|merchandise|souvenirs?|photopass|memory maker|lost and found)\b|\bhow\s+(?:do|can|should)\s+(?:i|we)\s+get\s+to\b|\bwho\s+(?:is|are|was|were)\s+(?!open\b|serving\b|still\b)/i;
// Policy topics, stated as topics. Removed: "popcorn bucket refill",
// "physical register", "free cups of water", "hotel restaurants ... park
// tickets", "quick-service vs table-service", and the adults-ordering-kids-meals
// clause, each of which existed for exactly one corpus question.
const OFFICIAL_POLICY_PATTERN = /\b(?:outside food|bring (?:my|our|your|their|any )?(?:own )?food|mobile order (?:work|rules?)|dining plan|park hopper[\s\S]*dining|cancel[\s\S]*reservation|reservation[\s\S]*(?:fee|deadline|policy|rules?)|refund|dress code|gratuit(?:y|ies)|tipping|refill policy)\b|\breservations?\s+(?:open|window|drop|release)\b|\b(?:passholder|annual pass(?:holder)?|dvc|military)\s+discounts?\b|\bdiscounts?\b/i;

const HARD_SUBJECTIVE_PATTERN = /\b(?:best|better|worst|fastest|shortest|recommend|reviews?|mistakes?|splurge)\b/i;
const SOFT_SUBJECTIVE_PATTERN = /\b(?:good|great|decent)\b/i;
const OBJECTIVE_PRICE_PATTERN = /\b(?:under|below|less than|up to)\s*\$/i;

export interface ClaimInput {
  /** Query text with linked entity spans blanked out. */
  text: string;
  allergenKeys: string[];
  hasAllergyContext: boolean;
  /** A restaurant was linked in the question. */
  hasRestaurantEntity?: boolean;
  /** A park, area, or resort was linked in the question. */
  hasLocationEntity?: boolean;
  /**
   * A linked park, area, or resort is the grammatical subject of open/close
   * ("does Magic Kingdom open"), rather than a scope the search runs inside
   * ("what's open in Epcot"). Entity spans are blanked before claim detection,
   * so this cannot be recovered from `text` alone.
   */
  locationIsHoursSubject?: boolean;
}

const FEATURE_TESTS: ReadonlyArray<{ feature: ClaimFeature; test: (input: ClaimInput) => boolean }> = [
  { feature: 'park_operations', test: ({ text }) => PARK_OPERATIONS_PATTERN.test(text) },
  { feature: 'general_topic', test: ({ text }) => GENERAL_PATTERN.test(text) },
  { feature: 'official_policy_topic', test: ({ text }) => OFFICIAL_POLICY_PATTERN.test(text) },
  { feature: 'cross_contact', test: ({ text }) => CROSS_CONTACT_PATTERN.test(text) },
  { feature: 'accommodation_ranking', test: ({ text }) => /\b(?:most|least)\s+(?:thorough|accommodating|reliable)\b|\b(?:best|worst)\b[\s\S]*\baccommodat\w*/i.test(text) },
  { feature: 'kitchen_conversation', test: ({ text }) => KITCHEN_CONVERSATION_PATTERN.test(text) },
  { feature: 'ordering_process', test: ({ text }) => PROCESS_PATTERN.test(text) },
  {
    // Procedural framing, not the word "accommodate" on its own. "What
    // restaurants can accommodate a shellfish allergy?" is a search for labeled
    // options; "do I need to tell someone in advance?" is a process question.
    //
    // The old list carried a bare `\baccommodat\b`, which can never match
    // "accommodations" — the word boundary fails mid-word — so this feature
    // only ever fired through the remembered "doctor's note" phrasing beside
    // it. Removing that literal is what exposed the dead alternation.
    feature: 'allergy_process_request',
    test: ({ text }) => /\b(?:request to speak|in advance|need to tell|notify|inform|handles?|handled)\b/i.test(text)
      || /\bdo i (?:need|have to)\b/i.test(text),
  },
  { feature: 'kitchen_equipment', test: ({ text }) => KITCHEN_PATTERN.test(text) },
  { feature: 'trained_staff', test: ({ text }) => /\b(?:chef will|manager on[ -]site|allergy[ -]trained (?:chef|manager|staff))\b/i.test(text) },
  { feature: 'reported_outcome', test: ({ text }) => REPORTED_OUTCOME_PATTERN.test(text) },
  { feature: 'safety_language', test: ({ text }) => SAFETY_PATTERN.test(text) },
  {
    // Comparing venues on allergy handling is a safety judgment, whatever words
    // the guest uses. Grammar (a comparative or superlative in an allergy
    // context) generalizes the three remembered phrasings this replaced.
    feature: 'allergy_comparison',
    test: ({ text, allergenKeys, hasAllergyContext }) => (hasAllergyContext || allergenKeys.length > 0)
      && (/\b(?:better|worse|safer|riskier|versus|vs\.?|compared?)\b/i.test(text)
        // Telling a guest what to avoid is a safety judgment, not a menu fact.
        || /\b(?:avoid|steer clear|stay away|skip)\b/i.test(text)
        // A universal claim ("dairy-free everywhere it's served") cannot be
        // supported by per-row labels.
        || /\b(?:everywhere|always|every (?:location|place|time)|all locations|all of them)\b/i.test(text)),
  },
  { feature: 'wait_time', test: ({ text }) => /\bwait\s?times?\b|\b(?:current|shortest|short|long|longest|huge|no|big)\b[\s\S]{0,12}\b(?:wait|line|queue)\b/i.test(text) },
  { feature: 'editorial_language', test: ({ text }) => EDITORIAL_PATTERN.test(text) },
  { feature: 'should_i_choose', test: ({ text }) => /^should i (?:eat|try|choose)\b/i.test(text.trim()) },
  {
    // "A good burger under $15" and "a good gluten-free option" state a real
    // constraint; the adjective is filler rather than a request for a ranking
    // Rumbly cannot produce.
    feature: 'soft_subjective_ignorable',
    test: ({ text, allergenKeys }) => SOFT_SUBJECTIVE_PATTERN.test(text)
      && !HARD_SUBJECTIVE_PATTERN.test(text)
      && (OBJECTIVE_PRICE_PATTERN.test(text) || allergenKeys.length > 0),
  },
  { feature: 'sensory', test: ({ text }) => /\b(?:spicy|spiciness|mild|hot and spicy|sweetness|saltiness|texture)\b|\b(?:shaped|printed|drawn|decorated|topped)\s+(?:like|on|into|with)\b/i.test(text) },
  { feature: 'live_availability_language', test: ({ text }) => LIVE_AVAILABILITY_PATTERN.test(text) },
  { feature: 'bookable_subject', test: ({ text }) => /\b(?:reservation|book|mobile[\s-]?order|walk[\s-]?up|wait ?list|wait times?|line time|huge wait|to[ -]?go|availability)\b/i.test(text) },
  { feature: 'venue_amenity', test: ({ text }) => VENUE_AMENITY_PATTERN.test(text) },
  { feature: 'price_comparison', test: ({ text }) => /\bpriced (?:the )?same|\bsame price\b|\bcompare prices?\b/i.test(text) },
  { feature: 'ingredient', test: ({ text }) => INGREDIENT_PATTERN.test(text) },
  { feature: 'allergy_present', test: ({ allergenKeys, hasAllergyContext }) => hasAllergyContext || allergenKeys.length > 0 },
  { feature: 'allergy_context', test: ({ hasAllergyContext }) => hasAllergyContext },
  { feature: 'feature_subject', test: ({ text }) => /\b(?:mobile[\s-]?order|walk[\s-]?up|reservations?|book(?:ing)?)\b/i.test(text) },
  { feature: 'quick_service', test: ({ text }) => /\bquick[\s-]?service\b/i.test(text) },
  { feature: 'dining_object', test: ({ text }) => /\b(?:vegan|vegetarian|allerg|meal|food|options?|items?|dishes?|serves?|get|find|eat|buy|order)\b/i.test(text) },
  { feature: 'hours_language', test: ({ text }) => /\b(?:hours?|open|close|closing|stop serving|last call)\b/i.test(text) },
  { feature: 'serving_clock_time', test: ({ text }) => /\bserving\b[\s\S]*\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text) },
  { feature: 'food_proximity_close', test: ({ text }) => FOOD_PROXIMITY_CLOSE_PATTERN.test(text) },
  { feature: 'restaurant_proximity_close', test: ({ text }) => RESTAURANT_PROXIMITY_CLOSE_PATTERN.test(text) },
  { feature: 'proximity_language', test: ({ text }) => /\b(?:distance|far|walk|closest|nearest)\b/i.test(text) },
  { feature: 'food_acquisition', test: ({ text }) => /\b(?:food|dish|item|serve|get|eat|buy|order)\b/i.test(text) },
  {
    feature: 'nearest_names_object',
    test: ({ text }) => /\b(?:closest|nearest)\s+(?!restaurant\b|place\b|location\b|spot\b)[a-z][\w'-]*/i.test(text)
      && !/\b(?:closest|nearest)\b[\s\S]*\bfrom\b/i.test(text),
  },
  { feature: 'nearest_place_names_food', test: ({ text }) => /\b(?:closest|nearest)\s+(?:restaurant|place|location|spot)\s+(?:for|with)\s+[a-z]/i.test(text) },
  { feature: 'restaurant_entity', test: ({ hasRestaurantEntity }) => Boolean(hasRestaurantEntity) },
  { feature: 'location_is_hours_subject', test: ({ locationIsHoursSubject }) => Boolean(locationIsHoursSubject) },
  { feature: 'location_entity', test: ({ hasLocationEntity }) => Boolean(hasLocationEntity) },
  { feature: 'needs_reservation', test: ({ text }) => /\bneed\s+(?:a\s+|an\s+)?reservations?\b|\breservations?\s+required\b/i.test(text) },
];

/** Every feature the table can reference. Used to validate the rule set. */
export const CLAIM_FEATURES: ReadonlyArray<ClaimFeature> = FEATURE_TESTS.map((entry) => entry.feature);

export interface ClaimRule {
  name: string;
  claim: ClaimType;
  /** Every listed feature must be present. */
  all?: ClaimFeature[];
  /** At least one listed feature must be present. */
  any?: ClaimFeature[];
  /** No listed feature may be present. */
  none?: ClaimFeature[];
  why: string;
}

// Ordered by how strongly a match constrains what the guest can have meant.
// Out-of-domain topics come first because they are unambiguous; safety and
// process claims outrank menu claims because answering them from menu rows is
// the failure this system exists to prevent; the generic menu search is last.
export const CLAIM_RULES: ReadonlyArray<ClaimRule> = [
  { name: 'park-operations', claim: 'live_park_operations', all: ['park_operations'], why: 'Park hours and operations are outside dining data.' },
  { name: 'general-topic', claim: 'general_information', all: ['general_topic'], why: 'Weather, rides, and facilities are outside dining data.' },
  { name: 'official-policy-topic', claim: 'official_policy', all: ['official_policy_topic'], why: 'Policy questions belong to a maintained official source.' },
  { name: 'reservation-policy', claim: 'official_policy', all: ['needs_reservation'], none: ['restaurant_entity', 'location_entity'], why: 'Whether reservations are needed in general is policy; asked of a named place or park it is answerable from the reservations flag.' },
  { name: 'cross-contact', claim: 'cross_contact', all: ['cross_contact'], why: 'Cross-contact conditions are not in the dataset.' },
  { name: 'accommodation-ranking', claim: 'editorial_judgment', all: ['accommodation_ranking'], why: 'Ranking venues by accommodation quality has no ground truth.' },
  { name: 'allergy-kitchen-conversation', claim: 'kitchen_process', all: ['allergy_context', 'kitchen_conversation'], why: 'Talking to a chef is a kitchen process, not a menu fact.' },
  { name: 'allergy-ordering-process', claim: 'official_policy', all: ['allergy_context'], any: ['ordering_process', 'allergy_process_request'], why: 'Allergy ordering procedure belongs to official guidance.' },
  { name: 'kitchen-equipment', claim: 'kitchen_process', all: ['kitchen_equipment'], why: 'Fryers, prep areas, and equipment are not in the dataset.' },
  { name: 'allergy-trained-staff', claim: 'kitchen_process', all: ['trained_staff'], why: 'Staff training and presence are not in the dataset.' },
  { name: 'reported-outcome', claim: 'editorial_judgment', all: ['reported_outcome'], why: 'Reviews and reported outcomes have no ground truth.' },
  { name: 'allergy-safety', claim: 'allergy_safety', all: ['allergy_present'], any: ['safety_language', 'allergy_comparison'], why: 'Rumbly cannot decide what is safe, only what Disney labels.' },
  { name: 'wait-time', claim: 'live_availability', all: ['wait_time'], why: 'Rumbly has no live wait-time source.' },
  { name: 'editorial-ranking', claim: 'editorial_judgment', all: ['editorial_language'], none: ['soft_subjective_ignorable'], why: 'Ranking language has no editorial ground truth.' },
  { name: 'should-i-choose', claim: 'editorial_judgment', all: ['should_i_choose'], why: 'Choosing for the guest is an editorial judgment.' },
  { name: 'sensory-attribute', claim: 'sensory_attribute', all: ['sensory'], why: 'Spiciness and similar qualities are not structured data.' },
  { name: 'live-availability', claim: 'live_availability', all: ['live_availability_language', 'bookable_subject'], why: 'Current availability needs an official handoff. The bookable subject is what separates it from a menu question that merely mentions now.' },
  { name: 'venue-amenity', claim: 'venue_amenity', all: ['venue_amenity'], why: 'Seating, views, and atmosphere are not structured data.' },
  { name: 'price-comparison', claim: 'price_comparison', all: ['price_comparison'], why: 'A comparable item pair must be identified first.' },
  { name: 'ingredient-content', claim: 'ingredient_content', all: ['ingredient'], why: 'Menu descriptions are not complete ingredient statements.' },
  { name: 'disney-allergy-label', claim: 'disney_label', all: ['allergy_present'], why: 'An allergen was named and no stronger claim applies.' },
  { name: 'restaurant-feature', claim: 'restaurant_feature', all: ['feature_subject'], why: 'Mobile Order, Walk-Up List, and reservations are restaurant flags.' },
  { name: 'quick-service-subject', claim: 'restaurant_feature', all: ['quick_service'], none: ['dining_object'], why: 'Quick service alone asks about the service style, not a menu.' },
  { name: 'park-hours-subject', claim: 'live_park_operations', all: ['hours_language', 'location_is_hours_subject'], none: ['restaurant_entity', 'food_proximity_close', 'restaurant_proximity_close'], why: 'The park itself is what opens, so this is park operations rather than restaurant hours.' },
  { name: 'restaurant-hours', claim: 'restaurant_hours', all: ['hours_language'], none: ['food_proximity_close', 'restaurant_proximity_close'], why: 'Hours wording, unless a terminal "close" means nearby.' },
  { name: 'serving-clock-time', claim: 'restaurant_hours', all: ['serving_clock_time'], why: 'Serving at a clock time is an hours question.' },
  { name: 'restaurant-location', claim: 'restaurant_location', any: ['proximity_language', 'restaurant_proximity_close'], none: ['food_acquisition', 'nearest_names_object', 'nearest_place_names_food'], why: 'Distance wording with no food named is a location question.' },
];

const DEFAULT_RULE: ClaimRule = {
  name: 'default-menu-presence',
  claim: 'menu_presence',
  why: 'No stronger claim applies; structured menu rows can answer this.',
};

export interface ClaimResolution {
  claim: ClaimType;
  rule: string;
  features: ClaimFeature[];
}

export function detectClaimFeatures(input: ClaimInput): Set<ClaimFeature> {
  const features = new Set<ClaimFeature>();
  for (const entry of FEATURE_TESTS) if (entry.test(input)) features.add(entry.feature);
  return features;
}

export function ruleMatches(rule: ClaimRule, features: ReadonlySet<ClaimFeature>): boolean {
  if (rule.all?.some((feature) => !features.has(feature))) return false;
  if (rule.any && !rule.any.some((feature) => features.has(feature))) return false;
  if (rule.none?.some((feature) => features.has(feature))) return false;
  return Boolean(rule.all?.length || rule.any?.length);
}

export function resolveClaim(input: ClaimInput): ClaimResolution {
  const features = detectClaimFeatures(input);
  const rule = CLAIM_RULES.find((candidate) => ruleMatches(candidate, features)) ?? DEFAULT_RULE;
  return { claim: rule.claim, rule: rule.name, features: Array.from(features) };
}

/**
 * Every rule a question satisfies, not just the winner.
 *
 * A question matching several rules that disagree about the claim is exactly
 * the shadowing the ordered cascade used to hide. Surfacing it lets a new rule
 * be reviewed against the ones it competes with instead of being discovered
 * later as a regression.
 */
export function matchingClaimRules(input: ClaimInput): ClaimRule[] {
  const features = detectClaimFeatures(input);
  return CLAIM_RULES.filter((rule) => ruleMatches(rule, features));
}
