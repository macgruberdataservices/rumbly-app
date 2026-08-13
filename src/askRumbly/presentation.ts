import type { PlanExecutionResult } from './execution';
import type { QueryPlan } from './queryPlan';
import { MENU_ITEM_KIND_LABELS } from './menuItemKind';
import {
  clarificationMessage,
  clarificationPrompt,
  type ClarificationCopyKind,
  cheapestResultTitle,
  nearestResultTitle,
  restaurantInfoTitle,
  resultListTitle,
  subjectiveResultTitle,
} from './responseCopy';

export type AskRumblySuggestion =
  | { kind: 'query'; label: string; query: string }
  | { kind: 'clarification'; label: string; optionId: string }
  | { kind: 'enable_location'; label: string };

export interface AskRumblyPresentation {
  tone: 'answer' | 'no-match' | 'clarification' | 'handoff' | 'unsupported' | 'error';
  eyebrow: string;
  title: string;
  message: string;
  suggestions: AskRumblySuggestion[];
  trustNote?: string;
}

interface PresentationContext {
  linkedKind: 'item' | 'restaurant' | null;
  totalPossibilities: number;
  hasCurrentLocation: boolean;
  subjectiveOptions?: boolean;
}

const ALLERGEN_QUERY_LABELS: Readonly<Record<string, string>> = {
  'gluten-wheat': 'gluten-free',
  milk: 'dairy-free',
  egg: 'egg-free',
  fish: 'fish-free',
  shellfish: 'shellfish-free',
  peanut: 'peanut-free',
  'tree-nut': 'tree-nut-free',
  sesame: 'sesame-free',
  soy: 'soy-free',
  'allergy-friendly': 'allergy-friendly',
};

const BROADER_FOOD_TERMS = [
  'ice cream', 'dole whip', 'fish and chips', 'fried rice', 'corn dog',
  'mocktail', 'cocktail', 'sandwich', 'pretzel', 'churro', 'waffle',
  'burger', 'pizza', 'fries', 'coffee', 'beer', 'corn', 'wrap', 'dessert', 'snack',
] as const;

const GENERIC_FOOD_TERMS = new Set([
  'food', 'meal', 'meals', 'option', 'options', 'dish', 'dishes', 'something', 'anything', 'for',
]);

function joinTerms(terms: string[], mode: 'all' | 'any'): string {
  return terms.join(mode === 'any' ? ' or ' : ' and ');
}

/**
 * How a location reads in a sentence.
 *
 * Pavilions need the word: "in Japan" is odd in a Disney dining app, "in the
 * Japan pavilion" is not. Two of Disney's headings do not take it gracefully
 * -- "World Showcase Plaza" is already a place name, and "Outpost" takes the
 * article alone.
 */
function locationPhrase(location: { label: string; entityType: string }): string {
  if (location.entityType !== 'pavilion') return location.label;
  if (/plaza$/i.test(location.label)) return location.label;
  if (/^outpost$/i.test(location.label)) return 'the Outpost';
  if (/^the /i.test(location.label)) return `${location.label} pavilion`;
  return `the ${location.label} pavilion`;
}

function locationLabels(plan: QueryPlan): string[] {
  if (plan.constraints.locations?.length) {
    return plan.constraints.locations.map((location) => `${location.relation} ${locationPhrase(location)}`);
  }
  if (plan.constraints.location) return [`${plan.constraints.location.relation} ${locationPhrase(plan.constraints.location)}`];
  if (plan.constraints.distanceAnchor) {
    return [`${plan.constraints.distanceRadiusMiles != null ? 'near' : 'from'} ${plan.constraints.distanceAnchor.label}`];
  }
  return [];
}

function locationSuffix(plan: QueryPlan, includeLocation: boolean): string {
  if (!includeLocation) return '';
  const locations = plan.constraints.locations?.length
    ? plan.constraints.locations
    : plan.constraints.location ? [plan.constraints.location] : [];
  if (locations.length === 0) {
    if (plan.constraints.locationSet === 'theme_parks') return ' across all four parks';
    if (plan.constraints.distanceAnchor) return ` near ${plan.constraints.distanceAnchor.label}`;
    return '';
  }
  return ` ${locations.map((location) => `${location.relation} ${locationPhrase(location)}`).join(' or ')}`;
}

