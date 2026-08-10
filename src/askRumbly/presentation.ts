import type { PlanExecutionResult } from './execution';
import type { QueryPlan } from './queryPlan';

export type AskRumblySuggestion =
  | { kind: 'query'; label: string; query: string }
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

function locationLabels(plan: QueryPlan): string[] {
  if (plan.constraints.locations?.length) {
    return plan.constraints.locations.map((location) => `${location.relation} ${location.label}`);
  }
  return plan.constraints.location
    ? [`${plan.constraints.location.relation} ${plan.constraints.location.label}`]
    : [];
}

function locationSuffix(plan: QueryPlan, includeLocation: boolean): string {
  if (!includeLocation) return '';
  const locations = plan.constraints.locations?.length
    ? plan.constraints.locations
    : plan.constraints.location ? [plan.constraints.location] : [];
  if (locations.length === 0) return plan.constraints.locationSet === 'theme_parks' ? ' across all four parks' : '';
  return ` ${locations.map((location) => `${location.relation} ${location.label}`).join(' or ')}`;
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
    if (normalized === candidate) return null;
    const pattern = new RegExp(`\\b${candidate.replace(/ /g, '\\s+')}s?\\b`, 'i');
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
  const subject = terms.length
    ? `${dietaryPrefix ? `${dietaryPrefix} ` : ''}${joinTerms(terms, plan.subject.foodMode)}`
    : genericSubject(plan);
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
  const time = plan.constraints.time === 'now' ? ' open now' : '';
  return `${prefix}${allergies}${subject}${price}${exclusions}${locationSuffix(plan, options.includeLocation !== false)}${time}?`;
}

function defaultSuggestions(): AskRumblySuggestion[] {
  return [
    { kind: 'query', label: 'Find burgers', query: 'Where can I get a burger?' },
    { kind: 'query', label: 'Find coffee', query: 'Where can I get coffee?' },
    { kind: 'query', label: 'Find ice cream', query: 'Where can I get ice cream?' },
  ];
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
  const hasLocation = locationLabels(plan).length > 0 || plan.constraints.locationSet === 'theme_parks';
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
    const broader = broaderFoodTerm(terms[0]);
    if (broader) {
      suggestions.push({
        kind: 'query',
        label: `Search for ${broader} instead`,
        query: searchQuery(plan, { terms: [broader], includeLocation: true }),
      });
    }
  }
  if (hasLocation && terms.length > 0) {
    suggestions.push({
      kind: 'query',
      label: 'Search all Disney World',
      query: searchQuery(plan, { includeLocation: false }),
    });
  }
  return dedupeSuggestions(suggestions);
}

function clarificationSuggestions(plan: QueryPlan, hasCurrentLocation: boolean): AskRumblySuggestion[] {
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
  const needsLocation = plan.action === 'distance' || plan.constraints.distanceOperation === 'nearest';
  if (needsLocation && !hasCurrentLocation) return [{ kind: 'enable_location', label: 'Use my location' }];
  if (plan.constraints.maxPrice != null && usefulFoodTerms(plan).length === 0) {
    const price = plan.constraints.maxPrice;
    return dedupeSuggestions([
      { kind: 'enable_location', label: 'Use my location' },
      { kind: 'query', label: `Snacks under $${price}`, query: `Where can I get snacks for $${price} or less?` },
      { kind: 'query', label: `Meals under $${price}`, query: `Where can I get meals for $${price} or less?` },
    ]);
  }
  return defaultSuggestions();
}

