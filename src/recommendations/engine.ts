import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions.ts';
import { evaluateChallenge } from '../challenges/evaluate.ts';
import type { PersonalActivityReadModel } from '../data/activity';
import { getItemIdentityKey } from '../data/itemIdentity.ts';
import type { ChangeEvent, Restaurant, SearchIndexEntry } from '../data/types';
import { distanceToRestaurant, type Coordinates } from '../location/proximity.ts';
import type {
  CuratedFeedContent,
  FeedConfig,
  FeedItemRecommendation,
  FeedModule,
  RecommendationEvent,
} from './types';

const DEFAULT_CONFIGS: FeedConfig[] = [
  {
    moduleKey: 'find_feed',
    enabled: true,
    sortOrder: 0,
    maxItems: 1,
    requiredEntitlement: null,
    settings: { profile_window_days: 180, refresh_interval_minutes: 60 },
  },
  { moduleKey: 'nearby_need_it', enabled: true, sortOrder: 10, maxItems: 5, requiredEntitlement: null, settings: { max_distance_miles: 5 } },
  {
    moduleKey: 'nearby_for_you',
    enabled: true,
    sortOrder: 15,
    maxItems: 6,
    requiredEntitlement: null,
    settings: { max_distance_miles: 2, min_score: 4 },
  },
  {
    moduleKey: 'new_bites',
    enabled: true,
    sortOrder: 20,
    maxItems: 5,
    requiredEntitlement: null,
    settings: { new_window_days: 30, min_score: 4, max_per_restaurant: 1 },
  },
  { moduleKey: 'continue_challenge', enabled: true, sortOrder: 30, maxItems: 1, requiredEntitlement: null, settings: {} },
  {
    moduleKey: 'for_you',
    enabled: true,
    sortOrder: 40,
    maxItems: 8,
    requiredEntitlement: null,
    settings: {
      view_weight: 1,
      search_open_weight: 2,
      love_weight: 8,
      rating_4_weight: 6,
      rating_5_weight: 10,
      min_score: 4,
    },
  },
  { moduleKey: 'seasonal', enabled: true, sortOrder: 50, maxItems: 5, requiredEntitlement: null, settings: {} },
  { moduleKey: 'curated', enabled: true, sortOrder: 60, maxItems: 5, requiredEntitlement: null, settings: {} },
];

export interface BuildFeedInput {
  restaurants: Restaurant[];
  searchIndex: SearchIndexEntry[];
  activity: PersonalActivityReadModel;
  events: RecommendationEvent[];
  changes?: ChangeEvent[];
  content: CuratedFeedContent[];
  configs: FeedConfig[];
  origin: Coordinates | null;
  isEntitled: (featureKey: string) => boolean;
  now?: Date;
}

