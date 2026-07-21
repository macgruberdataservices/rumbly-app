import type { PersonalActivityEvent } from '../data/activity';
import type { Restaurant } from '../data/types';

export type ChallengeRepeatMode = 'once' | 'repeatable_round';

export interface ChallengeDefinition {
  id: string;
  version: number;
  title: string;
  description: string;
  badgeTitle: string;
  repeatMode: ChallengeRepeatMode;
  goal: {
    kind: 'distinct_restaurants';
    requiredCount: number | 'all';
  };
  criteria: {
    serviceStyles?: string[];
    parks?: string[];
  };
}

export interface ChallengeCompletion {
  instance: number;
  completedAt: string;
  restaurantIds: string[];
  contributingClientIds: string[];
}

export interface ChallengeProgress {
  challengeId: string;
  challengeVersion: number;
  repeatMode: ChallengeRepeatMode;
  requiredCount: number;
  currentCount: number;
  currentRestaurantIds: string[];
  completions: ChallengeCompletion[];
  isComplete: boolean;
}

function normalized(value: string | null): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export function eligibleRestaurants(
  definition: ChallengeDefinition,
  restaurants: Restaurant[]
): Restaurant[] {
  const serviceStyles = new Set((definition.criteria.serviceStyles ?? []).map(normalized));
  const parks = new Set((definition.criteria.parks ?? []).map(normalized));

  return restaurants.filter((restaurant) => {
    if (!restaurant.show_in_app) return false;
    if (serviceStyles.size > 0 && !serviceStyles.has(normalized(restaurant.service_style))) return false;
    if (parks.size > 0 && !parks.has(normalized(restaurant.park))) return false;
    return true;
  });
}

export function evaluateChallenge(
  definition: ChallengeDefinition,
  events: PersonalActivityEvent[],
  restaurants: Restaurant[]
): ChallengeProgress {
  const eligible = eligibleRestaurants(definition, restaurants);
  const eligibleIds = new Set(eligible.map((restaurant) => restaurant.restaurant_id));
  const requiredCount = definition.goal.requiredCount === 'all'
    ? eligibleIds.size
    : definition.goal.requiredCount;
  const orderedEvents = events
    .filter((event) => event.activityType === 'got_it' && eligibleIds.has(event.restaurantId))
    .sort((left, right) => {
      const dateOrder = left.occurredAt.localeCompare(right.occurredAt);
      return dateOrder === 0 ? left.clientId.localeCompare(right.clientId) : dateOrder;
    });
  const currentRestaurantIds = new Set<string>();
  const currentClientIds = new Map<string, string>();
  const completions: ChallengeCompletion[] = [];

  for (const event of orderedEvents) {
    if (definition.repeatMode === 'once' && completions.length > 0) break;
    if (currentRestaurantIds.has(event.restaurantId)) continue;

    currentRestaurantIds.add(event.restaurantId);
    currentClientIds.set(event.restaurantId, event.clientId);

    if (requiredCount > 0 && currentRestaurantIds.size >= requiredCount) {
      const restaurantIds = [...currentRestaurantIds];
      completions.push({
        instance: completions.length + 1,
        completedAt: event.occurredAt,
        restaurantIds,
        contributingClientIds: restaurantIds.map((restaurantId) => currentClientIds.get(restaurantId)!),
      });

      if (definition.repeatMode === 'repeatable_round') {
        currentRestaurantIds.clear();
        currentClientIds.clear();
      }
    }
  }

  const isComplete = definition.repeatMode === 'once' && completions.length > 0;
  return {
    challengeId: definition.id,
    challengeVersion: definition.version,
    repeatMode: definition.repeatMode,
    requiredCount,
    currentCount: isComplete ? requiredCount : currentRestaurantIds.size,
    currentRestaurantIds: isComplete ? completions[0].restaurantIds : [...currentRestaurantIds],
    completions,
    isComplete,
  };
}
