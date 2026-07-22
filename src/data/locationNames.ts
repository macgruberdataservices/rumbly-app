import type { Restaurant } from './types';

export const THEME_PARK_ORDER = [
  'Magic Kingdom Park',
  'EPCOT',
  "Disney's Hollywood Studios",
  "Disney's Animal Kingdom Theme Park",
];

export const WATER_PARK_ORDER = ["Disney's Blizzard Beach Water Park", "Disney's Typhoon Lagoon Water Park"];
export const DISNEY_SPRINGS_AREAS = new Set(['The Landing', 'West Side', 'Marketplace', 'Town Center']);

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

  const fallback = restaurant.area ?? restaurant.park ?? null;
  return {
    topKey: 'Other',
    topLabel: 'Other',
    topOrder: 50,
    subKey: fallback,
    subLabel: restaurant.area ? areaDisplayName(restaurant.area) : parkDisplayName(restaurant.park),
  };
}
