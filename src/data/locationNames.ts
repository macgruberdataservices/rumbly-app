import type { Restaurant } from './types';

export const THEME_PARK_ORDER = [
  'Magic Kingdom Park',
  'EPCOT',
  "Disney's Hollywood Studios",
  "Disney's Animal Kingdom Theme Park",
];

export const WATER_PARK_ORDER = ["Disney's Blizzard Beach Water Park", "Disney's Typhoon Lagoon Water Park"];
export const DISNEY_SPRINGS_AREAS = new Set(['The Landing', 'West Side', 'Marketplace', 'Town Center']);

export const DISNEY_RESORTS_GROUP_KEY = 'Disney Resorts';
export const BOARDWALK_GROUP_KEY = "Disney's BoardWalk";
const WIDE_WORLD_OF_SPORTS_VENUE = 'ESPN Wide World of Sports Complex';

// Disney's `ancestorEntertainmentVenue`, mapped to the group each venue
// belongs in. Only these three values exist in the live feed (79
// restaurants, checked 2026-08-11).
//
// This is the last check before the Other fallback, deliberately below
// park/resort/Disney-Springs-area, so nothing already classified can move --
// 66 of the 79 match on their land area first and keep grouping exactly as
// they do now. It only rescues venues Disney gives no park and no resort:
// the BoardWalk and Wide World of Sports restaurants, whose `area` is a
// resort-area string ("EPCOT Resort Area") naming a region of the property
// rather than a place a guest walks to.
//
// Wide World of Sports folds in with the resorts rather than taking a card
// of its own -- two restaurants, rarely used (owner decision, 2026-08-11).
const VENUE_GROUP_KEYS: Record<string, string> = {
  'Disney Springs': 'Disney Springs',
  "Disney's BoardWalk": BOARDWALK_GROUP_KEY,
  [WIDE_WORLD_OF_SPORTS_VENUE]: DISNEY_RESORTS_GROUP_KEY,
};

// Undefined on records cached before the venue field shipped, and null on
// hand-coded venues, which have no facility doc to read it from.
export function venueGroupKey(restaurant: Pick<Restaurant, 'venue'>): string | null {
  if (!restaurant.venue) return null;
  return VENUE_GROUP_KEYS[restaurant.venue] ?? null;
}

export function venueDisplayName(venue: string): string {
  return venue === WIDE_WORLD_OF_SPORTS_VENUE ? 'ESPN Wide World of Sports' : venue;
}

const PARK_LABELS: Record<string, string> = {
  'Magic Kingdom Park': 'Magic Kingdom',
  EPCOT: 'EPCOT',
  "Disney's Hollywood Studios": 'Hollywood Studios',
  "Disney's Animal Kingdom Theme Park": 'Animal Kingdom',
  "Disney's Blizzard Beach Water Park": 'Blizzard Beach',
  "Disney's Typhoon Lagoon Water Park": 'Typhoon Lagoon',
};

const AREA_LABELS: Record<string, string> = {
  'Magic Kingdom Resort Area': 'TTC',
  'EPCOT Resort Area': 'Epcot Park Entrance',
};

export function parkDisplayName(park: string | null): string {
  if (!park) return '';
  return PARK_LABELS[park] ?? park;
}

export function areaDisplayName(area: string | null): string {
  if (!area) return '';
  return AREA_LABELS[area] ?? area;
}

export function restaurantLocationLabel(restaurant: Restaurant): string {
  if (restaurant.resort) return restaurant.resort;
  if (restaurant.area) return areaDisplayName(restaurant.area);
  return parkDisplayName(restaurant.park);
}

export function isWaterPark(park: string | null): boolean {
  return park !== null && WATER_PARK_ORDER.includes(park);
}

export interface LocationHierarchy {
  topKey: string;
  topLabel: string;
  topOrder: number;
  subKey: string | null;
  subLabel: string | null;
}

export function locationHierarchy(restaurant: Restaurant): LocationHierarchy {
  const themeParkIndex = restaurant.park ? THEME_PARK_ORDER.indexOf(restaurant.park) : -1;
  if (themeParkIndex !== -1) {
    return {
      topKey: restaurant.park!,
      topLabel: parkDisplayName(restaurant.park),
      topOrder: themeParkIndex,
      subKey: restaurant.area,
      subLabel: restaurant.area ? areaDisplayName(restaurant.area) : null,
    };
  }

  if (isWaterPark(restaurant.park)) {
    return {
      topKey: 'Water Parks',
      topLabel: 'Water Parks',
      topOrder: 40,
      subKey: restaurant.park,
      subLabel: parkDisplayName(restaurant.park),
    };
  }

  if (restaurant.resort) {
    return {
      topKey: 'Disney Resorts',
      topLabel: 'Resorts',
      topOrder: 20,
      subKey: restaurant.resort,
      subLabel: restaurant.resort,
    };
  }

  if (restaurant.area && DISNEY_SPRINGS_AREAS.has(restaurant.area)) {
    return {
      topKey: 'Disney Springs',
      topLabel: 'Disney Springs',
      topOrder: 30,
      subKey: restaurant.area,
      subLabel: restaurant.area,
    };
  }

  // Sub-heading deliberately falls back to the venue name, never to `area`:
  // for everything reaching this branch `area` is the resort-area string, and
  // AREA_LABELS would render "EPCOT Resort Area" as "Epcot Park Entrance" --
  // actively wrong for a BoardWalk restaurant. A BoardWalk venue gets no
  // sub-heading at all (one flat list); Wide World of Sports keeps one, since
  // it sits under Resorts beside real named resorts.
  const groupKey = venueGroupKey(restaurant);
  if (groupKey === BOARDWALK_GROUP_KEY) {
    return {
      topKey: BOARDWALK_GROUP_KEY,
      topLabel: BOARDWALK_GROUP_KEY,
      topOrder: 35,
      subKey: null,
      subLabel: null,
    };
  }
  if (groupKey === DISNEY_RESORTS_GROUP_KEY) {
    return {
      topKey: DISNEY_RESORTS_GROUP_KEY,
      topLabel: 'Resorts',
      topOrder: 20,
      subKey: restaurant.venue ?? null,
      subLabel: restaurant.venue ? venueDisplayName(restaurant.venue) : null,
    };
  }
  if (groupKey === 'Disney Springs') {
    return {
      topKey: 'Disney Springs',
      topLabel: 'Disney Springs',
      topOrder: 30,
      subKey: null,
      subLabel: null,
    };
  }

  const fallback = restaurant.area ?? restaurant.park ?? null;
  return {
    topKey: 'Other',
    topLabel: 'Other',
    topOrder: 50,
    subKey: fallback,
    subLabel: restaurant.area ? areaDisplayName(restaurant.area) : parkDisplayName(restaurant.park),
  };
}
