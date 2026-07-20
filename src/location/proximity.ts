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

export function formatProximityDistance(miles: number): string {
  if (miles < 0.1) return '<0.1 mi away';
  if (miles < 10) return `${miles.toFixed(1)} mi away`;
  return `${Math.round(miles)} mi away`;
}