function allergenPrefix(plan: QueryPlan): string {
  if (plan.constraints.allergenKeys.length === 0) return '';
  return `${plan.constraints.allergenKeys.map((key) => ALLERGEN_QUERY_LABELS[key] ?? `${key}-free`).join(' and ')} `;
}

function usefulFoodTerms(plan: QueryPlan): string[] {
  return plan.subject.foodTerms
    .map((term) => term
      .replace(/^(?:best|top\s+\d+|most unique|favorite|must[ -]eat)\s+/i, '')
      .trim())
    .filter((term) => term.length > 0 && term.length <= 50 && !GENERIC_FOOD_TERMS.has(term.toLowerCase()));
}

function genericSubject(plan: QueryPlan): string {
  if (plan.constraints.mealPeriods.includes('snack')) return 'snacks';
  if (plan.constraints.mealPeriods.includes('breakfast')) return 'breakfast';
  if (plan.constraints.dietaryKeys.includes('plant-based')) return 'plant-based options';
  if (plan.constraints.dietaryKeys.includes('vegetarian')) return 'vegetarian options';
  if (plan.constraints.requiredFeatures.includes('quick_service')) return 'quick-service restaurants';
  return 'food';
}

function broaderFoodTerm(term: string): string | null {
  const normalized = term.toLowerCase();
  for (const candidate of BROADER_FOOD_TERMS) {
    const candidatePattern = candidate.replace(/ /g, '\\s+');
    if (new RegExp(`^${candidatePattern}(?:s|es)?$`, 'i').test(normalized)) return null;
    const pattern = new RegExp(`\\b${candidatePattern}s?\\b`, 'i');
    if (pattern.test(normalized)) return candidate;
  }
  return null;
}

function searchQuery(
  plan: QueryPlan,
  options: { terms?: string[]; includeLocation?: boolean; includeAllergens?: boolean; operation?: 'nearest' | 'cheapest' } = {},
): string {
  const terms = options.terms ?? usefulFoodTerms(plan);
  const dietaryPrefix = terms.length
    ? plan.constraints.dietaryKeys
      .filter((key) => key !== 'kosher')
      .map((key) => key === 'kids' ? 'kids' : key)
      .join(' ')
    : '';
  const rawSubject = terms.length
    ? `${dietaryPrefix ? `${dietaryPrefix} ` : ''}${joinTerms(terms, plan.subject.foodMode)}`
    : genericSubject(plan);
  const baseSubject = plan.constraints.menuItemKind && terms.length > 0
    ? plan.constraints.menuItemKind === 'cocktail'
      ? `${rawSubject} cocktail`
      : plan.constraints.menuItemKind === 'non_alcoholic_drink'
        ? `${rawSubject} non-alcoholic drink`
        : plan.constraints.menuItemKind === 'dessert'
          ? `${rawSubject} dessert`
          : `${rawSubject} savory dish`
    : rawSubject;
  const subject = plan.constraints.recency ? `new ${baseSubject}` : baseSubject;
  const prefix = options.operation === 'nearest'
    ? 'Where is the closest '
    : options.operation === 'cheapest'
      ? 'Where is the cheapest '
      : 'Where can I get ';
  const allergies = options.includeAllergens === false ? '' : allergenPrefix(plan);
  const price = plan.constraints.maxPrice == null ? '' : ` for $${plan.constraints.maxPrice} or less`;
  const exclusions = plan.subject.excludedFoodTerms.length === 0
    ? ''
    : ` without ${joinTerms(plan.subject.excludedFoodTerms, 'all')}`;
  const alcohol = plan.constraints.alcohol === 'required'
    ? ' with alcohol'
    : plan.constraints.alcohol === 'excluded' && plan.constraints.menuItemKind !== 'non_alcoholic_drink'
      ? ' without alcohol' : '';
  const time = plan.constraints.time === 'now'
    ? ' open now'
    : plan.constraints.time === 'today'
      ? ' today'
      : plan.constraints.time === 'tomorrow' ? ' tomorrow' : '';
  return `${prefix}${allergies}${subject}${alcohol}${price}${exclusions}${locationSuffix(plan, options.includeLocation !== false)}${time}?`;
}

