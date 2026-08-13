function normalizedSeed(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function stableIndex(seed: string, poolName: string, length: number): number {
  let hash = 2166136261;
  const value = `${poolName}:${normalizedSeed(seed)}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function pick(seed: string, poolName: string, options: readonly string[]): string {
  return options[stableIndex(seed, poolName, options.length)];
}

const GENERIC_NEARBY = [
  "Here's what's nearby.",
  'Found a few nearby options.',
  'Pulled up some nearby spots.',
  'Here is the nearby lineup. Choose wisely.',
  "Here's what I found close by.",
  'A few nearby picks for you.',
] as const;

const GENERIC_RESULTS = [
  "Here's what I found.",
  'Found a few options. Go forth and eat.',
  'Here is the lineup. Choose wisely.',
  'Options coming right up.',
  "Here's what turned up.",
  'A few good picks below.',
] as const;

const SINGLE_RESULTS = [
  'Found one menu item that matches.',
  "Here's the one match I found.",
] as const;

const SUBJECTIVE_NEARBY = [
  "I don't have taste buds or star ratings. Here is what is nearby, and you can be the judge.",
  "'Best' is above my pay grade. I have locations, not opinions. Here is what is around.",
  "I can't rank flavor, only distance. Here is what is close.",
  'No stars from me. Here are some nearby options to try.',
  'Best is subjective. Nearby is a fact. Here is what I found.',
  "I'll leave the ranking to you. Here's what's nearby.",
  "No opinions here, just options. Here's what's close.",
] as const;

const SUBJECTIVE_RESULTS = [
  "I don't have taste buds or star ratings. Here are some options, and you can be the judge.",
  "'Best' is above my pay grade. I have menu matches, not opinions.",
  "I can't rank flavor, but I can find options.",
  'No stars from me. Here are some options to try.',
  'Best is subjective. Here is what I found.',
  "I'll leave the ranking to you. Here's what I found.",
  'No opinions here, just options.',
] as const;

const FOOD_POOLS: Readonly<Record<string, readonly string[]>> = {
  pizza: [
    'Here are some nearby pizza options. Save me a slice.',
    "Cheese, sauce, dough. Here is where it is happening nearby.",
    "Pizza's calling. Nearby options below.",
    'Round, cheesy, non-negotiable. Nearby options below.',
    "Slice night, sorted. Here's what's nearby.",
    'Melty cheese, close by and ready.',
  ],
  'turkey leg': [
    'Nothing says vacation like poultry the size of your forearm. Here are the nearby options.',
    'Prehistoric-sized meat incoming. Nearby options below.',
    'Caveman energy, modern prices. Here is where to get one nearby.',
    'It is basically a prop that you eat. Here is what is nearby.',
    "A snack the size of a small trophy. Here's what's nearby.",
    'Big, smoky, and totally worth it. Nearby options below.',
  ],
  'dole whip': [
    "The pineapple is calling. Here is where to answer nearby.",
    'Dole Whip duty. Nearby options below.',
    'Frozen pineapple perfection, nearby and ready.',
    'You did not ask for a life-changing snack, but here we are. Nearby options below.',
    "Sweet, cold, and dangerously easy to finish. Here's where nearby.",
  ],
  'mickey bar': [
    'Ice cream shaped like a mouse, because why not? Here is what is nearby.',
    'Ears-shaped and full of nostalgia. Options nearby.',
    'The most iconic silhouette in frozen dairy. Here is where to find it nearby.',
    'The mouse ears you can actually eat. Nearby options below.',
    'A park classic, nearby and ready.',
  ],
  'ice cream': [
    "Here are some nearby ice cream options. I would try one of each.",
    "Ice cream, nearby and ready. Here's what I found.",
    "Frozen happiness is closer than you think. Here's what I found.",
    "Cool down time. Here's what's nearby.",
  ],
  churro: [
    'Cinnamon sugar therapy, nearby.',
    'Fried, sugary, and probably why you are here. Nearby options below.',
    'Crunchy on the outside, regret-free on the inside. Here is what is nearby.',
    "Warm, crunchy, and dangerously portable. Here's what's nearby.",
  ],
  popcorn: [
    "The bucket is calling. Here is where to fill it nearby.",
    "Basically the park's official currency. Here is where to spend it nearby.",
    'That bucket is paying for itself by day three. Here is where to start nearby.',
    "Snack o'clock. Here's where to refill nearby.",
  ],
  'corn dog': [
    'Fried, on a stick, no notes. Here is where to get one nearby.',
    'Peak fair food, zero fair required. Nearby options below.',
    'Stick food, sorted. Nearby options below.',
    "A classic on a stick. Here's what's nearby.",
  ],
  'funnel cake': [
    'Powdered sugar disaster zone, incoming. Here is what is nearby.',
    'You will wear some of this. Worth it. Here is what is nearby.',
    "Sweet, messy, worth it. Here's what's nearby.",
    "Powdered sugar and happiness. Here's where nearby.",
  ],
  burger: [
    "Meat is on the menu. Here is where to find it nearby.",
    'Found some nearby burger options. Napkins recommended.',
    'Classic call, nearby options below.',
    'A solid choice, nearby and ready.',
  ],
  bbq: [
    'Smoke, sauce, napkins required. Here is what is nearby.',
    'Found some nearby BBQ options. Bring an appetite.',
    'Low and slow, nearby and ready.',
    "Smoky and satisfying. Here's what's close.",
  ],
  coffee: [
    'Caffeine emergency? Here is the nearest fix.',
    'Park mornings run on this. Here is where to get yours nearby.',
    'Running on fumes? Nearby coffee below.',
    'A little pick-me-up, nearby and ready.',
  ],
  'chicken tenders': [
    "Kid-approved and nearby. Here's what I found.",
    'Crispy, simple, and always a hit. Nearby options below.',
    "The safe bet. Here's what's nearby.",
    "Tenders, sorted. Here's what's close.",
  ],
  pretzel: [
    "Warm, salty, and easy to share. Here's what's nearby.",
    'Soft pretzel duty. Nearby options below.',
    "A classic snack stop. Here's what's close.",
  ],
  'mac and cheese': [
    "Comfort food, nearby and ready. Here's what I found.",
    'Creamy, cheesy, no arguments here. Nearby options below.',
    "The good stuff. Here's what's close.",
  ],
} as const;

function foodCategory(foodTerms: readonly string[]): string | null {
  const food = foodTerms.join(' ').toLowerCase();
  if (/\b(?:mickey(?:'s)? (?:premium )?ice cream bar|mickey bar)\b/.test(food)) return 'mickey bar';
  if (/\bdole whip\b/.test(food)) return 'dole whip';
  if (/\bturkey legs?\b/.test(food)) return 'turkey leg';
  if (/\bfunnel cakes?\b/.test(food)) return 'funnel cake';
  if (/\bcorn dogs?\b/.test(food)) return 'corn dog';
  if (/\bice cream\b/.test(food)) return 'ice cream';
  if (/\bpizzas?\b/.test(food)) return 'pizza';
  if (/\bchurros?\b/.test(food)) return 'churro';
  if (/\bpopcorn\b/.test(food)) return 'popcorn';
  if (/\b(?:bbq|barbecue)\b/.test(food)) return 'bbq';
  if (/\bburgers?\b/.test(food)) return 'burger';
  if (/\bcoffee\b/.test(food)) return 'coffee';
  if (/\b(?:chicken\s+)?(?:tenders?|fingers?|nuggets?)\b/.test(food)) return 'chicken tenders';
  if (/\bpretzels?\b/.test(food)) return 'pretzel';
  if (/\b(?:mac(?:aroni)? and cheese|mac(?:aroni)? & cheese)\b/.test(food)) return 'mac and cheese';
  return null;
}

export function resultListTitle(
  sourceText: string,
  foodTerms: readonly string[],
  hasProximity: boolean,
  count: number,
): string {
  if (count === 1) return hasProximity
    ? 'This is the closest menu match.'
    : pick(sourceText, 'single-result', SINGLE_RESULTS);
  const category = foodCategory(foodTerms);
  if (hasProximity && category && stableIndex(sourceText, `${category}:personality`, 3) === 0) {
    return pick(sourceText, category, FOOD_POOLS[category]);
  }
  return pick(sourceText, hasProximity ? 'generic-nearby' : 'generic-results', hasProximity ? GENERIC_NEARBY : GENERIC_RESULTS);
}

export function subjectiveResultTitle(sourceText: string, hasProximity: boolean): string {
  return pick(
    sourceText,
    hasProximity ? 'subjective-nearby' : 'subjective-results',
    hasProximity ? SUBJECTIVE_NEARBY : SUBJECTIVE_RESULTS,
  );
}

export function nearestResultTitle(sourceText: string, foodTerms: readonly string[]): string {
  const category = foodCategory(foodTerms);
  if (category === 'dole whip') {
    return pick(sourceText, 'nearest-dole-whip', [
      'The pineapple is calling. The closest Dole Whip options are below.',
      'Dole Whip duty. Closest options below.',
      'Frozen pineapple perfection is nearby. Closest options below.',
      'The closest Dole Whip is ready and waiting.',
      'Closest Dole Whip, ready when you are.',
    ]);
  }
  if (category === 'pizza') {
    return pick(sourceText, 'nearest-pizza', [
      'The closest pizza options are below. Save me a slice.',
      "Pizza's closer than you think. Options below.",
      'The closest cheesy options are ready.',
      'The closest slice is right this way.',
    ]);
  }
  const food = foodTerms.join(' and ').trim();
  return pick(sourceText, 'nearest-generic', food ? [
    `The closest ${food} match is below.`,
    'The closest option is right here.',
  ] : [
    'The closest match is below.',
    'The closest option is right here.',
  ]);
}

export function cheapestResultTitle(sourceText: string, noun: string, count: number): string {
  if (count > 1) {
    return pick(sourceText, 'cheapest-tie', [
      `These ${noun} tie for the lowest price.`,
      `These ${noun} are tied for the best deal.`,
      `Here are the wallet-friendliest ${noun}.`,
      `A few easy-on-the-wallet picks: these ${noun}.`,
    ]);
  }
  return pick(sourceText, 'cheapest', [
    `Here is the lowest-priced ${noun} I found.`,
    `Here's the best deal I found: this ${noun}.`,
    `Here is the wallet-friendliest ${noun}.`,
    `Easy on the wallet. Here's the ${noun}.`,
  ]);
}

