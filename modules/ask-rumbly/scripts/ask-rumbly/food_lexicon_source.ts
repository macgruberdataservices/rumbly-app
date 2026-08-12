// Builds the food lexicon that the parser recognises guest food requests
// against. Kept out of src/askRumbly/ because it reads the loaded dataset;
// the matcher itself (src/askRumbly/foodLexicon.ts) stays pure.
//
// The goal is not to enumerate every menu row. It is to know the vocabulary a
// guest can plausibly use, so that anything outside it is confidently *not* a
// food term. Precision matters more than coverage here: a junk entry turns an
// ordinary word into a menu search, while a missing entry falls through to the
// existing capture path and still produces an honest answer.

import { normalizeForSearch } from '../../../../src/data/diacritics.ts';
import { classifyWord } from '../../../../src/askRumbly/closedClass.ts';
import { singularize } from '../../../../src/askRumbly/foodLexicon.ts';
import { knownSynonymTerms } from '../../../../src/askRumbly/foodSynonyms.ts';
import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';

// A menu-row n-gram must appear on this many distinct items, across at least
// this many distinct restaurants, before it is treated as guest vocabulary.
// The restaurant threshold is what keeps one venue's internal naming
// convention from becoming a term the parser believes in.
const MIN_ITEM_OCCURRENCES = 4;
const MIN_DISTINCT_RESTAURANTS = 2;
const MAX_PHRASE_TOKENS = 3;

// How widely Disney's own category vocabulary must use a bare word before the
// parser treats it as naming a food class. A word that also names a venue has
// to clear a much higher bar: "cosmic" and "joffrey" appear as categories at
// the one place that uses them, while "chicken" appears everywhere — which is
// what separates a brand from a food, given that "Chicken Guy!" is itself a
// restaurant.
const MIN_CATEGORY_RESTAURANTS = 2;
const VENUE_COLLISION_MIN_RESTAURANTS = 10;

// Words that occur constantly in menu naming but never identify what a guest
// is asking for. Excluded as standalone terms; they may still appear inside a
// longer phrase ("rice bowl", "kids plate").
const MENU_NOISE = new Set([
  'add', 'added', 'additional', 'assorted', 'available', 'baked', 'blend', 'blended', 'bottle',
  'bowl', 'box', 'brand', 'breaded', 'bulk', 'choice', 'chilled', 'classic',
  'combo', 'cup', 'cut', 'daily', 'deluxe', 'dressing', 'extra', 'fantasy',
  'favorite', 'flavor', 'flavored', 'fresh', 'freshly', 'garnish', 'glass',
  'gourmet', 'grande', 'half', 'homemade', 'house', 'individual', 'jumbo',
  'large', 'made', 'market', 'medium', 'mini', 'mix', 'mixed', 'obtained',
  'order', 'original', 'oz', 'pack', 'piece', 'pieces', 'plate', 'platter',
  'bottled', 'cold', 'dine', 'fountain', 'hot', 'minute', 'noon', 'social',
  'sparkling', 'sweet', 'mug', 'sports', 'energy',
  'portion', 'premium', 'prepared', 'quart', 'rapid', 'refillable', 'regular',
  'roasted', 'rotating', 'round', 'seasonal', 'seasoned', 'select', 'selection',
  'served', 'serving', 'set', 'shaped', 'side', 'signature', 'single', 'size',
  'sized', 'slice', 'small', 'special', 'specialty', 'sprinkled', 'stuffed',
  'style', 'super', 'topped', 'topping', 'toppings', 'traditional', 'tray',
  'value', 'variety', 'whole',
]);

// Terms the typed plan already represents as something other than a food.
// Promoting them to food terms would let a constraint be searched as a dish.
const CONSTRAINT_RESERVED = new Set([
  'breakfast', 'lunch', 'dinner', 'snack', 'snacks', 'brunch',
  'kid', 'kids', 'children', 'child', 'toddler', 'adult',
  'vegan', 'vegetarian', 'kosher', 'plant', 'gluten', 'wheat', 'dairy', 'milk',
  'egg', 'eggs', 'fish', 'shellfish', 'peanut', 'peanuts', 'nut', 'nuts',
  'sesame', 'soy', 'allergy', 'allergen', 'free',
]);