function defaultSuggestions(seed: string): AskRumblySuggestion[] {
  const suggestions: AskRumblySuggestion[] = [
    { kind: 'query', label: 'Find burgers', query: 'Where can I get a burger?' },
    { kind: 'query', label: 'Find coffee', query: 'Where can I get coffee?' },
    { kind: 'query', label: 'Find ice cream', query: 'Where can I get ice cream?' },
    { kind: 'query', label: 'Find chicken tenders', query: 'Where can I get chicken tenders?' },
    { kind: 'query', label: 'Find pretzels', query: 'Where can I get a pretzel?' },
  ];
  const offset = Array.from(seed.toLowerCase()).reduce((sum, character) => sum + character.charCodeAt(0), 0)
    % suggestions.length;
  return [...suggestions.slice(offset), ...suggestions.slice(0, offset)].slice(0, 3);
}

function dedupeSuggestions(suggestions: AskRumblySuggestion[]): AskRumblySuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.kind === 'query' ? suggestion.query.toLowerCase() : suggestion.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function noMatchSuggestions(plan: QueryPlan): AskRumblySuggestion[] {
  const suggestions: AskRumblySuggestion[] = [];
  const terms = usefulFoodTerms(plan);
  const locations = plan.constraints.locations?.length
    ? plan.constraints.locations
    : plan.constraints.location ? [plan.constraints.location] : [];
  const singleInsideArea = locations.length === 1
    && locations[0].relation === 'in'
    && (locations[0].entityType === 'area' || locations[0].entityType === 'pavilion')
    ? locations[0]
    : null;
  const hasLocation = locationLabels(plan).length > 0
    || plan.constraints.locationSet === 'theme_parks'
    || plan.subject.restaurantIds.length > 0;
  const hasRecoverableSubject = terms.length > 0
    || genericSubject(plan) !== 'food'
    || plan.constraints.recency != null;
  if (plan.constraints.allergenKeys.length > 0 && terms.length > 0) {
    suggestions.push({
      kind: 'query',
      label: hasLocation ? 'Show labeled options there' : 'Show labeled options',
      query: searchQuery(plan, { terms: [], includeLocation: true }),
    });
  }
  if (terms.length > 1) {
    for (const term of terms.slice(0, 2)) {
      suggestions.push({
        kind: 'query',
        label: `Search for ${term}`,
        query: searchQuery(plan, { terms: [term], includeLocation: true }),
      });
    }
  }
  if (terms.length === 1) {
    const broader = /\bpita\s+pocket\b/i.test(terms[0]) ? 'pita' : broaderFoodTerm(terms[0]);
    if (broader) {
      suggestions.push({
        kind: 'query',
        label: `Search for ${broader} instead`,
        query: searchQuery(plan, { terms: [broader], includeLocation: true }),
      });
    }
  }
  if (singleInsideArea && hasRecoverableSubject) {
    const unscoped = searchQuery(plan, { includeLocation: false }).replace(/\?$/, '');
    // Nothing in Morocco is a good reason to offer World Showcase, not all of
    // EPCOT -- the pavilions next door are a two-minute walk.
    const widerScope = singleInsideArea.entityType === 'pavilion' ? 'World Showcase' : singleInsideArea.label;
    suggestions.push({
      kind: 'query',
      label: singleInsideArea.entityType === 'pavilion'
        ? 'Search all of World Showcase'
        : `Search near ${singleInsideArea.label}`,
      query: singleInsideArea.entityType === 'pavilion'
        ? `${unscoped} in ${widerScope}?`
        : `${unscoped} near ${widerScope}?`,
    });
  }
  if (hasLocation && hasRecoverableSubject) {
    suggestions.push({
      kind: 'query',
      label: 'Search all Disney World',
      query: searchQuery(plan, { includeLocation: false }),
    });
  }
  return dedupeSuggestions(suggestions);
}