export function restaurantInfoTitle(sourceText: string): string {
  return pick(sourceText, 'restaurant-info', [
    "Here is what I've got on it.",
    'Pulled the details. The menu is below.',
    'Here is the restaurant info I found.',
    "Here's what I found for that spot.",
  ]);
}

// --- Clarification voice.
//
// Every clarification Rumbly asks comes from here, so the app has one place
// where "asking the guest a question" has a consistent tone instead of a
// different register per code path.
//
// The hard constraint is grammatical, not stylistic. The old prompt built a
// sentence around the guest's own words -- `What kind of ${term} did you
// mean?` -- which assumes the term is a countable noun. It is not always one:
// a guest searching "Halloween food" got "What kind of halloween did you
// mean?". Quoting the term instead of declining it keeps the sentence correct
// whether the guest typed a noun, an adjective, an event, or a dish name.

const MENU_KIND_PROMPTS = [
  'I found “{term}” on a few different kinds of menu item. Which one?',
  '“{term}” turns up a few different ways. Which did you mean?',
  'A few different things answer to “{term}”. Which one did you have in mind?',
  '“{term}” could go a few directions here. Point me at one?',
] as const;

const MENU_KIND_MESSAGES = [
  'Pick one and I will search just that.',
  'Choose one and I will narrow it down.',
  'Tell me which and I will take it from there.',
] as const;

