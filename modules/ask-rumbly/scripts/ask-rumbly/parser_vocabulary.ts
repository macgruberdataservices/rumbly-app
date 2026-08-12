import type { ParserEntity, ParserVocabulary } from '../../../../src/askRumbly/queryPlan.ts';
import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import { DISTANCE_ANCHORS, distanceAnchorById } from '../../../../src/askRumbly/distanceAnchors.ts';
import { buildFoodLexicon } from '../../../../src/askRumbly/foodLexicon.ts';
import { resortAliases } from './location_aliases.ts';
import { buildFoodLexiconPhrases } from './food_lexicon_source.ts';

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Words that describe what a venue *is* rather than name it. Guests drop them:
// "Flame Tree Barbecue" gets asked about as "Flame Tree" or "flame tree bbq",
// and every one of those failed to link while this list held only four
// descriptors.
const VENUE_DESCRIPTOR = /\s+(?:restaurants?|cafe|caf\u00e9|theatre|theater|soda shop|dining room|barbecue|bbq|grille?|kitchen|bar|lounge|tavern|taverna|pub|eatery|bakery|canteen|cantina|hall|marketplace|market|creamery|parlou?r|company|co\.?|ltd\.?|inn|outpost|stand|shop|terrace|gardens?|club|boulangerie|patisserie|p\u00e2tisserie|bistro|brasserie|trattoria|ristorante|pizzeria|steakhouse|smokehouse|taphouse|tap house|alehouse|roastery|creperie|cr\u00eaperie|sweets|treats|confectionery|k\u00fcche|kuche)$/i;