function clarificationSuggestions(plan: QueryPlan, hasCurrentLocation: boolean): AskRumblySuggestion[] {
  const needsLocation = (plan.action === 'distance' || plan.constraints.distanceOperation != null)
    && !plan.constraints.distanceAnchor;
  if (needsLocation && !hasCurrentLocation) return [{ kind: 'enable_location', label: 'Use my location' }];
  if (plan.claimType === 'allergy_safety' && plan.constraints.allergenKeys.length > 0) {
    return [{ kind: 'query', label: 'Search Disney labels instead', query: searchQuery(plan) }];
  }
  if (plan.claimType === 'editorial_judgment') {
    const terms = usefulFoodTerms(plan);
    if (terms.length > 0) {
      return [
        { kind: 'query', label: 'Show the closest', query: searchQuery(plan, { operation: 'nearest' }) },
        { kind: 'query', label: 'Show the cheapest', query: searchQuery(plan, { operation: 'cheapest' }) },
      ];
    }
  }
  if (plan.constraints.maxPrice != null && usefulFoodTerms(plan).length === 0) {
    const price = plan.constraints.maxPrice;
    return dedupeSuggestions([
      { kind: 'enable_location', label: 'Use my location' },
      { kind: 'query', label: `Snacks under $${price}`, query: `Where can I get snacks for $${price} or less?` },
      { kind: 'query', label: `Meals under $${price}`, query: `Where can I get meals for $${price} or less?` },
    ]);
  }
  return defaultSuggestions(plan.sourceText);
}

function unsupportedCopy(plan: QueryPlan): Pick<AskRumblyPresentation, 'title' | 'message'> {
  if (plan.claimType === 'live_park_operations' || plan.claimType === 'general_information') {
    return {
      title: "That's outside my dining lane.",
      message: 'I can help with Disney World food and restaurants, but not weather, attractions, or park operations.',
    };
  }
  if (plan.claimType === 'editorial_judgment') {
    return {
      title: "I don't have ratings or taste buds.",
      message: 'Try asking for something nearby, inexpensive, or in a specific place.',
    };
  }
  if (plan.claimType === 'venue_amenity') {
    return {
      title: "Sorry, I can't confirm that detail.",
      message: 'Try asking for a food or restaurant in that area instead.',
    };
  }
  if (plan.claimType === 'ingredient_content' || plan.claimType === 'sensory_attribute') {
    return {
      title: "Sorry, I can't confirm that from the menu.",
      message: 'Try searching for the dish itself, or ask a Cast Member about ingredients.',
    };
  }
  if (plan.claimType === 'cross_contact' || plan.claimType === 'kitchen_process') {
    return {
      title: 'A Cast Member is the best helper for that.',
      message: 'I can search Disney allergy labels, but not cross-contact or kitchen practices.',
    };
  }
  return {
    title: "Sorry, that's outside what I can answer.",
    message: 'Try asking about Disney World food, menus, restaurants, prices, locations, or hours.',
  };
}

function unsupportedSuggestions(plan: QueryPlan, hasCurrentLocation: boolean): AskRumblySuggestion[] {
  if (plan.claimType === 'editorial_judgment') {
    const terms = usefulFoodTerms(plan);
    if (terms.length > 0) {
      return [
        hasCurrentLocation
          ? { kind: 'query', label: 'Show the closest', query: searchQuery(plan, { operation: 'nearest' }) }
          : { kind: 'query', label: 'Show matching items', query: searchQuery(plan) },
        { kind: 'query', label: 'Show the cheapest', query: searchQuery(plan, { operation: 'cheapest' }) },
      ];
    }
  }
  // Rumbly cannot say how far the guest is from a ride, but the landmark they
  // named is one it can search around. Offering that is the difference between
  // a dead end and a redirect to the thing they were probably heading for.
  const attraction = plan.linkedEntities.find((entity) => entity.type === 'attraction');
  if (plan.claimType === 'live_park_operations' && attraction) {
    return [
      { kind: 'query', label: `Find food near ${attraction.label}`, query: `Where can I get food near ${attraction.label}?` },
      { kind: 'query', label: `Find snacks near ${attraction.label}`, query: `Where can I get a snack near ${attraction.label}?` },
    ];
  }
  if ((plan.claimType === 'cross_contact' || plan.claimType === 'kitchen_process')
    && plan.constraints.allergenKeys.length > 0) {
    return [{ kind: 'query', label: 'Search Disney labels instead', query: searchQuery(plan) }];
  }
  if (plan.claimType === 'venue_amenity' || plan.claimType === 'ingredient_content' || plan.claimType === 'sensory_attribute') {
    const terms = usefulFoodTerms(plan);
    if (terms.length > 0) {
      return [{ kind: 'query', label: `Search just for ${joinTerms(terms, plan.subject.foodMode)}`, query: searchQuery(plan) }];
    }
  }
  return defaultSuggestions(plan.sourceText);
}

