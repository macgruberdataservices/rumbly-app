import type { Restaurant } from '../data/types';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMiles(origin: Coordinates, destination: Coordinates): number {
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(haversine));
}

export function distanceToRestaurant(origin: Coordinates | null, restaurant: Restaurant): number | null {
  if (!origin || restaurant.lat === null || restaurant.lng === null) return null;
  return distanceMiles(origin, { latitude: restaurant.lat, longitude: restaurant.lng });
}

const FEET_PER_MILE = 5280;
// Below this, miles-with-one-decimal is too coarse to be useful --
// in-park walking distances (a few hundred to a couple thousand feet)
// would mostly all read as "<0.1 mi away" otherwise, which made it
// impossible to tell whether real walking-route data was even loading.
const FEET_DISPLAY_THRESHOLD_MILES = 0.5;

export function formatProximityDistance(miles: number): string {
  if (miles < FEET_DISPLAY_THRESHOLD_MILES) {
    const feet = Math.round((miles * FEET_PER_MILE) / 10) * 10;
    return feet < 50 ? '<50 ft away' : `${feet} ft away`;
  }
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}