function canonicalItemName(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stableRotationKey(value: string, now: Date): number {
  const day = Math.floor(now.getTime() / 86_400_000);
  let hash = 2_166_136_261;
  const source = `${day}:${value}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function roundRobinByRestaurant(
  items: FeedItemRecommendation[],
  maxPerRestaurant: number
): FeedItemRecommendation[] {
  const groups = new Map<string, FeedItemRecommendation[]>();
  for (const item of items) {
    const restaurantId = item.restaurant.restaurant_id;
    const group = groups.get(restaurantId) ?? [];
    group.push(item);
    groups.set(restaurantId, group);
  }

  const diversified: FeedItemRecommendation[] = [];
  for (let round = 0; round < maxPerRestaurant; round += 1) {
    for (const group of groups.values()) {
      const item = group[round];
      if (item) diversified.push(item);
    }
  }
  return diversified;
}

function numberSetting(config: FeedConfig, key: string, fallback: number): number {
  const value = config.settings[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function available(config: FeedConfig, isEntitled: (featureKey: string) => boolean): boolean {
  return config.enabled && (!config.requiredEntitlement || isEntitled(config.requiredEntitlement));
}

function resolveConfigs(configs: FeedConfig[]): Map<string, FeedConfig> {
  const merged = new Map(DEFAULT_CONFIGS.map((config) => [config.moduleKey, config]));
  for (const config of configs) merged.set(config.moduleKey, config);
  return merged;
}

function addScore(map: Map<string, number>, value: string | null | undefined, score: number): void {
  const key = value?.trim().toLocaleLowerCase();
  if (!key || score === 0) return;
  map.set(key, (map.get(key) ?? 0) + score);
}

function ratingWeight(rating: number | null, config: FeedConfig): number {
  if (rating === 5) return numberSetting(config, 'rating_5_weight', 10);
  if (rating === 4) return numberSetting(config, 'rating_4_weight', 6);
  if (rating === 3) return 0;
  if (rating === 2) return -4;
  if (rating === 1) return -8;
  return 1;
}

function parsedDate(value: string): number {
  return Date.parse(value.includes('T') ? value : `${value}T00:00:00`);
}

function isLowValueRecommendation(item: SearchIndexEntry): boolean {
  const name = canonicalItemName(item.item);
  return /\b(cheese|fruit) cup\b/.test(name);
}

function activeMealPeriod(now: Date): { key: 'breakfast' | 'lunch' | 'dinner'; label: string } {
  const hour = now.getHours();
  if (hour < 11) return { key: 'breakfast', label: 'breakfast' };
  if (hour < 16) return { key: 'lunch', label: 'lunch' };
  return { key: 'dinner', label: 'dinner' };
}

function matchesMealPeriod(item: SearchIndexEntry, period: ReturnType<typeof activeMealPeriod>): boolean {
  const value = item.dining_period.toLocaleLowerCase();
  if (value.includes('all day')) return true;
  if (period.key === 'breakfast') return value.includes('breakfast') || value.includes('brunch');
  if (period.key === 'lunch') return value.includes('lunch') || value.includes('brunch');
  return value.includes('dinner');
}

function itemRecommendation(
  moduleKey: string,
  item: SearchIndexEntry,
  restaurant: Restaurant,
  reason: string,
  origin: Coordinates | null
): FeedItemRecommendation {
  return {
    kind: 'item',
    key: `${moduleKey}:${getItemIdentityKey(item.restaurant_id, item.item_id)}`,
    item,
    restaurant,
    reason,
    distanceMiles: distanceToRestaurant(origin, restaurant),
  };
}

function buildTasteProfile(
  input: BuildFeedInput,
  feedConfig: FeedConfig,
  forYouConfig: FeedConfig,
  restaurantById: Map<string, Restaurant>,
  itemByKey: Map<string, SearchIndexEntry>,
  now: Date
) {
  const categoryScores = new Map<string, number>();
  const cuisineScores = new Map<string, number>();
  const serviceScores = new Map<string, number>();
  const priceScores = new Map<string, number>();
  const explicitItemKeys = new Set<string>();
  const explicitItemNames = new Set<string>();
  let hasAllergyInterest = false;
  const loveWeight = numberSetting(forYouConfig, 'love_weight', 8);

  const scoreRestaurant = (restaurantId: string, weight: number) => {
    const restaurant = restaurantById.get(restaurantId);
    if (!restaurant) return;
    addScore(cuisineScores, restaurant.primary_cuisine, weight);
    addScore(cuisineScores, restaurant.secondary_cuisine, weight * 0.7);
    addScore(serviceScores, restaurant.service_style, weight * 0.45);
    addScore(priceScores, restaurant.price_tier?.toString(), weight * 0.35);
  };
  const scoreItem = (restaurantId: string, itemId: string, weight: number) => {
    const item = itemByKey.get(getItemIdentityKey(restaurantId, itemId));
    if (!item) return;
    for (const category of item.norm_categories) addScore(categoryScores, category, weight);
    addScore(categoryScores, item.category, weight * 0.8);
    scoreRestaurant(restaurantId, weight * 0.55);
  };
  const registerExplicitItem = (restaurantId: string, itemId: string) => {
    const key = getItemIdentityKey(restaurantId, itemId);
    explicitItemKeys.add(key);
    const item = itemByKey.get(key);
    if (!item) return;
    explicitItemNames.add(canonicalItemName(item.item));
  };

  for (const event of input.activity.lovedRestaurants) {
    scoreRestaurant(event.restaurantId, loveWeight);
  }
  for (const event of input.activity.lovedItems) {
    if (!event.itemId) continue;
    registerExplicitItem(event.restaurantId, event.itemId);
    if (itemByKey.get(getItemIdentityKey(event.restaurantId, event.itemId))?.is_allergy_friendly) {
      hasAllergyInterest = true;
    }
    scoreItem(event.restaurantId, event.itemId, loveWeight);
  }
  for (const event of input.activity.neededItems) {
    if (!event.itemId) continue;
    registerExplicitItem(event.restaurantId, event.itemId);
    if (itemByKey.get(getItemIdentityKey(event.restaurantId, event.itemId))?.is_allergy_friendly) {
      hasAllergyInterest = true;
    }
  }
  for (const event of input.activity.gotItHistory) {
    const weight = ratingWeight(event.rating, forYouConfig);
    if (event.itemId) {
      registerExplicitItem(event.restaurantId, event.itemId);
      scoreItem(event.restaurantId, event.itemId, weight);
      if (
        event.rating !== null
        && event.rating >= 4
        && itemByKey.get(getItemIdentityKey(event.restaurantId, event.itemId))?.is_allergy_friendly
      ) {
        hasAllergyInterest = true;
      }
    } else {
      scoreRestaurant(event.restaurantId, weight);
    }
  }

  const passiveByTarget = new Map<string, number>();
  const profileWindowDays = Math.max(1, numberSetting(feedConfig, 'profile_window_days', 180));
  for (const event of input.events) {
    if (event.eventType !== 'view' && event.eventType !== 'search_open') continue;
    const ageDays = Math.max(0, (now.getTime() - new Date(event.occurredAt).getTime()) / 86_400_000);
    if (ageDays > profileWindowDays) continue;
    const targetKey = event.itemId
      ? getItemIdentityKey(event.restaurantId ?? '', event.itemId)
      : `restaurant:${event.restaurantId ?? ''}`;
    const base = event.eventType === 'search_open'
      ? numberSetting(forYouConfig, 'search_open_weight', 2)
      : numberSetting(forYouConfig, 'view_weight', 1);
    const decayed = base * Math.max(0.2, 1 - ageDays / profileWindowDays);
    const remaining = Math.max(0, 4 - (passiveByTarget.get(targetKey) ?? 0));
    const weight = Math.min(remaining, decayed);
    passiveByTarget.set(targetKey, (passiveByTarget.get(targetKey) ?? 0) + weight);
    if (event.itemId && event.restaurantId) {
      const item = itemByKey.get(getItemIdentityKey(event.restaurantId, event.itemId));
      if (item?.is_allergy_friendly) hasAllergyInterest = true;
      scoreItem(event.restaurantId, event.itemId, weight);
    } else if (event.restaurantId) {
      scoreRestaurant(event.restaurantId, weight);
    }
  }

  return {
    categoryScores,
    cuisineScores,
    serviceScores,
    priceScores,
    explicitItemKeys,
    explicitItemNames,
    hasAllergyInterest,
  };
}

export function buildFindFeed(input: BuildFeedInput): FeedModule[] {
  const now = input.now ?? new Date();
  const configByKey = resolveConfigs(input.configs);
  const feedConfig = configByKey.get('find_feed')!;
  if (!available(feedConfig, input.isEntitled)) return [];

  const restaurantById = new Map(input.restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant]));
  const itemByKey = new Map(
    input.searchIndex.map((item) => [getItemIdentityKey(item.restaurant_id, item.item_id), item])
  );
  const modules: FeedModule[] = [];
  const excludedItemKeys = new Set<string>();
  const excludedItemNames = new Set<string>();

  const isExcluded = (item: SearchIndexEntry) =>
    excludedItemKeys.has(getItemIdentityKey(item.restaurant_id, item.item_id))
    || excludedItemNames.has(canonicalItemName(item.item));

  const registerItems = (items: FeedItemRecommendation[]) => {
    for (const recommendation of items) {
      excludedItemKeys.add(getItemIdentityKey(
        recommendation.item.restaurant_id,
        recommendation.item.item_id
      ));
      excludedItemNames.add(canonicalItemName(recommendation.item.item));
    }
  };

  const forYouConfig = configByKey.get('for_you')!;
  const {
    categoryScores,
    cuisineScores,
    serviceScores,
    priceScores,
    explicitItemKeys,
    explicitItemNames,
    hasAllergyInterest,
  } = buildTasteProfile(
    input,
    feedConfig,
    forYouConfig,
    restaurantById,
    itemByKey,
    now
  );

  const recommendationQuality = (item: SearchIndexEntry) =>
    item.show_in_menu
    && !isLowValueRecommendation(item)
    && (!item.is_allergy_friendly || hasAllergyInterest);

  const candidateScore = (item: SearchIndexEntry, restaurant: Restaurant): number => {
    const categoryScore = Math.max(
      ...item.norm_categories.map(
        (category) => categoryScores.get(category.toLocaleLowerCase()) ?? 0
      ),
      categoryScores.get(item.category.toLocaleLowerCase()) ?? 0,
      0
    );
    const cuisineScore = Math.max(
      cuisineScores.get(restaurant.primary_cuisine?.toLocaleLowerCase() ?? '') ?? 0,
      cuisineScores.get(restaurant.secondary_cuisine?.toLocaleLowerCase() ?? '') ?? 0,
      0
    );
    const serviceScore =
      serviceScores.get(restaurant.service_style?.toLocaleLowerCase() ?? '') ?? 0;
    const priceScore = priceScores.get(restaurant.price_tier?.toString() ?? '') ?? 0;
    return categoryScore + cuisineScore * 0.8 + serviceScore * 0.35 + priceScore * 0.2;
  };

  const nearbyConfig = configByKey.get('nearby_need_it')!;
  if (input.origin && available(nearbyConfig, input.isEntitled)) {
    const maxDistance = numberSetting(nearbyConfig, 'max_distance_miles', 5);
    const items = input.activity.neededItems
      .map((event) => {
        const key = event.itemId ? getItemIdentityKey(event.restaurantId, event.itemId) : '';
        const item = itemByKey.get(key);
        const restaurant = restaurantById.get(event.restaurantId);
        if (!item || !restaurant) return null;
        const distance = distanceToRestaurant(input.origin, restaurant);
        if (distance === null || distance > maxDistance) return null;
        return itemRecommendation('nearby_need_it', item, restaurant, 'On your Need It list nearby', input.origin);
      })
      .filter((item): item is FeedItemRecommendation => item !== null)
      .sort((left, right) => (left.distanceMiles ?? Infinity) - (right.distanceMiles ?? Infinity))
      .filter((item, index, items) =>
        items.findIndex((candidate) =>
          canonicalItemName(candidate.item.item) === canonicalItemName(item.item.item)
        ) === index
      )
      .slice(0, nearbyConfig.maxItems);
    if (items.length > 0) {
      registerItems(items);
      modules.push({
        key: 'nearby_need_it',
        title: 'Need It nearby',
        subtitle: 'Saved bites close to you',
        sortOrder: nearbyConfig.sortOrder,
        items,
      });
    }
  }

  const nearbyForYouConfig = configByKey.get('nearby_for_you')!;
  if (input.origin && available(nearbyForYouConfig, input.isEntitled)) {
    const maxDistance = numberSetting(nearbyForYouConfig, 'max_distance_miles', 2);
    const minScore = numberSetting(nearbyForYouConfig, 'min_score', 4);
    const mealPeriod = activeMealPeriod(now);
    const ranked = input.searchIndex
      .filter((item) =>
        recommendationQuality(item)
        && matchesMealPeriod(item, mealPeriod)
        && !explicitItemKeys.has(getItemIdentityKey(item.restaurant_id, item.item_id))
        && !explicitItemNames.has(canonicalItemName(item.item))
        && !isExcluded(item)
      )
      .flatMap((item) => {
        const restaurant = restaurantById.get(item.restaurant_id);
        if (!restaurant) return [];
        const distance = distanceToRestaurant(input.origin, restaurant);
        if (distance === null || distance > maxDistance) return [];
        const score = candidateScore(item, restaurant);
        if (score < minScore) return [];
        return [{ item, restaurant, distance, score }];
      })
      .sort((left, right) =>
        right.score - left.score
        || left.distance - right.distance
        || stableRotationKey(left.item.item_id, now) - stableRotationKey(right.item.item_id, now)
      );
    const restaurantIds = new Set<string>();
    const itemNames = new Set<string>();
    const items = ranked
      .filter(({ item, restaurant }) => {
        const name = canonicalItemName(item.item);
        if (restaurantIds.has(restaurant.restaurant_id) || itemNames.has(name)) return false;
        restaurantIds.add(restaurant.restaurant_id);
        itemNames.add(name);
        return true;
      })
      .slice(0, nearbyForYouConfig.maxItems)
      .map(({ item, restaurant }) =>
        itemRecommendation(
          'nearby_for_you',
          item,
          restaurant,
          `Recommended nearby for ${mealPeriod.label}`,
          input.origin
        )
      );
    if (items.length > 0) {
      registerItems(items);
      modules.push({
        key: 'nearby_for_you',
        title: 'What’s nearby',
        subtitle: `Recommended for ${mealPeriod.label}, close to you`,
        sortOrder: nearbyForYouConfig.sortOrder,
        items,
      });
    }
  }

  const newConfig = configByKey.get('new_bites')!;
  if (available(newConfig, input.isEntitled)) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - numberSetting(newConfig, 'new_window_days', 30));
    const minScore = numberSetting(newConfig, 'min_score', 4);
    const itemsByRestaurantAndName = new Map<string, SearchIndexEntry[]>();
    for (const item of input.searchIndex) {
      const key = `${item.restaurant_id}:${canonicalItemName(item.item)}`;
      const matches = itemsByRestaurantAndName.get(key) ?? [];
      matches.push(item);
      itemsByRestaurantAndName.set(key, matches);
    }
    const candidates = (input.changes ?? [])
      .filter((change) =>
        change.category === 'menu_item_added'
        && !!change.restaurant_id
        && !!change.item
        && parsedDate(change.date) >= cutoff.getTime()
        && (
          hasAllergyInterest
          || !change.menu_category?.toLocaleLowerCase().includes('allergy')
        )
      )
      .flatMap((change) => {
        const key = `${change.restaurant_id}:${canonicalItemName(change.item ?? '')}`;
        const matches = itemsByRestaurantAndName.get(key) ?? [];
        const matchingPeriod = change.dining_period
          ? matches.filter((item) =>
            item.dining_period.toLocaleLowerCase() === change.dining_period?.toLocaleLowerCase()
          )
          : matches;
        const item = (matchingPeriod.length > 0 ? matchingPeriod : matches)
          .find((candidate) =>
            recommendationQuality(candidate)
            && !explicitItemKeys.has(getItemIdentityKey(candidate.restaurant_id, candidate.item_id))
            && !explicitItemNames.has(canonicalItemName(candidate.item))
            && !isExcluded(candidate)
          );
        if (!item) return [];
        const restaurant = restaurantById.get(item.restaurant_id);
        if (!restaurant) return [];
        const score = candidateScore(item, restaurant);
        if (score < minScore) return [];
        return [{ item, restaurant, score, changedAt: change.date }];
      })
      .sort((left, right) =>
        right.score - left.score
        || right.changedAt.localeCompare(left.changedAt)
        || stableRotationKey(left.item.item_id, now) - stableRotationKey(right.item.item_id, now)
      )
      .filter((candidate, index, items) =>
        items.findIndex((other) =>
          canonicalItemName(other.item.item) === canonicalItemName(candidate.item.item)
        ) === index
      )
      .map(({ item, restaurant }) =>
        itemRecommendation(
          'new_bites',
          item,
          restaurant,
          `Recently added at ${restaurant.restaurant}`,
          input.origin
        )
      );
    const items = roundRobinByRestaurant(
      candidates,
      Math.max(1, numberSetting(newConfig, 'max_per_restaurant', 1))
    )
      .slice(0, newConfig.maxItems);
    if (items.length > 0) {
      registerItems(items);
      modules.push({
        key: 'new_bites',
        title: 'New Bites',
        subtitle: 'Recently added menu items matched to your taste',
        sortOrder: newConfig.sortOrder,
        items,
      });
    }
  }

  const challengeConfig = configByKey.get('continue_challenge')!;
  if (available(challengeConfig, input.isEntitled)) {
    const progress = evaluateChallenge(
      QUICK_FIVE_CHALLENGE,
      input.activity.gotItHistory,
      input.restaurants
    );
    if (progress.currentCount > 0 && !progress.isComplete) {
      modules.push({
        key: 'continue_challenge',
        title: 'Keep going',
        subtitle: null,
        sortOrder: challengeConfig.sortOrder,
        items: [{
          kind: 'challenge',
          key: `challenge:${QUICK_FIVE_CHALLENGE.id}`,
          definition: QUICK_FIVE_CHALLENGE,
          progress,
          reason: `${progress.requiredCount - progress.currentCount} more to finish this round`,
        }],
      });
    }
  }

  if (available(forYouConfig, input.isEntitled)) {
    const minScore = numberSetting(forYouConfig, 'min_score', 4);
    const ranked = input.searchIndex
      .filter((item) =>
        recommendationQuality(item)
        && !explicitItemKeys.has(getItemIdentityKey(item.restaurant_id, item.item_id))
        && !explicitItemNames.has(canonicalItemName(item.item))
        && !isExcluded(item)
      )
      .flatMap((item) => {
        const restaurant = restaurantById.get(item.restaurant_id);
        if (!restaurant) return [];
        const categoryAffinity = Math.max(
          ...item.norm_categories.map((category) => categoryScores.get(category.toLocaleLowerCase()) ?? 0),
          categoryScores.get(item.category.toLocaleLowerCase()) ?? 0,
          0
        );
        const score = candidateScore(item, restaurant);
        if (score < minScore) return [];
        const reason = categoryAffinity > 0
          ? `Inspired by your interest in ${item.category.toLocaleLowerCase()}`
          : restaurant.primary_cuisine
            ? `A ${restaurant.primary_cuisine} pick from your taste profile`
            : 'Based on bites you Love and rate highly';
        return [{ item, restaurant, score, reason }];
      })
      .sort((left, right) =>
        right.score - left.score
        || stableRotationKey(left.item.item_id, now) - stableRotationKey(right.item.item_id, now)
      );
    const restaurantCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const itemNames = new Set<string>();
    const diverse = ranked.filter(({ item, restaurant }) => {
      const restaurantCount = restaurantCounts.get(restaurant.restaurant_id) ?? 0;
      if (restaurantCount >= 1) return false;
      const name = canonicalItemName(item.item);
      if (itemNames.has(name)) return false;
      const category = canonicalItemName(item.category);
      const categoryCount = categoryCounts.get(category) ?? 0;
      if (categoryCount >= 2) return false;
      restaurantCounts.set(restaurant.restaurant_id, restaurantCount + 1);
      itemNames.add(name);
      categoryCounts.set(category, categoryCount + 1);
      return true;
    }).slice(0, forYouConfig.maxItems);
    const scored = diverse.map(({ item, restaurant, reason }) =>
        itemRecommendation('for_you', item, restaurant, reason, input.origin)
      );
    if (scored.length > 0) {
      registerItems(scored);
      modules.push({
        key: 'for_you',
        title: 'For you',
        subtitle: 'Shaped by what you Love and rate highly',
        sortOrder: forYouConfig.sortOrder,
        items: scored,
      });
    }
  }

  const seasonalConfig = configByKey.get('seasonal')!;
  if (available(seasonalConfig, input.isEntitled)) {
    const items = input.searchIndex
      .filter((item) =>
        recommendationQuality(item)
        && item.is_festival_item
        && !isExcluded(item)
      )
      .sort((left, right) =>
        right.first_seen.localeCompare(left.first_seen)
        || stableRotationKey(left.item_id, now) - stableRotationKey(right.item_id, now)
      )
      .filter((item, index, items) =>
        items.findIndex((candidate) =>
          canonicalItemName(candidate.item) === canonicalItemName(item.item)
        ) === index
      )
      .flatMap((item) => {
        const restaurant = restaurantById.get(item.restaurant_id);
        return restaurant
          ? [itemRecommendation('seasonal', item, restaurant, 'Available with the current festival menu', input.origin)]
          : [];
      })
      .slice(0, seasonalConfig.maxItems);
    if (items.length > 0) {
      modules.push({
        key: 'seasonal',
        title: 'Seasonal now',
        subtitle: 'Limited-time festival bites',
        sortOrder: seasonalConfig.sortOrder,
        items,
      });
    }
  }

  const curatedConfig = configByKey.get('curated')!;
  if (available(curatedConfig, input.isEntitled) && input.content.length > 0) {
    modules.push({
      key: 'curated',
      title: 'Worth a look',
      subtitle: 'Seasonal picks and stories selected by Rumbly',
      sortOrder: curatedConfig.sortOrder,
      items: input.content.slice(0, curatedConfig.maxItems).map((content) => ({
        kind: 'content',
        key: `content:${content.id}`,
        content,
      })),
    });
  }

  return modules
    .filter((module) => module.items.length > 0)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}