/**
 * The term spelled the way the guest spelled it.
 *
 * Food terms are normalised to lowercase for matching, which is right for
 * matching and wrong for quoting back: a guest who typed "Halloween" should
 * not be shown “halloween”. Falls back to the normalised form when the term
 * came from a synonym rather than the guest's own words.
 */
function asGuestTyped(term: string | undefined, sourceText: string): string | undefined {
  if (!term) return term;
  const match = sourceText.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  return match?.[0] ?? term;
}

/** Whether the returned venues are genuinely in nearest-first order. */
function orderedByDistance(
  restaurantIds: string[] | undefined,
  distances: Record<string, number> | undefined,
): boolean {
  if (!distances) return true;
  let previous = -Infinity;
  for (const id of new Set(restaurantIds ?? [])) {
    const distance = distances[id];
    if (distance == null) continue;
    if (distance < previous) return false;
    previous = distance;
  }
  return true;
}

export function buildAskRumblyPresentation(
  plan: QueryPlan,
  result: PlanExecutionResult<unknown>,
  context: PresentationContext,
): AskRumblyPresentation {
  const trace = 'trace' in result ? result.trace : undefined;
  // "New" is a claim about Rumbly's own observation window, never about when
  // Disney added something. Rumbly cannot see before its first collection, and
  // an older item can still be recorded with a recent first sighting, so the
  // guest is told exactly what the date means.
  // Short, because the date on each card now carries the detail. The one
  // clause that has to survive is the boundary: first seen by Rumbly is not
  // the same claim as new at Disney.
  const trustNote = plan.constraints.recency
    ? `First seen by Rumbly in the last ${plan.constraints.recency.withinDays} days. Not necessarily new to Disney.`
    : trace?.locationApproximation && !plan.constraints.distanceAnchor
    ? 'Nearby-area distances are straight-line estimates from known dining locations, not walking routes.'
    : undefined;

  if (result.kind === 'answer') {
    const count = context.totalPossibilities;
    const possibilityLabel = count === 1 ? 'Possibility' : 'Possibilities';
    const nearest = plan.constraints.distanceOperation === 'nearest';
    // Proximity copy names the food either way; the eyebrow is what tells the
    // guest whether this is one winner or a ranked list.
    const proximityRequest = plan.constraints.distanceOperation != null;
    const cheapest = plan.constraints.priceOperation === 'cheapest';
    // Distance-ranked results can honestly be called nearby -- unless the
    // guest named the scope themselves. "Beer in Epcot" answered with "here's
    // what's nearby" was describing the wrong thing; "I want ice cream" with
    // Near Me on genuinely is proximity-ranked.
    const guestNamedScope = (plan.constraints.locations?.length ?? 0) > 0
      || plan.constraints.location != null
      || plan.constraints.locationSet != null;
    const proximityRanked = Object.keys(result.distanceMilesByRestaurant ?? {}).length > 0
      && (plan.constraints.distanceOperation != null || !guestNamedScope);
    const noun = context.linkedKind === 'item'
      ? count === 1 ? 'menu item' : 'menu items'
      : count === 1 ? 'place' : 'places';
    const distanceAnswer = plan.action === 'distance';
    const directAnswer = ['open_menu', 'compare', 'check_feature', 'hours', 'distance'].includes(plan.action);
    const allergyAnswer = result.safety?.kind === 'allergy' || plan.constraints.allergenKeys.length > 0;
    const recencyAnswer = plan.constraints.recency != null;
    const resolvedMenuKind = plan.constraints.menuItemKind;
    const resolvedTerms = usefulFoodTerms(plan);
    const resolvedSubject = resolvedTerms.join(plan.subject.foodMode === 'any' ? ' or ' : ' and ');
    const resolvedKindTitle = resolvedMenuKind && resolvedSubject
      ? resolvedMenuKind === 'cocktail'
        ? `Here are the ${resolvedSubject} cocktail matches.`
        : resolvedMenuKind === 'non_alcoholic_drink'
          ? `Here are the non-alcoholic ${resolvedSubject} drink matches.`
          : resolvedMenuKind === 'dessert'
            ? `Here are the ${resolvedSubject} dessert matches.`
            : `Here are the savory ${resolvedSubject} matches.`
      : null;
    const popTartAlias = /\bpop[ -]?tarts?\b/i.test(plan.sourceText)
      && usefulFoodTerms(plan).includes('lunch box tart');
    const title = recencyAnswer
      ? count === 1 ? 'One item is new to Rumbly recently.' : 'These are new to Rumbly recently.'
      : allergyAnswer
      ? proximityRanked
        ? count === 1 ? 'This is the closest Disney-labeled menu match.' : 'Here are the closest Disney-labeled menu matches.'
        : count === 1 ? 'Found one Disney-labeled match.' : 'Here are the Disney-labeled menu matches.'
      : popTartAlias
      ? 'Disney calls these Lunch Box Tarts.'
      : resolvedKindTitle
      ? resolvedKindTitle
      : context.subjectiveOptions
      ? subjectiveResultTitle(plan.sourceText, proximityRanked)
      : directAnswer
      ? distanceAnswer
        ? result.text
        : plan.action === 'open_menu'
        ? restaurantInfoTitle(plan.sourceText)
        : plan.action === 'compare'
          ? 'These restaurant pages have the current menus.'
          : plan.action === 'hours'
            ? plan.constraints.time === 'tomorrow'
              ? "Here are tomorrow's hours."
              : 'Here are the current hours.'
            : "Here's what I found for that restaurant."
      : context.linkedKind
      ? proximityRequest && plan.constraints.distanceAnchor
        ? `Here's the closest ${usefulFoodTerms(plan).join(plan.subject.foodMode === 'any' ? ' or ' : ' and ') || noun} I found to ${plan.constraints.distanceAnchor.label}.`
        : proximityRequest
        ? nearestResultTitle(plan.sourceText, usefulFoodTerms(plan))
        : cheapest
          ? cheapestResultTitle(plan.sourceText, noun, count)
          : context.linkedKind === 'item'
            ? resultListTitle(plan.sourceText, usefulFoodTerms(plan), proximityRanked, count)
          : proximityRanked
            ? count === 1
              ? `Here's the closest matching ${noun} I found.`
              : `Here are some of the closest ${noun} I found.`
          : count === 1
            ? `Here's one ${noun} I found.`
            : `Here's a list of ${noun} I found.`
      : "Here's the place you were looking for.";
    return {
      tone: 'answer',
      eyebrow: allergyAnswer
        ? 'Disney allergy labels'
        : popTartAlias
        ? 'Disney menu name'
        : resolvedMenuKind
        ? MENU_ITEM_KIND_LABELS[resolvedMenuKind]
        : context.subjectiveOptions
        ? 'A few options'
        : distanceAnswer
        ? plan.constraints.distanceAnchor
          ? `Distance from ${plan.constraints.distanceAnchor.label}`
          : context.hasCurrentLocation ? 'Distance from you' : 'Distance'
        // Before proximity, because a cheapest request has no location scope
        // and so reads as proximity-ranked -- which labelled the single
        // lowest-priced row "Closest match", the wrong superlative entirely.
        : cheapest
        ? 'Lowest price'
        : nearest
        ? 'Closest match'
        : proximityRanked
        // A "nearby" request is a ranked list, so the label says how it is
        // ordered rather than just how many there are. Each row carries its
        // own distance, which is what lets a guest actually choose.
        // Counted in places, not menu rows: "2394 nearby" was the size of the
        // matching universe, which tells a guest nothing about their choice.
        ? (() => {
          const places = new Set(result.restaurantIds ?? []).size;
          if (places <= 1) return 'Closest match';
          // Read the claim off the list rather than assuming it. The executor
          // ranks a closer venue below a better match -- a real chicken nugget
          // outranks Pretzel Nuggets next door -- and when it does, "closest
          // first" is simply untrue. Checking the order it actually produced
          // cannot drift out of sync with it the way a duplicated rule would.
          const order = orderedByDistance(result.restaurantIds, result.distanceMilesByRestaurant);
          return `${places} places nearby, ${order ? 'closest' : 'best match'} first`;
        })()
        : context.linkedKind === 'item' && new Set(result.restaurantIds ?? []).size > 1
        // Both numbers matter to a decision: how much there is to choose from,
        // and how many places that means visiting.
        ? `${count} ${possibilityLabel.toLowerCase()} at ${new Set(result.restaurantIds ?? []).size} places`
        : context.linkedKind ? `Found ${count} ${possibilityLabel}` : 'Ready',
      title,
      message: allergyAnswer
        ? 'Disney lists these for the requested allergy label. Review the allergy note below.'
        : popTartAlias
        ? context.subjectiveOptions
          ? "I can't rank which is best, but here's what I found."
          : "Here's what I found on the menu."
        : context.subjectiveOptions
        ? 'These are menu matches, not a ranking.'
        : distanceAnswer
        ? plan.constraints.distanceAnchor
          ? 'Straight-line estimate, not a walking route.'
          : 'Straight-line distance from your current location.'
        : plan.constraints.distanceAnchor
        ? context.linkedKind === 'item'
          ? 'Straight-line estimate. Tap one to see it on the menu.'
          : 'Straight-line estimate. Tap one to see the restaurant.'
        : directAnswer || !context.linkedKind
        ? result.text
        : context.linkedKind === 'item'
          ? 'Tap one to see it on the menu.'
          : 'Tap one to see the restaurant.',
      suggestions: [],
      trustNote,
    };
  }

  if (result.kind === 'no-match') {
    const allergy = result.safety?.kind === 'allergy' || plan.constraints.allergenKeys.length > 0;
    const terms = usefulFoodTerms(plan);
    const broader = terms.length === 1
      ? /\bpita\s+pocket\b/i.test(terms[0]) ? 'pita' : broaderFoodTerm(terms[0])
      : null;
    const restaurantScoped = plan.subject.restaurantIds.length > 0;
    const locations = plan.constraints.locations?.length
      ? plan.constraints.locations
      : plan.constraints.location ? [plan.constraints.location] : [];
    const singleStrictLocation = locations.length === 1 && locations[0].relation === 'in'
      ? locations[0]
      : null;
    const plainFoodLocationSearch = Boolean(singleStrictLocation)
      && terms.length > 0
      && !allergy
      && plan.constraints.dietaryKeys.length === 0
      && plan.constraints.mealPeriods.length === 0
      && plan.constraints.requiredFeatures.length === 0
      && plan.constraints.excludedFeatures.length === 0
      && plan.subject.excludedFoodTerms.length === 0
      && plan.constraints.maxPrice == null
      && plan.constraints.cuisine == null
      && plan.constraints.time == null;
    const nearbyAreaSearch = plan.constraints.distanceAnchor?.entityType === 'area'
      && plan.constraints.distanceRadiusMiles != null
      && terms.length > 0
      && !allergy;
    const suggestions = noMatchSuggestions(plan);
    const resolvedKind = plan.constraints.menuItemKind;
    const resolvedSubject = joinTerms(terms, plan.subject.foodMode);
    const resolvedKindLabel = plan.constraints.beverageRole === 'zero_proof_cocktail'
      ? 'zero-proof cocktail'
      : resolvedKind ? MENU_ITEM_KIND_LABELS[resolvedKind].replace(/^A\s+/i, '').toLowerCase() : '';
    return {
      tone: 'no-match',
      eyebrow: "Let's try that again",
      title: resolvedKind && resolvedSubject
        ? `I couldn't verify a ${resolvedKindLabel} match for "${resolvedSubject}".`
        : broader
        ? `I couldn't verify "${terms[0]}" as a current menu name.`
        : plainFoodLocationSearch && singleStrictLocation
        ? `I don't have any current menu matches for ${joinTerms(terms, plan.subject.foodMode)} in ${locationPhrase(singleStrictLocation)}.`
        : nearbyAreaSearch
        ? `I don't have any current menu matches for ${joinTerms(terms, plan.subject.foodMode)} near ${plan.constraints.distanceAnchor?.label}.`
        : allergy
        ? "Sorry, I couldn't find a Disney-labeled match."
        : context.subjectiveOptions
        ? "Sorry, I couldn't find a matching menu item."
        : "Sorry, I couldn't find what you're looking for.",
      message: resolvedKind
        ? result.text
        : broader
        ? `Try searching for ${broader} instead.`
        : plainFoodLocationSearch && singleStrictLocation
        // A pavilion's neighbours are a two-minute walk, so widening to World
        // Showcase is a better offer than "near Japan".
        ? singleStrictLocation.entityType === 'pavilion'
          ? 'Try all of World Showcase instead, or search all of Disney World.'
          : `Try looking near ${singleStrictLocation.label} instead, or search all of Disney World.`
        : nearbyAreaSearch
        ? 'Try searching without the nearby limit, or choose another area.'
        : allergy
        ? "Try another food or area. Disney's labels can be limited, so check with a Cast Member before ordering."
        : restaurantScoped && terms.length > 0
          ? `Try searching for ${joinTerms(terms, plan.subject.foodMode)} without the restaurant name, or ask a different way.`
          : context.subjectiveOptions
            ? 'Try a broader food name, another area, or ask a different way.'
            : 'Try a food, restaurant, park, or resort. You can also ask a different way.',
      suggestions: suggestions.length > 0 ? suggestions : defaultSuggestions(plan.sourceText),
      trustNote,
    };
  }

  if (result.kind === 'clarification') {
    const structured = result.clarification;
    const allergySafety = plan.claimType === 'allergy_safety';
    const unknownAllergyLabel = plan.claimType === 'disney_label' && plan.constraints.allergenKeys.length === 0;
    const needsLocation = /current location is required/i.test(result.text)
      || ((plan.action === 'distance' || plan.constraints.distanceOperation != null)
        && !plan.constraints.distanceAnchor
        && !context.hasCurrentLocation);
    // The executor decides *that* a question is needed and what the options
    // are; the wording is decided here, at the guest-language boundary, so all
    // of Rumbly's questions share one voice instead of one register per code
    // path. The two allergy cases keep their exact wording -- they are careful
    // on purpose and are not the place for personality.
    const copyKind: ClarificationCopyKind | null = structured?.kind === 'menu_item_kind'
      ? 'menu_item_kind'
      : structured?.kind === 'ordering'
        ? 'ordering'
        : unknownAllergyLabel || allergySafety
          ? null
          : needsLocation ? 'location' : 'general';
    return {
      tone: 'clarification',
      eyebrow: 'One quick detail',
      title: copyKind
        ? clarificationPrompt(copyKind, plan.sourceText, asGuestTyped(usefulFoodTerms(plan)[0], plan.sourceText))
        : unknownAllergyLabel
          ? "Sorry, I don't recognize that Disney allergy label."
          : "I can search Disney's labels, but I can't decide what's safe.",
      message: copyKind
        ? clarificationMessage(copyKind, plan.sourceText)
        : unknownAllergyLabel
          ? 'Try gluten/wheat, milk, egg, fish, shellfish, peanut, tree nut, sesame, or soy.'
          : 'Continue to see only Disney-labeled items, then confirm with a Cast Member.',
      suggestions: structured
        ? structured.options.map((option) => ({
            kind: 'clarification' as const,
            label: option.label,
            optionId: option.id,
          }))
        : clarificationSuggestions(plan, context.hasCurrentLocation),
      trustNote,
    };
  }

  if (result.kind === 'handoff') {
    return {
      tone: 'handoff',
      eyebrow: 'Check with Disney',
      title: 'Disney has the live answer for this one.',
      message: 'Open the Disney page below to check current availability or policy.',
      suggestions: [],
    };
  }

  if (result.kind === 'unsupported') {
    const copy = unsupportedCopy(plan);
    return {
      tone: 'unsupported',
      eyebrow: 'Outside my reliable data',
      ...copy,
      suggestions: unsupportedSuggestions(plan, context.hasCurrentLocation),
    };
  }

  return {
    tone: 'error',
    eyebrow: 'Something went wrong',
    title: "Sorry, I couldn't finish that search.",
    message: 'Please try it again or ask a different way.',
    suggestions: defaultSuggestions(plan.sourceText),
  };
}