const ORDERING_PROMPTS = [
  'Cheapest, or closest?',
  'Should price or walking distance decide this one?',
  'What matters more right now, the price or the walk?',
] as const;

const ORDERING_MESSAGES = [
  'Either works. I just need to know which one wins.',
  'Pick the one that matters more and I will sort by it.',
] as const;

const LOCATION_PROMPTS = [
  'Where should I search from?',
  'Where are you starting from?',
  'Whereabouts?',
] as const;

const LOCATION_MESSAGES = [
  'Use your location, or name a park, resort, or area.',
  'Turn on Near Me, or tell me the park, resort, or area.',
] as const;

const GENERAL_PROMPTS = [
  'I need one more detail.',
  'Almost there. One more detail?',
  'Nearly there. Give me one more thing to go on?',
] as const;

const GENERAL_MESSAGES = [
  'Try adding a food, restaurant, park, resort, price, or dining feature.',
  'A food, restaurant, park, resort, price, or dining feature will do it.',
] as const;

export type ClarificationCopyKind =
  | 'menu_item_kind'
  | 'ordering'
  | 'location'
  | 'general';

/**
 * The question Rumbly asks. `term` is quoted rather than inflected, so any
 * phrase a guest typed stays grammatical inside the sentence.
 */
export function clarificationPrompt(
  kind: ClarificationCopyKind,
  sourceText: string,
  term?: string,
): string {
  if (kind === 'menu_item_kind') {
    // Without a term there is nothing to quote, so fall back rather than ask
    // about an empty string.
    if (!term) return pick(sourceText, 'clarify-general', GENERAL_PROMPTS);
    return pick(sourceText, 'clarify-menu-kind', MENU_KIND_PROMPTS).replace('{term}', term);
  }
  if (kind === 'ordering') return pick(sourceText, 'clarify-ordering', ORDERING_PROMPTS);
  if (kind === 'location') return pick(sourceText, 'clarify-location', LOCATION_PROMPTS);
  return pick(sourceText, 'clarify-general', GENERAL_PROMPTS);
}

/** The line under the question, explaining what a choice will do. */
export function clarificationMessage(kind: ClarificationCopyKind, sourceText: string): string {
  if (kind === 'menu_item_kind') return pick(sourceText, 'clarify-menu-kind-msg', MENU_KIND_MESSAGES);
  if (kind === 'ordering') return pick(sourceText, 'clarify-ordering-msg', ORDERING_MESSAGES);
  if (kind === 'location') return pick(sourceText, 'clarify-location-msg', LOCATION_MESSAGES);
  return pick(sourceText, 'clarify-general-msg', GENERAL_MESSAGES);
}
