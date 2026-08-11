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
  // 0.5 mi, not the old 5 mi -- matches FEET_DISPLAY_THRESHOLD_MILES in
  // proximity.ts, the app's own definition of "close enough that miles
  // isn't the useful unit." 5 mi meant "nearby" could mean anywhere on
  // Disney property; this keeps it to things actually within walking reach.
  { moduleKey: 'nearby_need_it', enabled: true, sortOrder: 10, maxItems: 5, requiredEntitlement: null, settings: { max_distance_miles: 0.5 } },
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

// Memoized because this is the hottest function in the build by a wide
// margin. It is pure, it does an NFKD normalize plus four regex replaces, and
// the engine calls it on the order of a hundred thousand times per build:
// every full-index pass runs it twice per item (once inside
// isLowValueRecommendation via recommendationQuality, once inside
// isExcluded), and new_bites keys a Map by it across the entire index.
//
// It is also strikingly repetitive on real data -- only ~52% of index entries
// have a distinct item name, because the same dish repeats across dining
// periods and across venues -- so most of that work was recomputing an answer
// already produced.
//
// Module-level rather than per-build so a second build in the same session
// pays almost nothing for it; that matters because a signed-in launch can
// build the feed twice as entitlements resolve. Capped so it cannot grow
// without bound across data refreshes: ~16k distinct names is the steady
// state, well under the limit, so the clear is a safety valve rather than
// something that fires in ordinary use.
const CANONICAL_NAME_CACHE_LIMIT = 40_000;
const canonicalNameCache = new Map<string, string>();

function canonicalItemName(value: string): string {
  const cached = canonicalNameCache.get(value);
  if (cached !== undefined) return cached;
  const canonical = value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (canonicalNameCache.size >= CANONICAL_NAME_CACHE_LIMIT) canonicalNameCache.clear();
  canonicalNameCache.set(value, canonical);
  return canonical;
}

// Memoized for the same reason canonicalItemName is, but the multiplier here
// is worse: this is called from inside sort comparators, so a rail ranking N
// candidates invokes it O(N log N) times -- and each call allocated a
// template string and ran an FNV hash over it. Profiling put it at ~9% of
// total build self-time.
//
// The cache is keyed on `value` alone, with the day tracked separately and
// the cache cleared when it rolls over. Keying on the composed `${day}:${value}`
// would mean allocating that string just to perform the lookup, which is most
// of what we are trying to avoid. Rotation is intentionally day-stable -- the
// clear on rollover is what preserves that, not an optimisation detail.
const ROTATION_CACHE_LIMIT = 40_000;
const rotationCache = new Map<string, number>();
let rotationCacheDay = Number.NaN;

