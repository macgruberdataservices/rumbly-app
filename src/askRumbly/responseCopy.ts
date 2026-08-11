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
] as const;

const GENERIC_RESULTS = [
  "Here's what I found.",
  'Found a few options. Go forth and eat.',
  'Here is the lineup. Choose wisely.',
  'Options incoming.',
] as const;

const SUBJECTIVE_NEARBY = [
  "I don't have taste buds or star ratings. Here is what is nearby, and you can be the judge.",
  "'Best' is above my pay grade. I have locations, not opinions. Here is what is around.",
  "I can't rank flavor, only distance. Here is what is close.",
  'No stars from me. Here are some nearby options to try.',
  'Best is subjective. Nearby is a fact. Here is what I found.',
] as const;

const SUBJECTIVE_RESULTS = [
  "I don't have taste buds or star ratings. Here are some options, and you can be the judge.",
  "'Best' is above my pay grade. I have menu matches, not opinions.",
  "I can't rank flavor, but I can find options.",
  'No stars from me. Here are some options to try.',
  'Best is subjective. Here is what I found.',
] as const;

const FOOD_POOLS: Readonly<Record<string, readonly string[]>> = {
  pizza: [
    'Here are some nearby pizza options. Save me a slice.',
    "Cheese, sauce, dough. Here is where it is happening nearby.",
    'Pizza radar activated. Nearby results below.',
    'Round, cheesy, non-negotiable. Nearby options below.',
  ],
  'turkey leg': [
    'Nothing says vacation like poultry the size of your forearm. Here are the nearby options.',
    'Prehistoric-sized meat incoming. Nearby options below.',
    'Caveman energy, modern prices. Here is where to get one nearby.',
    'It is basically a prop that you eat. Here is what is nearby.',
  ],
  'dole whip': [
    "The pineapple is calling. Here is where to answer nearby.",
    'Dole Whip duty. Nearby options below.',
    'Frozen pineapple perfection, located nearby.',
    'You did not ask for a life-changing snack, but here we are. Nearby options below.',
  ],
  'mickey bar': [
    'Ice cream shaped like a mouse, because why not? Here is what is nearby.',
    'Ears-shaped and full of nostalgia. Options nearby.',
    'The most iconic silhouette in frozen dairy. Here is where to find it nearby.',
  ],
  'ice cream': [
    "Here are some nearby ice cream options. I would try one of each.",
    'Ice cream mission accepted. Options below.',
    'Frozen happiness, located. Here is what I found.',
  ],
  churro: [
    'Cinnamon sugar therapy, nearby.',
    'Fried, sugary, and probably why you are here. Nearby options below.',
    'Crunchy on the outside, regret-free on the inside. Here is what is nearby.',
  ],
  popcorn: [
    "The bucket is calling. Here is where to fill it nearby.",
    "Basically the park's official currency. Here is where to spend it nearby.",
    'That bucket is paying for itself by day three. Here is where to start nearby.',
  ],
  'corn dog': [
    'Fried, on a stick, no notes. Here is where to get one nearby.',
    'Peak fair food, zero fair required. Nearby options below.',
  ],
  'funnel cake': [
    'Powdered sugar disaster zone, incoming. Here is what is nearby.',
    'You will wear some of this. Worth it. Here is what is nearby.',
  ],
  burger: [
    "Meat is on the menu. Here is where to find it nearby.",
    'Nearby burger options located. Napkins recommended.',
  ],
  bbq: [
    'Smoke, sauce, napkins required. Here is what is nearby.',
    'Nearby BBQ options located. Bring an appetite.',
  ],
  coffee: [
    'Caffeine emergency? Here is the nearest fix.',
    'Park mornings run on this. Here is where to get yours nearby.',
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
  return null;
}

export function resultListTitle(
  sourceText: string,
  foodTerms: readonly string[],
  hasProximity: boolean,
  count: number,
): string {
  if (count === 1) return hasProximity ? 'This is the closest menu match.' : 'One menu item matches.';
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

export function cheapestResultTitle(sourceText: string, noun: string, count: number): string {
  if (count > 1) {
    return pick(sourceText, 'cheapest-tie', [
      `These ${noun} tie for the lowest price.`,
      `Budget mode activated. These ${noun} share the lowest price.`,
      `Here are the wallet-friendliest ${noun}.`,
    ]);
  }
  return pick(sourceText, 'cheapest', [
    `Here is the lowest-priced ${noun} I found.`,
    `Budget mode activated. Here is the lowest-priced ${noun}.`,
    `Here is the wallet-friendliest ${noun}.`,
  ]);
}

export function restaurantInfoTitle(sourceText: string): string {
  return pick(sourceText, 'restaurant-info', [
    "Here is what I've got on it.",
    'Pulled the details. The menu is below.',
    'Here is the restaurant info I found.',
  ]);
}