function unsupportedCopy(plan: QueryPlan): Pick<AskRumblyPresentation, 'title' | 'message'> {
  if (plan.claimType === 'live_park_operations' || plan.claimType === 'general_information') {
    return {
      title: "That's outside my dining lane.",
      message: "I'm focused on Disney World food and restaurants, so I don't have a trustworthy answer for park operations, weather, attractions, or general information.",
    };
  }
  if (plan.claimType === 'editorial_judgment') {
    return {
      title: "I can't honestly choose “best” from the data I have.",
      message: 'I do not have reliable guest ratings or editorial rankings. I can still narrow the choice by food, price, location, or distance.',
    };
  }
  if (plan.claimType === 'venue_amenity') {
    return {
      title: "I don't have reliable atmosphere details.",
      message: 'My dining data does not verify seating, shade, views, noise, entertainment, or other venue amenities. I can still find food and restaurants in that area.',
    };
  }
  if (plan.claimType === 'ingredient_content' || plan.claimType === 'sensory_attribute') {
    return {
      title: "I can't verify that from a menu listing.",
      message: 'Menu descriptions are not complete ingredient, nutrition, preparation, or taste evidence. I would rather say that clearly than guess.',
    };
  }
  if (plan.claimType === 'cross_contact' || plan.claimType === 'kitchen_process') {
    return {
      title: 'That needs a Cast Member, not a menu search.',
      message: 'Rumbly does not have reliable cross-contact, fryer, equipment, or kitchen-process data. I can search only the allergy labels Disney publishes.',
    };
  }
  return {
    title: "I can't support that request with the data I have.",
    message: 'I can reliably help with Disney World food, menus, restaurants, prices, locations, hours, dining features, and Disney-published allergy labels.',
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
  return defaultSuggestions();
}

export function buildAskRumblyPresentation(
  plan: QueryPlan,
  result: PlanExecutionResult<unknown>,
  context: PresentationContext,
): AskRumblyPresentation {
  const trace = 'trace' in result ? result.trace : undefined;
  const trustNote = trace?.locationApproximation
    ? 'Nearby-area distances are straight-line estimates from known dining locations, not walking routes.'
    : undefined;

  if (result.kind === 'answer') {
    const count = context.totalPossibilities;
    const possibilityLabel = count === 1 ? 'Possibility' : 'Possibilities';
    const nearest = plan.constraints.distanceOperation === 'nearest';
    const cheapest = plan.constraints.priceOperation === 'cheapest';
    const noun = context.linkedKind === 'item'
      ? count === 1 ? 'menu item' : 'menu items'
      : count === 1 ? 'place' : 'places';
    const directAnswer = ['open_menu', 'compare', 'check_feature', 'hours'].includes(plan.action);
    const title = context.subjectiveOptions
      ? context.hasCurrentLocation
        ? "I can't tell you what's “best,” but here are some nearby options to try."
        : "I can't tell you what's “best,” but here are some options to try."
      : directAnswer
      ? plan.action === 'open_menu'
        ? 'I found that restaurant menu.'
        : plan.action === 'compare'
          ? 'These restaurant pages have the current menus.'
          : plan.action === 'hours'
            ? 'Here are the current hours in Rumbly.'
            : 'Here is what the restaurant data says.'
      : context.linkedKind
      ? nearest
        ? `Here's the closest ${noun} I could verify.`
        : cheapest
          ? `Here's the cheapest ${noun} I could verify.`
          : `Here's a list of ${noun} I found.`
      : 'I found the right place to continue.';
    return {
      tone: 'answer',
      eyebrow: context.subjectiveOptions
        ? 'A few options'
        : context.linkedKind ? `Found ${count} ${possibilityLabel}` : 'Ready',
      title,
      message: context.subjectiveOptions
        ? "Rumbly doesn't have reliable guest ratings, so these are verified menu matches—not a ranking."
        : directAnswer || !context.linkedKind
        ? result.text
        : 'Verified against the current Rumbly dining data.',
      suggestions: [],
      trustNote,
    };
  }

  if (result.kind === 'no-match') {
    const allergy = result.safety?.kind === 'allergy' || plan.constraints.allergenKeys.length > 0;
    return {
      tone: 'no-match',
      eyebrow: 'No verified match',
      title: context.subjectiveOptions
        ? "I can't choose what's “best,” and I couldn't verify a matching option."
        : 'I understood the request, but could not verify a match.',
      message: allergy
        ? 'I checked only the menu items Disney labels for the requested allergy information, and none satisfied every part of the request. That does not mean an option is unavailable—only that Rumbly cannot verify one from Disney’s published labels.'
        : 'I checked the current menu and restaurant data without dropping any part of your request. Nothing I found supported every detail, so I am not going to substitute a weaker match.',
      suggestions: noMatchSuggestions(plan),
      trustNote,
    };
  }

  if (result.kind === 'clarification') {
    const allergySafety = plan.claimType === 'allergy_safety';
    const unknownAllergyLabel = plan.claimType === 'disney_label' && plan.constraints.allergenKeys.length === 0;
    const needsLocation = /current location is required/i.test(result.text)
      || ((plan.action === 'distance' || plan.constraints.distanceOperation === 'nearest') && !context.hasCurrentLocation);
    return {
      tone: 'clarification',
      eyebrow: 'One quick detail',
      title: unknownAllergyLabel
        ? 'I could not map that to a Disney allergy label in Rumbly.'
        : allergySafety
        ? 'I can search Disney allergy labels, but I cannot decide what is safe.'
        : needsLocation
          ? 'Where should I measure from?'
          : 'I caught part of that, but I do not want to guess.',
      message: unknownAllergyLabel
        ? 'The structured labels I can search are gluten/wheat, milk, egg, fish, shellfish, peanut, tree nut, sesame, soy, and general Allergy-Friendly. I will not substitute one of those for a different allergy.'
        : allergySafety
        ? 'If you continue, I will use only the allergy information Disney attaches directly to menu items.'
        : needsLocation
          ? 'Turn on the location button for a result based on where you are, or name a park, resort, or area in the question.'
          : 'Try one of the choices below, or rephrase with a food, restaurant, park, resort, price, or dining feature.',
      suggestions: clarificationSuggestions(plan, context.hasCurrentLocation),
      trustNote,
    };
  }

  if (result.kind === 'handoff') {
    return {
      tone: 'handoff',
      eyebrow: 'Official or live information',
      title: 'Disney has the reliable answer for this one.',
      message: 'This depends on current availability or official policy that Rumbly does not maintain locally. Use the Disney link below when one is available.',
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
    title: 'I could not finish that search.',
    message: 'Your question is fine. Please try it once more; if it keeps happening, a data or app error needs attention.',
    suggestions: [],
  };
}