function stableRotationKey(value: string, now: Date): number {
  const day = Math.floor(now.getTime() / 86_400_000);
  if (day !== rotationCacheDay) {
    rotationCacheDay = day;
    rotationCache.clear();
  }
  const cached = rotationCache.get(value);
  if (cached !== undefined) return cached;
  let hash = 2_166_136_261;
  const source = `${day}:${value}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  const result = hash >>> 0;
  if (rotationCache.size >= ROTATION_CACHE_LIMIT) rotationCache.clear();
  rotationCache.set(value, result);
  return result;
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

// Venue types that aren't scoped to a breakfast/lunch/dinner seating window
// -- a snack cart or pool bar serves whenever it's open, not during "the
// dinner window" specifically. Without this, real dining_period values like
// "Snack" and "Bar – Lounge" never matched any period and those items
// were permanently invisible to "What's nearby" (~22% of the catalog,
// confirmed against production menu data, Snack alone being the largest
// single bucket -- a bad miss for a snack-discovery app).
function isAlwaysAvailablePeriod(value: string): boolean {
  return (
    value.includes('snack')
    || value.includes('lounge')
    || value.includes('pool bar')
    || value.includes('coffee')
    || value.includes('special')
  );
}

function matchesMealPeriod(item: SearchIndexEntry, period: ReturnType<typeof activeMealPeriod>): boolean {
  const value = item.dining_period.toLocaleLowerCase();
  if (value.includes('all day') || isAlwaysAvailablePeriod(value)) return true;
  if (period.key === 'breakfast') return value.includes('breakfast') || value.includes('brunch');
  if (period.key === 'lunch') return value.includes('lunch') || value.includes('brunch');
  // "Late Night Dining" deliberately matches here too -- "dining" isn't
  // "dinner" as a substring, and dinner (4pm onward, no upper bound) is the
  // only bucket active late at night anyway.
  return value.includes('dinner') || value.includes('late night');
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

// How many candidates the for_you rail scores between yields. Sized so a
// batch lands well inside a frame on device: the rail costs ~42ms across the
// full candidate set on desktop V8, and the device runs roughly 9x slower, so
// batching at this granularity keeps each pause-to-pause interval in the low
// single-digit milliseconds here and comfortably sub-frame there.
const FOR_YOU_SCORING_BATCH = 2_000;

// nearby_for_you scores the same candidate set with a distance check on top,
// so it batches at the same granularity for the same reason.
const NEARBY_SCORING_BATCH = 2_000;

// Presentation order for whatever rails exist so far. Applied at every step
// so a partial result is directly renderable rather than something the
// caller has to know how to finish.
function finalizeModules(modules: FeedModule[]): FeedModule[] {
  return modules
    .filter((module) => module.items.length > 0)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

// What one pause-to-pause interval of the build produced. The label exists so
// cost can be attributed to a named rail rather than to an opaque step index
// -- on device that is the difference between "the feed is slow" and "the
// new_bites rail is slow", which is the only version you can act on.
export interface FeedBuildStep {
  label: string;
  modules: FeedModule[];
}

// The whole feed in one synchronous call. Kept as the primary API because it
// is what the tests and any non-UI caller want, and because it is the
// definition of correct that the chunked path below must match.
export function buildFindFeed(input: BuildFeedInput): FeedModule[] {
  const steps = buildFindFeedSteps(input);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

// The same build, pausable between rails.
//
// buildFindFeed measures ~91ms on desktop V8 for a real profile and roughly
// 9x that on device -- long enough that running it in one go blocks a tap or
// a keystroke outright, which is the whole complaint. Rails already run
// strictly in sequence and share only the excludedItemKeys/Names accumulator,
// so a generator expresses the pause points without restructuring any of the
// logic: local state simply survives across yields.
//
// Each yield hands back the rails completed so far, already finalized, so a
// caller can paint progressively. The caller owns scheduling and therefore
// owns the frame budget -- see FindFeed, which pumps this across frames.
//
// Yields sit at rail boundaries rather than inside rails. If one rail turns
// out to exceed a frame on its own, split that rail; do not move these.
export function* buildFindFeedSteps(
  input: BuildFeedInput
): Generator<FeedBuildStep, FeedModule[], void> {
  const now = input.now ?? new Date();
  const configByKey = resolveConfigs(input.configs);
  const feedConfig = configByKey.get('find_feed')!;
  if (!available(feedConfig, input.isEntitled)) return [];

  const restaurantById = new Map(input.restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant]));

  // Indexed only for items the user has actually interacted with.
  //
  // Every read of itemByKey is `.get(getItemIdentityKey(event.restaurantId,
  // event.itemId))` for an activity event -- a Love, a Need It, a Got It --
  // so a few dozen lookups at most. Building it across all 31,223 entries
  // meant 31k string concatenations and a 31k-entry Map to serve them, inside
  // the setup step device measurement showed as the longest remaining block
  // (~82-135ms).
  //
  // The restaurant-id check comes first deliberately: it is a plain Set hit
  // and lets the vast majority of entries skip the concatenation entirely,
  // which is the part that actually costs. Narrowing is safe because a key
  // that is never looked up cannot change an answer, and every key that IS
  // looked up is in wantedItemKeys by construction.
  const activityRestaurantIds = new Set<string>();
  const wantedItemKeys = new Set<string>();
  for (const list of [
    input.activity.lovedItems,
    input.activity.neededItems,
    input.activity.gotItHistory,
    input.activity.lovedRestaurants,
    input.activity.neededRestaurants,
  ]) {
    for (const event of list) {
      if (!event.itemId) continue;
      activityRestaurantIds.add(event.restaurantId);
      wantedItemKeys.add(getItemIdentityKey(event.restaurantId, event.itemId));
    }
  }
  const itemByKey = new Map<string, SearchIndexEntry>(
    activityRestaurantIds.size === 0
      ? []
      : input.searchIndex
        .filter((item) => activityRestaurantIds.has(item.restaurant_id))
        .map((item): [string, SearchIndexEntry] =>
          [getItemIdentityKey(item.restaurant_id, item.item_id), item]
        )
        .filter(([key]) => wantedItemKeys.has(key))
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

  // Evaluated once for the whole build instead of separately inside each
  // rail. recommendationQuality depends only on the item and
  // hasAllergyInterest, both fixed for the duration, yet nearby_for_you,
  // for_you and seasonal each re-ran it across the full index -- three
  // complete passes producing the same answer, and most of the index does not
  // survive it, so every later pass was also iterating rows already known to
  // be ineligible.
  //
  // isExcluded deliberately does NOT move here: it reads excludedItemKeys and
  // excludedItemNames, which grow as each rail claims its items, so it has to
  // stay inside the passes to keep evaluating against current state. Filter
  // is order-preserving, so downstream ordering and tie-breaks are unchanged.
  const qualityCandidates = input.searchIndex.filter(recommendationQuality);

  // Grouped for the nearby_need_it rail, which previously scanned the entire
  // index once per restaurant-level Need It -- several saved venues cost a
  // multiple of the full index.
  //
  // Built lazily because that rail is the only consumer, and it only runs with
  // a location AND at least one restaurant-level Need It. Most sessions have
  // neither, and this is an interpreted loop over ~25k entries sitting in the
  // setup step, which is exactly the shape Hermes handles worst.
  let groupedQualityByRestaurant: Map<string, SearchIndexEntry[]> | null = null;
  const qualityByRestaurant = (): Map<string, SearchIndexEntry[]> => {
    if (!groupedQualityByRestaurant) {
      const grouped = new Map<string, SearchIndexEntry[]>();
      for (const item of qualityCandidates) {
        const existing = grouped.get(item.restaurant_id);
        if (existing) existing.push(item);
        else grouped.set(item.restaurant_id, [item]);
      }
      groupedQualityByRestaurant = grouped;
    }
    return groupedQualityByRestaurant;
  };

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

  // Setup is done: taste profile, quality filter, and the grouped indexes.
  // This is the single largest step, so the pause matters most here.
  yield { label: 'setup', modules: finalizeModules(modules) };

  const nearbyConfig = configByKey.get('nearby_need_it')!;
  if (input.origin && available(nearbyConfig, input.isEntitled)) {
    const maxDistance = numberSetting(nearbyConfig, 'max_distance_miles', 5);
    const itemCandidates = input.activity.neededItems
      .map((event) => {
        const key = event.itemId ? getItemIdentityKey(event.restaurantId, event.itemId) : '';
        const item = itemByKey.get(key);
        const restaurant = restaurantById.get(event.restaurantId);
        if (!item || !restaurant) return null;
        const distance = distanceToRestaurant(input.origin, restaurant);
        if (distance === null || distance > maxDistance) return null;
        return itemRecommendation('nearby_need_it', item, restaurant, 'On your Need It list nearby', input.origin);
      })
      .filter((entry): entry is FeedItemRecommendation => entry !== null);

    // A restaurant-level Need It ("I want to go here", no specific dish
    // picked -- the header's Love/Need button) previously never surfaced
    // here at all, even standing next to the place. Represent it with its
    // best-matching quality menu item so it renders like every other card
    // in this rail. Skip restaurants that already have an item-level Need
    // It entry so the same place doesn't show twice.
    const restaurantsWithItemNeedIt = new Set(
      itemCandidates.map((entry) => entry.restaurant.restaurant_id)
    );
    const restaurantCandidates = (input.activity.neededRestaurants ?? [])
      .filter((event) => !restaurantsWithItemNeedIt.has(event.restaurantId))
      .flatMap((event) => {
        const restaurant = restaurantById.get(event.restaurantId);
        if (!restaurant) return [];
        const distance = distanceToRestaurant(input.origin, restaurant);
        if (distance === null || distance > maxDistance) return [];
        const representative = (qualityByRestaurant().get(event.restaurantId) ?? [])
          .slice()
          .sort((left, right) => candidateScore(right, restaurant) - candidateScore(left, restaurant))[0];
        if (!representative) return [];
        return [
          itemRecommendation(
            'nearby_need_it',
            representative,
            restaurant,
            'On your Need It list nearby',
            input.origin
          ),
        ];
      });

    const items = [...itemCandidates, ...restaurantCandidates]
      .sort((left, right) => (left.distanceMiles ?? Infinity) - (right.distanceMiles ?? Infinity))
      .filter((entry, index, entries) =>
        entries.findIndex((candidate) =>
          canonicalItemName(candidate.item.item) === canonicalItemName(entry.item.item)
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

  yield { label: 'nearby_need_it', modules: finalizeModules(modules) };

  const nearbyForYouConfig = configByKey.get('nearby_for_you')!;
  if (input.origin && available(nearbyForYouConfig, input.isEntitled)) {
    const maxDistance = numberSetting(nearbyForYouConfig, 'max_distance_miles', 2);
    const minScore = numberSetting(nearbyForYouConfig, 'min_score', 4);
    const mealPeriod = activeMealPeriod(now);
    // Batched for the same reason as for_you, and the same way: slices of the
    // candidate array with the native builtins kept inside each batch. This
    // rail measured ~93-107ms on device as a single block, which was the
    // longest pause in the build once for_you had been split.
    const nearbyScored: { item: SearchIndexEntry; restaurant: Restaurant; distance: number; score: number }[] = [];
    for (let start = 0; start < qualityCandidates.length; start += NEARBY_SCORING_BATCH) {
      if (start > 0) {
        yield { label: 'nearby_for_you.scoring', modules: finalizeModules(modules) };
      }
      const batchScored = qualityCandidates
        .slice(start, start + NEARBY_SCORING_BATCH)
        .filter((item) =>
          matchesMealPeriod(item, mealPeriod)
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
        });
      for (const entry of batchScored) nearbyScored.push(entry);
    }
    const ranked = nearbyScored
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

  yield { label: 'nearby_for_you', modules: finalizeModules(modules) };

  const newConfig = configByKey.get('new_bites')!;
  if (available(newConfig, input.isEntitled)) {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - numberSetting(newConfig, 'new_window_days', 30));
    const minScore = numberSetting(newConfig, 'min_score', 4);
    // Indexed only for the restaurants the change log actually mentions, not
    // for the whole catalogue. This Map exists purely to resolve change-log
    // rows back to menu items, and a 30-day window touches a small fraction of
    // venues -- yet it was built across all 31k entries, in an interpreted
    // for-of loop, on every build. It measured ~54-80ms on device.
    //
    // Restaurant ids are collected first so the pass can skip any item whose
    // venue has no recent changes, which is the overwhelming majority.
    const changedRestaurantIds = new Set<string>();
    for (const change of input.changes ?? []) {
      if (change.category === 'menu_item_added' && change.restaurant_id) {
        changedRestaurantIds.add(change.restaurant_id);
      }
    }
    const itemsByRestaurantAndName = new Map<string, SearchIndexEntry[]>();
    if (changedRestaurantIds.size > 0) {
      for (const item of input.searchIndex) {
        if (!changedRestaurantIds.has(item.restaurant_id)) continue;
        const key = `${item.restaurant_id}:${canonicalItemName(item.item)}`;
        const matches = itemsByRestaurantAndName.get(key) ?? [];
        matches.push(item);
        itemsByRestaurantAndName.set(key, matches);
      }
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

  yield { label: 'new_bites', modules: finalizeModules(modules) };

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

  yield { label: 'continue_challenge', modules: finalizeModules(modules) };

  if (available(forYouConfig, input.isEntitled)) {
    const minScore = numberSetting(forYouConfig, 'min_score', 4);
    // Batched over slices, with filter/flatMap kept inside each batch rather
    // than replaced by a hand-written loop.
    //
    // That distinction is not stylistic, it is the whole cost. An earlier
    // version of this rewrote the chain as an explicit `for` loop with
    // `continue`, which desktop V8 makes faster -- its JIT compiles the loop
    // and it allocates less. Hermes has no JIT, so an interpreted loop is much
    // slower than filter/flatMap, which are native builtins. Device
    // measurement caught it: for_you.scoring came back at ~26ms per batch,
    // ~286ms across the rail, against 22ms for the whole rail on V8. The
    // benchmark in scripts/ is useful for comparing shapes, not for choosing
    // between a builtin and a loop -- those invert between the two engines.
    const scoredCandidates: { item: SearchIndexEntry; restaurant: Restaurant; score: number; reason: string }[] = [];
    for (let start = 0; start < qualityCandidates.length; start += FOR_YOU_SCORING_BATCH) {
      if (start > 0) {
        yield { label: 'for_you.scoring', modules: finalizeModules(modules) };
      }
      // slice + native filter/flatMap: same predicates, same order, same
      // result as scoring the whole array in one chain.
      const batchScored = qualityCandidates
        .slice(start, start + FOR_YOU_SCORING_BATCH)
        .filter((item) =>
          !explicitItemKeys.has(getItemIdentityKey(item.restaurant_id, item.item_id))
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
        });
      // Appended one at a time rather than push(...spread): the spread would
      // put a whole batch on the call stack, and this loop only runs over the
      // survivors, which are a small fraction of the batch.
      for (const entry of batchScored) scoredCandidates.push(entry);
    }
    const ranked = scoredCandidates
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

  yield { label: 'for_you', modules: finalizeModules(modules) };

  const seasonalConfig = configByKey.get('seasonal')!;
  if (available(seasonalConfig, input.isEntitled)) {
    const items = qualityCandidates
      .filter((item) =>
        item.is_festival_item
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
      registerItems(items);
      modules.push({
        key: 'seasonal',
        title: 'Seasonal now',
        subtitle: 'Limited-time festival bites',
        sortOrder: seasonalConfig.sortOrder,
        items,
      });
    }
  }

  yield { label: 'seasonal', modules: finalizeModules(modules) };

  const curatedConfig = configByKey.get('curated')!;
  if (available(curatedConfig, input.isEntitled) && input.content.length > 0) {
    modules.push({
      key: 'curated',
      title: 'Worth a look',
      subtitle: 'Seasonal picks and stories selected by myRumbly',
      sortOrder: curatedConfig.sortOrder,
      items: input.content.slice(0, curatedConfig.maxItems).map((content) => ({
        kind: 'content',
        key: `content:${content.id}`,
        content,
      })),
    });
  }

  return finalizeModules(modules);
}