function restaurantAliases(name: string, reservedNames: ReadonlySet<string>): string[] {
  const plain = name
    .replace(/[\u00ae\u2122]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = new Set([name, plain, plain.replace(/'/g, '')]);
  const add = (alias: string) => {
    const trimmed = alias.trim();
    // A shortened form must stay distinctive, and must never collide with a
    // park, area, or resort name -- "Grand Floridian Cafe" shortening to
    // "Grand Floridian" would otherwise capture every question about the
    // resort itself.
    if (trimmed.length < 4) return;
    if (reservedNames.has(trimmed.toLowerCase())) return;
    aliases.add(trimmed);
    aliases.add(trimmed.replace(/'/g, ''));
  };

  let shortened = plain;
  let previous = '';
  while (shortened !== previous) {
    previous = shortened;
    shortened = shortened.replace(VENUE_DESCRIPTOR, '').trim();
    if (shortened !== plain) add(shortened);
  }
  // Disney writes "Barbecue"; guests write "BBQ", and the reverse.
  if (/\bbarbecue\b/i.test(plain)) add(plain.replace(/\bbarbecue\b/i, 'BBQ'));
  if (/\bbbq\b/i.test(plain)) add(plain.replace(/\bbbq\b/i, 'Barbecue'));
  // Everything before a colon or dash is the venue's actual name, as in
  // "Regal Eagle Smokehouse: Craft Drafts & Barbecue".
  const beforeSeparator = plain.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)[0];
  if (beforeSeparator !== plain) add(beforeSeparator);
  return Array.from(aliases);
}

const RESTAURANT_ALIAS_OVERRIDES: Readonly<Record<string, string[]>> = {
  "Cosmic Ray's Starlight Café": ["Cosmic Ray's", 'Cosmic Rays'],
  'Jungle Navigation Co. LTD Skipper Canteen': ['Skipper Canteen'],
  'Pecos Bill Tall Tale Inn and Cafe': ['Pecos Bill'],
  'Regal Eagle Smokehouse: Craft Drafts & Barbecue': ['Regal Eagle'],
  'Jiko - The Cooking Place': ['Jiko'],
  'Docking Bay 7 Food and Cargo': ['Docking Bay 7'],
  'Raglan Road™ Irish Pub and Restaurant': ['Raglan Road'],
  'BaseLine Tap House': ['Baseline Taphouse', 'Baseline Tap House'],
};

function locationEntities(data: LoadedData, field: 'park' | 'area' | 'resort'): ParserEntity[] {
  const names = new Set(
    data.restaurants
      .map((restaurant) => restaurant[field])
      .filter((name): name is string => Boolean(name?.trim()))
  );
  return Array.from(names).map((name) => {
    const id = `location:${field}:${slug(name)}`;
    const anchor = field === 'area' ? distanceAnchorById(id) : undefined;
    return {
      id,
      label: name,
      type: field,
      aliases: field === 'resort'
        ? resortAliases(name).filter((alias) => !RESERVED_PARK_ALIASES.has(alias.toLowerCase()))
        : [name, ...(PARK_SHORT_ALIASES[name] ?? [])],
      distanceAnchor: anchor ? {
        entityId: anchor.id,
        entityType: anchor.entityType,
        label: anchor.label,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        approximation: anchor.approximation,
      } : undefined,
    } satisfies ParserEntity;
  });
}

function attractionAliases(name: string): string[] {
  const plain = name
    .replace(/[®™]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^"|"$/g, '')
    .replace(/\s+-\s+Disney Animals$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(new Set([
    name,
    plain,
    plain.replace(/'/g, ''),
    ...(ATTRACTION_ALIAS_OVERRIDES[name] ?? []),
  ]));
}

const ATTRACTION_ALIAS_OVERRIDES: Readonly<Record<string, string[]>> = {
  'Star Wars: Rise of the Resistance': ['rise of the resistance', 'rise of resistance'],
  'The Twilight Zone™ Tower of Terror': ['tower of terror'],
  'Avatar Flight of Passage': ['flight of passage'],
  'Expedition Everest - Legend of the Forbidden Mountain': ['expedition everest', 'everest'],
  'Kilimanjaro Safaris': ['kilimanjaro safaris exit'],
  'Cinderella Castle': ['the castle', 'castle'],
};

function attractionEntities(): ParserEntity[] {
  return DISTANCE_ANCHORS
    .filter((anchor) => anchor.entityType === 'attraction')
    .map((anchor) => ({
      id: anchor.id,
      label: anchor.label,
      type: 'attraction' as const,
      aliases: attractionAliases(anchor.label),
      distanceAnchor: {
        entityId: anchor.id,
        entityType: anchor.entityType,
        label: anchor.label,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        approximation: anchor.approximation,
      },
    }));
}

const RESERVED_PARK_ALIASES = new Set(['magic kingdom', 'epcot', 'animal kingdom', 'hollywood studios', 'disney springs']);

const PARK_SHORT_ALIASES: Readonly<Record<string, string[]>> = {
  EPCOT: ['Epcot', 'Epoct'],
  'Magic Kingdom Park': ['Magic Kingdom'],
  "Disney's Magic Kingdom Theme Park": ['Magic Kingdom'],
  "Disney's Animal Kingdom Theme Park": ['Animal Kingdom'],
  "Disney's Hollywood Studios": ['Hollywood Studios'],
};

const LOCATION_ALIAS_OVERRIDES: Readonly<Record<string, string[]>> = {
  Tomorrowland: ['space mountain'],
  'Sunset Boulevard': ['tower of terror'],
  Asia: ['expedition everest', 'everest'],
  Africa: ['kilimanjaro safaris', 'kilimanjaro safaris exit'],
  'Discovery Island': ['tree of life'],
  'Liberty Square': ['haunted mansion'],
  'Main Street, U.S.A.': ['magic kingdom entrance', 'magic kingdom front gate', 'magic kingdom front gates'],
  Fantasyland: ['cinderella castle', 'the castle', 'castle'],
  'Pandora – The World of Avatar': ['pandora', 'flight of passage', 'avatar flight of passage'],
  "Star Wars: Galaxy's Edge": ['galaxys edge', 'galaxy edge', 'star wars edge', 'rise of the resistance'],
  'West Side': ['west side disney springs', 'disney springs west side'],
  'World Showcase': ['epcot world showcase', 'world showcase epcot'],
  "Disney's Coronado Springs Resort": ['coronado'],
  "Disney's Polynesian Village Resort": ['poly', 'polynesian'],
  "Disney's Polynesian Villas & Bungalows": ['poly', 'polynesian'],
  "Disney's Port Orleans Resort - French Quarter": ['french quarter'],
  "Disney's All-Star Sports Resort": ['all star sports', 'all-star sports'],
  "Walt Disney World Swan Hotel": ['swan'],
  "Walt Disney World Dolphin Hotel": ['dolphin'],
  "Disney's Animal Kingdom Villas - Kidani Village": ['kidani'],
  "Disney's Beach Club Resort": ['beach club', 'beach club pool'],
  "Disney's Yacht Club Resort": ['yacht'],
  "Disney's BoardWalk Inn": ['boardwalk'],
  "Disney's BoardWalk Villas": ['boardwalk'],
  "Disney's Caribbean Beach Resort": ['caribbean beach', 'carribean beach'],
  "Disney's Contemporary Resort": ['contemporary'],
};

const PROTECTED_FOOD_PHRASES = [
  'mac and cheese',
  'macaroni and cheese',
  'chicken and waffles',
  'fish and chips',
  'biscuits and gravy',
  'peanut butter and jelly',
  'cookies and cream',
  'french fries',
];

const MEAL_WORD_PATTERN = /\b(?:breakfast|lunch|dinner|snack)\b/i;

function menuDerivedProtectedFoodPhrases(data: LoadedData): string[] {
  const phrases = new Set<string>();
  for (const item of data.menuItems) {
    const searchableName = item.item
      .replace(/\s+[-–—]\s+.*allergy[ -]friendly.*$/i, '')
      .replace(/[®™*]/g, '')
      .replace(/[^a-z0-9' -]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const mealMatch = searchableName.match(MEAL_WORD_PATTERN);
    if (!mealMatch || mealMatch.index == null) continue;
    const phrase = searchableName.slice(mealMatch.index).trim().toLowerCase();
    // A meal word by itself remains a meal-period constraint. Protect only
    // known multi-word menu names such as "lunch box tart" or
    // "breakfast sandwich" where the meal word is part of the food name.
    if (phrase.split(/\s+/).length > 1) phrases.add(phrase);
  }
  return Array.from(phrases);
}

// runAskRumbly() builds the vocabulary on every submitted question. Scanning
// 46k menu rows for the food lexicon per keystroke-sized query would undo the
// launch/feed performance work, so the result is cached against the data
// snapshot it was derived from and rebuilt only when that snapshot changes.
const vocabularyCache = new WeakMap<object, ParserVocabulary>();

export function buildParserVocabulary(data: LoadedData): ParserVocabulary {
  const cached = vocabularyCache.get(data as unknown as object);
  if (cached) return cached;
  const vocabulary = createParserVocabulary(data);
  vocabularyCache.set(data as unknown as object, vocabulary);
  return vocabulary;
}

function createParserVocabulary(data: LoadedData): ParserVocabulary {
  const locations = [
    ...locationEntities(data, 'park'),
    ...locationEntities(data, 'area'),
    ...locationEntities(data, 'resort'),
  ];
  // Shortened restaurant aliases must not shadow a place name.
  const reservedNames = new Set(
    locations.flatMap((entity) => [entity.label, ...entity.aliases]).map((value) => value.toLowerCase()),
  );
  const restaurants: ParserEntity[] = data.restaurants.map((restaurant) => ({
    id: restaurant.restaurant_id,
    label: restaurant.restaurant,
    type: 'restaurant',
    aliases: [
      ...restaurantAliases(restaurant.restaurant, reservedNames),
      ...(RESTAURANT_ALIAS_OVERRIDES[restaurant.restaurant] ?? []),
    ],
  }));
  for (const entity of locations) {
    entity.aliases.push(...(LOCATION_ALIAS_OVERRIDES[entity.label] ?? []));
  }
  const cuisines = Array.from(new Set(data.restaurants.flatMap((restaurant) => restaurant.cuisine_tags ?? [])));
  const protectedFoodPhrases = Array.from(new Set([
    ...PROTECTED_FOOD_PHRASES,
    ...menuDerivedProtectedFoodPhrases(data),
  ]));
  return {
    // Exact attraction names precede area aliases so "Space Mountain" binds
    // to its measured point instead of the broader Tomorrowland alias.
    entities: [...restaurants, ...attractionEntities(), ...locations],
    protectedFoodPhrases,
    cuisines,
    // Protected phrases lead: they are the multi-word dish names that contain
    // a meal word ("lunch box tart") and must stay atomic rather than being
    // split into a meal-period constraint plus a food.
    foodLexicon: buildFoodLexicon([...protectedFoodPhrases, ...buildFoodLexiconPhrases(data)]),
  };
}