// Guest vocabulary that is not reliably derivable from Disney's own item
// naming: everyday synonyms, abbreviations, and the compound dish names that
// must stay atomic when a query is split on "and".
const CURATED_TERMS = [
  'mac and cheese', 'macaroni and cheese', 'chicken and waffles', 'fish and chips',
  'biscuits and gravy', 'peanut butter and jelly', 'cookies and cream',
  'french fries', 'fries', 'burger', 'hamburger', 'cheeseburger', 'corn dog',
  'hot dog', 'pizza', 'pasta', 'spaghetti', 'sandwich', 'wrap', 'salad', 'soup',
  'sushi', 'ramen', 'taco', 'burrito', 'nachos', 'quesadilla', 'pretzel',
  'churro', 'popcorn', 'cotton candy', 'ice cream', 'gelato', 'sundae', 'sorbet',
  'soft serve', 'dole whip', 'milkshake', 'shake', 'smoothie', 'float',
  'cupcake', 'cookie', 'brownie', 'cake', 'pie', 'donut', 'doughnut', 'beignet',
  'waffle', 'pancake', 'croissant', 'muffin', 'bagel', 'cinnamon roll',
  'turkey leg', 'chicken tenders', 'chicken fingers', 'chicken nuggets',
  'wings', 'ribs', 'brisket', 'barbecue', 'bbq', 'steak', 'shrimp', 'lobster',
  'crab', 'salmon', 'sausage', 'bacon', 'rice', 'noodles', 'dumplings',
  'spring roll', 'egg roll', 'poutine', 'gyro', 'falafel', 'hummus', 'curry',
  'coffee', 'latte', 'cappuccino', 'espresso', 'cold brew', 'tea', 'boba',
  'soda', 'coke', 'coca cola', 'lemonade', 'juice', 'water', 'beer', 'cider',
  'wine', 'margarita', 'mojito', 'cocktail', 'mocktail', 'martini', 'sangria',
  'slushy', 'frozen lemonade', 'lunch box tart',
  // Core proteins and staples. Several of these also appear in venue names
  // ("Chicken Guy!"), so they are stated here rather than left to inference.
  'chicken', 'beef', 'pork', 'turkey', 'lamb', 'duck', 'tofu', 'potato',
  'potatoes', 'vegetables', 'fruit', 'cheese', 'bread', 'chocolate',
];

interface Candidate {
  items: number;
  restaurants: Set<string>;
}

/**
 * Well-formedness over a window of an already-stemmed token list.
 *
 * Takes indices rather than a sliced array because this runs once per n-gram
 * across every menu row -- re-stemming and re-allocating per window was the
 * bulk of the lexicon build.
 */
function windowIsWellFormed(stems: string[], start: number, size: number): boolean {
  if (size === 0 || size > MAX_PHRASE_TOKENS || start + size > stems.length) return false;
  // Classified on the stem so a plural spelling cannot smuggle a grammar word
  // in: "cans" would otherwise become a food term and then match the "can" in
  // "where can I get a burger".
  //
  // Grammar words may sit inside a dish name ("chicken and waffles") but never
  // at its edges, where they signal the phrase is really a fragment.
  if (classifyWord(stems[start]) !== 'content') return false;
  if (classifyWord(stems[start + size - 1]) !== 'content') return false;
  let allNoise = true;
  for (let index = start; index < start + size; index += 1) {
    const stem = stems[index];
    if (CONSTRAINT_RESERVED.has(stem)) return false;
    if (!MENU_NOISE.has(stem)) allNoise = false;
  }
  if (size === 1) {
    const stem = stems[start];
    if (stem.length < 3) return false;
    if (MENU_NOISE.has(stem)) return false;
    if (/^\d+$/.test(stem)) return false;
  }
  // A phrase made entirely of naming noise ("house special") names nothing.
  return !allNoise;
}

function phraseIsWellFormed(tokens: string[]): boolean {
  return windowIsWellFormed(tokens.map(singularize), 0, tokens.length);
}

