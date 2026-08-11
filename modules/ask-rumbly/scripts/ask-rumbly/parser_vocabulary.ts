import type { ParserEntity, ParserVocabulary } from '../../../../src/askRumbly/queryPlan.ts';
import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import { resortAliases } from './location_aliases.ts';

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function restaurantAliases(name: string): string[] {
  const plain = name
    .replace(/[®™]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const aliases = new Set([name, plain, plain.replace(/'/g, '')]);
  let shortened = plain;
  let previous = '';
  while (shortened !== previous) {
    previous = shortened;
    shortened = shortened.replace(/\s+(?:restaurant|cafe|café|theater|soda shop|dining room)$/i, '').trim();
    if (shortened.length >= 5 && shortened !== plain) {
      aliases.add(shortened);
      aliases.add(shortened.replace(/'/g, ''));
    }
  }
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
  return Array.from(names).map((name) => ({
    id: `location:${field}:${slug(name)}`,
    label: name,
    type: field,
    aliases: field === 'resort'
      ? resortAliases(name).filter((alias) => !RESERVED_PARK_ALIASES.has(alias.toLowerCase()))
      : [name, ...(PARK_SHORT_ALIASES[name] ?? [])],
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

export function buildParserVocabulary(data: LoadedData): ParserVocabulary {
  const restaurants: ParserEntity[] = data.restaurants.map((restaurant) => ({
    id: restaurant.restaurant_id,
    label: restaurant.restaurant,
    type: 'restaurant',
    aliases: [
      ...restaurantAliases(restaurant.restaurant),
      ...(RESTAURANT_ALIAS_OVERRIDES[restaurant.restaurant] ?? []),
    ],
  }));
  const locations = [
    ...locationEntities(data, 'park'),
    ...locationEntities(data, 'area'),
    ...locationEntities(data, 'resort'),
  ];
  for (const entity of locations) {
    entity.aliases.push(...(LOCATION_ALIAS_OVERRIDES[entity.label] ?? []));
  }
  const cuisines = Array.from(new Set(data.restaurants.flatMap((restaurant) => restaurant.cuisine_tags ?? [])));
  return {
    entities: [...restaurants, ...locations],
    protectedFoodPhrases: Array.from(new Set([
      ...PROTECTED_FOOD_PHRASES,
      ...menuDerivedProtectedFoodPhrases(data),
    ])),
    cuisines,
  };
}