function nameTokens(value: string): string[] {
  return normalizeForSearch(value)
    .replace(/[®™*]/g, ' ')
    .replace(/soft[ -]serve/g, 'softserve')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Restaurant sets only ever decide whether a count clears a threshold, so they
// stop growing once past the largest one. Without this cap the union work is
// proportional to the whole dataset for common tokens like "chicken".
const MAX_TRACKED_RESTAURANTS = VENUE_COLLISION_MIN_RESTAURANTS + 2;

function addRestaurants(target: Set<string>, source: Iterable<string>): void {
  if (target.size >= MAX_TRACKED_RESTAURANTS) return;
  for (const id of source) {
    target.add(id);
    if (target.size >= MAX_TRACKED_RESTAURANTS) return;
  }
}

export function buildFoodLexiconPhrases(data: LoadedData): string[] {
  // Disney repeats item names across venues about 3x and category tuples about
  // 27x. Collapsing to distinct values first means the n-gram pass runs once
  // per distinct string instead of once per row.
  const nameGroups = new Map<string, { count: number; restaurants: Set<string> }>();
  const categoryGroups = new Map<string, { count: number; restaurants: Set<string>; fields: string[] }>();
  for (const item of data.menuItems) {
    const nameGroup = nameGroups.get(item.item);
    if (nameGroup) {
      nameGroup.count += 1;
      addRestaurants(nameGroup.restaurants, [item.restaurant_id]);
    } else nameGroups.set(item.item, { count: 1, restaurants: new Set([item.restaurant_id]) });

    const categoryKey = `${item.category} ${item.category_group} ${(item.norm_categories ?? []).join(',')}`;
    const categoryGroup = categoryGroups.get(categoryKey);
    if (categoryGroup) {
      categoryGroup.count += 1;
      addRestaurants(categoryGroup.restaurants, [item.restaurant_id]);
    } else {
      // Fields are kept alongside rather than parsed back out of the key:
      // category names contain spaces, so splitting the key would corrupt them.
      categoryGroups.set(categoryKey, {
        count: 1,
        restaurants: new Set([item.restaurant_id]),
        fields: [item.category, item.category_group, ...(item.norm_categories ?? [])],
      });
    }
  }

  const candidates = new Map<string, Candidate>();
  const record = (phrase: string, count: number, restaurants: Set<string>) => {
    const existing = candidates.get(phrase);
    if (existing) {
      existing.items += count;
      addRestaurants(existing.restaurants, restaurants);
    } else candidates.set(phrase, { items: count, restaurants: new Set(restaurants) });
  };

  for (const [name, group] of nameGroups) {
    const tokens = nameTokens(name);
    if (tokens.length === 0) continue;
    const stems = tokens.map(singularize);
    for (let size = 1; size <= MAX_PHRASE_TOKENS; size += 1) {
      for (let start = 0; start + size <= tokens.length; start += 1) {
        if (!windowIsWellFormed(stems, start, size)) continue;
        record(size === 1 ? tokens[start] : tokens.slice(start, start + size).join(' '), group.count, group.restaurants);
      }
    }
  }

  // Disney's own category vocabulary is a second, cleaner source: a category
  // names a food class directly rather than an individual row.
  const categoryRestaurants = new Map<string, Set<string>>();
  for (const [key, group] of categoryGroups) {
    const [category, categoryGroup, normCategories] = key.split(' ');
    for (const raw of [category, categoryGroup, ...(normCategories ? normCategories.split(',') : [])]) {
      if (!raw) continue;
      for (const segment of raw.split(/[&/,]|\s+and\s+|-/)) {
        const tokens = nameTokens(segment);
        if (!phraseIsWellFormed(tokens)) continue;
        for (const token of tokens) {
          const stem = singularize(token);
          const seen = categoryRestaurants.get(stem);
          if (seen) addRestaurants(seen, group.restaurants);
          else categoryRestaurants.set(stem, new Set(group.restaurants));
        }
        record(tokens.join(' '), group.count, group.restaurants);
      }
    }
  }

  // Tokens that name a place rather than a food. "Cosmic", "Joffrey",
  // "Crystal", and "Mickey" are frequent in menu rows but identify a venue or
  // brand. Inside a linked entity the parser already claims their span; this
  // keeps them from acting as food terms when they appear on their own.
  const venueTokens = new Set<string>();
  for (const restaurant of data.restaurants) {
    for (const name of [restaurant.restaurant, restaurant.park, restaurant.area, restaurant.resort]) {
      if (!name) continue;
      nameTokens(name).forEach((token) => venueTokens.add(singularize(token)));
    }
  }

  const derived = Array.from(candidates.entries())
    .filter(([phrase, candidate]) => {
      if (candidate.items < MIN_ITEM_OCCURRENCES) return false;
      if (candidate.restaurants.size < MIN_DISTINCT_RESTAURANTS) return false;
      // A bare word is a food *class* only when Disney's own taxonomy treats it
      // as one across several venues. Without this, frequent proper nouns from
      // item naming become terms the parser believes in, and any query
      // containing them turns into a menu search. Multi-word phrases carry
      // their own evidence and are not restricted.
      if (!phrase.includes(' ')) {
        const stem = singularize(phrase);
        const attested = categoryRestaurants.get(stem)?.size ?? 0;
        return attested >= (venueTokens.has(stem)
          ? VENUE_COLLISION_MIN_RESTAURANTS
          : MIN_CATEGORY_RESTAURANTS);
      }
      return true;
    })
    .map(([phrase]) => phrase);

  // Curated terms lead so their guest-facing surface form wins when a derived
  // n-gram normalizes to the same key.
  // Anything the synonym layer can verify must also be recognisable, or the
  // parser would decline a term the proof layer was ready to prove.
  return [...CURATED_TERMS, ...knownSynonymTerms(), ...derived];
}
