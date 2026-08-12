import { assessPlanCapability } from '../../../../src/askRumbly/capabilityRegistry.ts';
import type { PlanExecutionResult, ExecutionTrace, ResultProof } from '../../../../src/askRumbly/execution.ts';
import type { QueryPlan, RestaurantFeature } from '../../../../src/askRumbly/queryPlan.ts';
import { normalizeForSearch } from '../../../../src/data/diacritics.ts';
import { ALLERGY_ACKNOWLEDGEMENT_VERSION } from '../../../../src/data/allergyPolicy.ts';
import { parkDisplayName, DISNEY_SPRINGS_AREAS, THEME_PARK_ORDER } from '../../../../src/data/locationNames.ts';
import type { MenuItem, Restaurant } from '../../../../src/data/types.ts';
import { distanceMiles, distanceToRestaurant, formatProximityDistance, type Coordinates } from '../../../../src/location/proximity.ts';
import { getStatusForDayOffset, getTodayStatus } from '../../../../src/data/hoursStatus.ts';
import { resortsShareGuestFacingFamily } from './location_aliases.ts';
import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import { answerQuery, DEFAULT_ORIGIN, type ExecutorAction, type ExecutorResult } from './executor.ts';
import { compileQueryPlan } from './plan_compiler.ts';
import { itemProvesFoodTerm, proveExecutionResult, proveGlobalObjective, restaurantProvesCuisine, type ObjectiveCandidate } from './result_proof.ts';

export type TypedPlanExecution = PlanExecutionResult<ExecutorAction>;
// Candidate gathering intentionally runs before the independent proof pass.
// Keep that intermediate state distinct from the public verified result so
// the final executeQueryPlan boundary still requires a ResultProof.
type UnprovenPlanExecution =
  | Exclude<TypedPlanExecution, { kind: 'answer' }>
  | (Omit<Extract<TypedPlanExecution, { kind: 'answer' }>, 'proof'> & { proof?: ResultProof });

const objectiveCandidatesByResult = new WeakMap<object, ObjectiveCandidate[]>();

function withObjectiveCandidates(result: UnprovenPlanExecution, candidates: ObjectiveCandidate[]): UnprovenPlanExecution {
  if (result.kind === 'answer') objectiveCandidatesByResult.set(result, candidates);
  return result;
}

const NEAR_RADIUS_MILES = { area: 0.75, park: 2, resort: 1.5 } as const;
const GENERIC_FOOD_TERMS = new Set(['food', 'meal', 'meals', 'option', 'options', 'dish', 'dishes', 'something', 'anything', 'for']);
const DISNEY_ALLERGY_URL = 'https://disneyworld.disney.go.com/guest-services/special-dietary-requests/';
const MY_DISNEY_EXPERIENCE_URL = 'https://disneyworld.disney.go.com/guest-services/my-disney-experience/mobile-apps/';

function restaurantDistance(origin: Coordinates | null, restaurant: Restaurant): number | null {
  return origin ? distanceToRestaurant(origin, restaurant) : null;
}

function diversifyRestaurants<T extends { restaurant: Restaurant }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  const remaining: T[] = [];
  for (const row of rows) {
    if (seen.has(row.restaurant.restaurant_id)) remaining.push(row);
    else {
      seen.add(row.restaurant.restaurant_id);
      first.push(row);
    }
  }
  return [...first, ...remaining];
}

function hasGenericFood(plan: QueryPlan): boolean {
  return plan.subject.foodTerms.length === 0
    || plan.subject.foodTerms.every((term) => GENERIC_FOOD_TERMS.has(normalizeForSearch(term)));
}

function mobileOrder(restaurant: Restaurant): boolean {
  return restaurant.raw_facets.some((facet) => facet.id === 'mobile-orders' || facet.name.toLowerCase().includes('mobile order'));
}

type LocationConstraint = NonNullable<QueryPlan['constraints']['location']>;

function matchesLocation(restaurant: Restaurant, location: LocationConstraint): boolean {
  const q = normalizeForSearch(location.label);
  if (location.entityType === 'park') {
    const canonicalPark = (value: string) => normalizeForSearch(value)
      .replace(/^disney'?s /, '')
      .replace(/ theme park$/, '')
      .trim();
    if (canonicalPark(parkDisplayName(restaurant.park)) === canonicalPark(parkDisplayName(location.label))) return true;
    return q === 'disney springs' && Boolean(restaurant.area && DISNEY_SPRINGS_AREAS.has(restaurant.area));
  }
  if (location.entityType === 'area') return normalizeForSearch(restaurant.area ?? '') === q;
  return normalizeForSearch(restaurant.resort ?? '') === q || Boolean(restaurant.resort && resortsShareGuestFacingFamily(restaurant.resort, location.label));
}

function centroid(restaurants: Restaurant[]): Coordinates | null {
  const located = restaurants.filter((r) => r.lat != null && r.lng != null);
  if (located.length === 0) return null;
  return {
    latitude: located.reduce((sum, r) => sum + (r.lat ?? 0), 0) / located.length,
    longitude: located.reduce((sum, r) => sum + (r.lng ?? 0), 0) / located.length,
  };
}

function hasFeature(restaurant: Restaurant, feature: RestaurantFeature): boolean {
  if (feature === 'mobile_order') return mobileOrder(restaurant);
  if (feature === 'walk_up_list') return restaurant.has_walkup_list;
  if (feature === 'reservations') return restaurant.accepts_reservations;
  if (feature === 'quick_service') return normalizeForSearch(restaurant.service_style ?? '') === 'quick service';
  if (feature === 'table_service') {
    // Disney labels only two venues "Table Service". What guests mean is
    // anything seated: A la Carte, Buffet, Prix Fixe, Family Style.
    const style = normalizeForSearch(restaurant.service_style ?? '');
    return style.length > 0 && style !== 'quick service';
  }
  if (feature === 'character_dining') return restaurant.is_character_dining;
  if (feature === 'festival_booth') return restaurant.is_festival_booth;
  if (feature === 'resort_bar') {
    const text = normalizeForSearch([restaurant.restaurant, restaurant.service_style, ...restaurant.tags].filter(Boolean).join(' '));
    return Boolean(restaurant.resort) && /\b(bar|lounge)\b/.test(text);
  }
  return false;
}

function directAllergenMatch(item: MenuItem, keys: string[]): boolean {
  if (keys.length === 0) return true;
  return item.is_allergy_friendly && keys.every((key) => key === 'allergy-friendly' || item.allergens.includes(key));
}

function dietaryMatch(item: MenuItem, keys: QueryPlan['constraints']['dietaryKeys']): boolean {
  if (keys.length === 0) return true;
  return keys.every((key) => {
    if (key === 'kids') return item.is_kids;
    if (key === 'plant-based' || key === 'vegetarian') {
      return /plant[ -]based/.test(normalizeForSearch(`${item.category} ${item.category_group}`));
    }
    return false;
  });
}

function mealPeriodMatch(item: MenuItem, periods: QueryPlan['constraints']['mealPeriods']): boolean {
  if (periods.length === 0) return true;
  const value = normalizeForSearch(item.dining_period);
  return periods.some((period) => value.includes(period));
}

function exclusionMatch(item: MenuItem, exclusions: string[]): boolean {
  if (exclusions.length === 0) return true;
  const evidence = normalizeForSearch(`${item.item} ${item.category} ${item.category_group}`);
  return exclusions.every((term) => !evidence.includes(normalizeForSearch(term)));
}

function orderableItem(item: MenuItem): boolean {
  const name = normalizeForSearch(item.item.trim());
  const category = normalizeForSearch(`${item.category} ${item.category_group} ${(item.norm_categories ?? []).join(' ')}`);
  if (/^(?:guests? must|allergen guide|allergy guide|please (?:ask|speak)|speak to (?:a )?cast member|ask (?:a )?cast member)\b/i.test(item.item.trim())) return false;
  if (/^(?:add|additional|extra|side of|choice of)\s/i.test(item.item.trim()) || /add-?on/i.test(item.item)) return false;
  if (/\b(?:toppings?|add ons?|condiments?|extras?|enhancements?)\b/.test(category)) return false;
  if (/^(?:sprinkles?|whipped cream|syrups?|hot fudge|caramel(?: sauce| topping)?|flavored syrup|flavor shots?|cold foams?|candy pieces?|non[ -]dairy|split scoop|sour cream)$/.test(name)) return false;
  if (item.price_value > 0 && item.price_value <= 2.5 && /\b(?:sauce|spread|dip|cream|foam|syrup|topping|sprinkles|scoop)\b/.test(name)) return false;
  return true;
}

function disneyCategorizesAsSnack(item: MenuItem): boolean {
  if (item.is_alcoholic) return false;
  const itemName = normalizeForSearch(item.item);
  if (/\b(?:bottled water|fountain beverage|soft drink|coke|coca[ -]cola|sprite|coffee|espresso|tea|lemonade|juice|beer|lager|ale|wine|cocktail|mocktail)\b/.test(itemName)) return false;
  const category = normalizeForSearch(`${item.category_group} ${item.category} ${(item.norm_categories ?? []).join(' ')}`);
  // A broad “snack” request should still be grounded in Disney's own menu
  // grouping. Dining-period metadata alone is too permissive: thousands of
  // drinks and full entrées are also orderable during snack hours.
  return /\b(?:snacks?|desserts?|pastries?|treats?|cookies?|ice cream|gelato|sundaes?|sorbet|pretzels?|cupcakes?|candied apples?|crisped rice cereal treats?|cake slices?|fudge|marshmallows?|cotton candy|churros?|popcorn)\b/.test(category);
}

function cloneWithoutAppliedConstraints(plan: QueryPlan, genericFood: boolean): QueryPlan {
  return {
    ...plan,
    subject: {
      ...plan.subject,
      foodTerms: genericFood ? [] : plan.subject.foodTerms,
      excludedFoodTerms: [],
    },
    constraints: {
      ...plan.constraints,
      dietaryKeys: [],
      mealPeriods: [],
      location: undefined,
      locations: undefined,
      locationMode: undefined,
      locationSet: undefined,
      requiredFeatures: [],
      excludedFeatures: [],
      serviceStyle: undefined,
      cuisine: undefined,
      maxPrice: undefined,
    },
  };
}

function acknowledgement(plan: QueryPlan) {
  return plan.constraints.allergenKeys.length > 0 ? {
    kind: 'allergy' as const,
    acknowledgementVersion: ALLERGY_ACKNOWLEDGEMENT_VERSION,
    allergenKeys: [...plan.constraints.allergenKeys],
  } : undefined;
}

function handoffActions(plan: QueryPlan, data: LoadedData): ExecutorAction[] {
  const restaurantId = plan.subject.restaurantIds[0];
  const restaurant = restaurantId
    ? data.restaurants.find((candidate) => candidate.restaurant_id === restaurantId)
    : undefined;
  if (restaurant?.disney_url) {
    return [{ kind: 'openDisney', label: `Open ${restaurant.restaurant} in Disney`, url: restaurant.disney_url }];
  }
  if (plan.constraints.allergenKeys.length > 0) {
    return [{ kind: 'openDisney', label: 'Open Disney allergy guidance', url: DISNEY_ALLERGY_URL }];
  }
  return [{ kind: 'openDisney', label: 'Open My Disney Experience', url: MY_DISNEY_EXPERIENCE_URL }];
}

function adaptLegacyNonAnswer(
  result: Exclude<ExecutorResult, { kind: 'answer' }>,
  plan: QueryPlan,
  trace?: ExecutionTrace,
  text = result.text,
): UnprovenPlanExecution {
  if (result.kind === 'no-match' || result.kind === 'error') {
    return {
      kind: result.kind,
      text,
      ...(trace ? { trace } : {}),
      safety: acknowledgement(plan),
    };
  }
  return {
    kind: result.kind,
    text,
    capability: assessPlanCapability(plan),
  };
}

/**
 * Rumbly's own collection start, derived from the data rather than configured.
 *
 * Every row imported on that first day has an unknown true age -- Rumbly
 * cannot see before its own birth -- so those rows are never "new". Once the
 * collection start falls outside the rolling window this stops mattering and
 * the window alone decides, which is how the answer sharpens as the app's
 * history lengthens.
 */
const collectionStartCache = new WeakMap<object, string>();

function collectionStart(data: LoadedData): string {
  const cached = collectionStartCache.get(data as unknown as object);
  if (cached !== undefined) return cached;
  let earliest = '';
  for (const item of data.menuItems) {
    const seen = (item.first_seen ?? '').slice(0, 10);
    if (seen && (earliest === '' || seen < earliest)) earliest = seen;
  }
  collectionStartCache.set(data as unknown as object, earliest);
  return earliest;
}

export function itemIsRecent(item: MenuItem, data: LoadedData, withinDays: number): boolean {
  const seen = (item.first_seen ?? '').slice(0, 10);
  if (!seen) return false;
  if (seen <= collectionStart(data)) return false;
  const cutoff = new Date(Date.now() - withinDays * 86400000).toISOString().slice(0, 10);
  return seen >= cutoff;
}

function nativeList(plan: QueryPlan, data: LoadedData, origin: Coordinates | null, trace: ExecutionTrace): UnprovenPlanExecution {
  const listableItems = data.menuItems.filter((item) => orderableItem(item)
    && (plan.constraints.recency == null || itemIsRecent(item, data, plan.constraints.recency.withinDays))
    && (!plan.constraints.mealPeriods.includes('snack') || disneyCategorizesAsSnack(item))
    && (plan.constraints.priceOperation === 'cheapest' || plan.constraints.maxPrice != null ? item.price_value > 0 : true));
  if (listableItems.length === 0) {
    const labelNote = plan.constraints.allergenKeys.length > 0
      ? ` that Disney lists for the requested allergy label(s)`
      : plan.constraints.dietaryKeys.some((key) => key === 'plant-based' || key === 'vegetarian')
        ? ' that Disney categorizes as Plant-Based'
        : '';
    return {
      kind: 'no-match',
      text: `I didn't find menu items${labelNote} that satisfy every requested constraint.${plan.constraints.allergenKeys.length > 0 ? " Disney's labels are informational; ask a Cast Member about your needs before ordering." : ''}`,
      trace,
      safety: acknowledgement(plan),
    };
  }
  const restaurants = new Map(data.restaurants.map((r) => [r.restaurant_id, r]));
  const sorted = listableItems
    .map((item) => ({ item, restaurant: restaurants.get(item.restaurant_id) }))
    .filter((row): row is { item: MenuItem; restaurant: Restaurant } => Boolean(row.restaurant))
    .sort((a, b) => {
      if (plan.constraints.priceOperation === 'cheapest') return a.item.price_value - b.item.price_value;
      const distanceA = restaurantDistance(origin, a.restaurant);
      const distanceB = restaurantDistance(origin, b.restaurant);
      if (distanceA != null || distanceB != null) {
        const distanceDifference = (distanceA ?? Infinity) - (distanceB ?? Infinity);
        if (distanceDifference !== 0) return distanceDifference;
      }
      const restaurantDifference = a.restaurant.restaurant.localeCompare(b.restaurant.restaurant);
      if (restaurantDifference !== 0) return restaurantDifference;
      if (plan.constraints.maxPrice != null) return a.item.price_value - b.item.price_value;
      return a.item.item.localeCompare(b.item.item);
    });
  const objectiveCandidates: ObjectiveCandidate[] = sorted.map(({ item, restaurant }) => ({
    restaurantId: restaurant.restaurant_id,
    itemKeys: [`${item.restaurant_id}:${item.item_id}`],
    score: plan.constraints.distanceOperation === 'nearest'
      ? restaurantDistance(origin, restaurant) ?? Infinity
      : item.price_value,
    evidence: plan.constraints.distanceOperation === 'nearest'
      ? `${restaurant.restaurant}=${restaurantDistance(origin, restaurant) ?? 'unknown'}mi`
      : `${item.item}=${item.price_value}`,
  }));
  const objectiveRows = plan.constraints.priceOperation === 'cheapest'
    ? sorted.filter((row) => row.item.price_value === sorted[0].item.price_value)
    : plan.constraints.distanceOperation === 'nearest'
      ? sorted.filter((row) => restaurantDistance(origin, row.restaurant) === restaurantDistance(origin, sorted[0].restaurant))
      : sorted;
  const winners = plan.constraints.priceOperation === 'cheapest' || plan.constraints.distanceOperation === 'nearest'
    ? objectiveRows
    : diversifyRestaurants(objectiveRows);
  const shown = winners.slice(0, 12);
  const allergyPrefix = plan.constraints.allergenKeys.length > 0 ? 'Disney lists these menu items for the requested allergy label(s): ' : '';
  const plantNote = plan.constraints.dietaryKeys.some((key) => key === 'plant-based' || key === 'vegetarian')
    ? ' These are the items Disney categorizes as Plant-Based; that label does not establish individual dietary or allergy suitability.'
    : '';
  const lines = shown.map(({ item, restaurant }) => `${item.item} at ${restaurant.restaurant}${item.price_value > 0 ? ` (${item.price_display})` : ''}`);
  const remaining = winners.length - shown.length;
  const result: UnprovenPlanExecution = {
    kind: 'answer',
    text: `${allergyPrefix}${plan.constraints.priceOperation === 'cheapest'
      ? `Cheapest verified menu item${winners.length === 1 ? '' : 's'} (${winners[0].item.price_display})`
      : plan.constraints.distanceOperation === 'nearest'
        ? `Nearest verified menu item${winners.length === 1 ? '' : 's'}`
        : `${sorted.length} matching menu item${sorted.length === 1 ? '' : 's'}`}: ${lines.join('; ')}${remaining > 0 ? `; and ${remaining} tied` : ''}.${plantNote}`,
    // Keep the prose compact, but preserve every verified winner for native
    // presentation. The app owns its own initial-card limit and can expand the
    // complete set without re-running or weakening the proof boundary.
    restaurantIds: Array.from(new Set(winners.map((row) => row.restaurant.restaurant_id))),
    itemIds: winners.map((row) => row.item.item_id),
    itemKeys: winners.map((row) => `${row.item.restaurant_id}:${row.item.item_id}`),
    distanceMilesByRestaurant: Object.fromEntries(
      winners.flatMap((row) => {
        const distance = restaurantDistance(origin, row.restaurant);
        return distance == null ? [] : [[row.restaurant.restaurant_id, distance]];
      }),
    ),
    trace,
    safety: acknowledgement(plan),
  };
  return plan.constraints.priceOperation === 'cheapest' || plan.constraints.distanceOperation === 'nearest'
    ? withObjectiveCandidates(result, objectiveCandidates)
    : result;
}

function nativeRestaurantList(plan: QueryPlan, data: LoadedData, origin: Coordinates | null, trace: ExecutionTrace): UnprovenPlanExecution {
  const dayOffset = plan.constraints.time === 'tomorrow' ? 1 : 0;
  let rows = data.restaurants.map((restaurant) => ({
    restaurant,
    distance: restaurantDistance(origin, restaurant),
    hours: dayOffset === 1
      ? getStatusForDayOffset(data.hoursData, restaurant.restaurant_id, dayOffset)
      : getTodayStatus(data.hoursData, restaurant.restaurant_id),
  }));
  const wantsHours = plan.action === 'hours' || plan.claimType === 'restaurant_hours';
  if (plan.constraints.time === 'now') {
    rows = rows.filter(({ hours }) => hours.kind === 'open');
  } else if (wantsHours && plan.constraints.time === 'today') {
    rows = rows.filter(({ hours }) => hours.todayLabel.startsWith('Open today'));
  }
  rows.sort((a, b) => {
    if (a.distance != null || b.distance != null) {
      const difference = (a.distance ?? Infinity) - (b.distance ?? Infinity);
      if (difference !== 0) return difference;
    }
    return a.restaurant.restaurant.localeCompare(b.restaurant.restaurant);
  });
  if (rows.length === 0) return { kind: 'no-match', text: 'No restaurants matched every requested constraint.', trace };
  if (plan.action === 'distance' && rows.every((row) => row.distance == null)) {
    return { kind: 'no-match', text: 'I do not have coordinates for that restaurant yet.', trace };
  }
  const objectiveCandidates: ObjectiveCandidate[] = rows.map(({ restaurant, distance }) => ({
    restaurantId: restaurant.restaurant_id,
    itemKeys: [],
    score: distance ?? Infinity,
    evidence: `${restaurant.restaurant}=${distance ?? 'unknown'}mi`,
  }));
  const resultRows = plan.constraints.distanceOperation === 'nearest' ? rows.slice(0, 1) : rows;
  const shown = resultRows.slice(0, 12);
  const labels = shown.map(({ restaurant, distance, hours }) => {
    const hoursLabel = plan.constraints.time === 'now'
      ? hours.label
      : plan.constraints.time === 'tomorrow'
        ? hours.todayLabel ? `Tomorrow: ${hours.todayLabel}` : ''
        : hours.todayLabel;
    const schedule = wantsHours && hoursLabel ? `: ${hoursLabel}` : '';
    return `${restaurant.restaurant}${distance == null ? '' : ` (${formatProximityDistance(distance)})`}${schedule}`;
  });
  const result: UnprovenPlanExecution = {
    kind: 'answer',
    text: plan.action === 'distance' && resultRows.length === 1 && resultRows[0].distance != null
      ? plan.constraints.distanceAnchor
        ? `${resultRows[0].restaurant.restaurant} is about ${formatProximityDistance(resultRows[0].distance).replace(/ away$/, '')} from ${plan.constraints.distanceAnchor.approximation === 'central-area' ? `central ${plan.constraints.distanceAnchor.label}` : plan.constraints.distanceAnchor.label}.`
        : `${resultRows[0].restaurant.restaurant} is about ${formatProximityDistance(resultRows[0].distance)} from your current location.`
      : `${plan.constraints.distanceOperation === 'nearest' ? 'Nearest verified restaurant' : `${rows.length} matching restaurant${rows.length === 1 ? '' : 's'}`}: ${labels.join('; ')}${plan.constraints.distanceOperation !== 'nearest' && rows.length > shown.length ? `; and ${rows.length - shown.length} more` : ''}.`,
    restaurantIds: resultRows.map(({ restaurant }) => restaurant.restaurant_id),
    distanceMilesByRestaurant: Object.fromEntries(
      resultRows.flatMap(({ restaurant, distance }) => distance == null ? [] : [[restaurant.restaurant_id, distance]]),
    ),
    trace,
  };
  return plan.constraints.distanceOperation === 'nearest' ? withObjectiveCandidates(result, objectiveCandidates) : result;
}

function nativeVerifiedFoodAnswer(
  plan: QueryPlan,
  data: LoadedData,
  origin: Coordinates | null,
  trace: ExecutionTrace,
): UnprovenPlanExecution | null {
  if (plan.subject.foodTerms.length === 0) return null;
  const restaurants = new Map(data.restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant]));
  const byRestaurant = new Map<string, MenuItem[]>();
  for (const item of data.menuItems) {
    if (!item.show_in_menu || !orderableItem(item)) continue;
    if (plan.constraints.priceOperation === 'cheapest' && item.price_value <= 0) continue;
    const list = byRestaurant.get(item.restaurant_id) ?? [];
    list.push(item);
    byRestaurant.set(item.restaurant_id, list);
  }
  const rows = data.restaurants.flatMap((restaurant) => {
    const available = byRestaurant.get(restaurant.restaurant_id) ?? [];
    const perTerm = plan.subject.foodTerms.map((term) => ({ term, items: available.filter((item) => itemProvesFoodTerm(item, term)) }));
    const satisfied = plan.subject.foodMode === 'any'
      ? perTerm.some((entry) => entry.items.length > 0)
      : perTerm.every((entry) => entry.items.length > 0);
    if (!satisfied) return [];
    const matchingTerms = perTerm.filter((entry) => entry.items.length > 0);
    const termsToSelect = plan.subject.foodMode === 'any' && plan.constraints.priceOperation === 'cheapest'
      ? [matchingTerms.reduce((best, entry) => {
          const entryPrice = Math.min(...entry.items.map((item) => item.price_value > 0 ? item.price_value : Infinity));
          const bestPrice = Math.min(...best.items.map((item) => item.price_value > 0 ? item.price_value : Infinity));
          return entryPrice < bestPrice ? entry : best;
        })]
      : matchingTerms;
    const selectedByKey = new Map<string, MenuItem>();
    termsToSelect
      .flatMap((entry) => {
        const sorted = [...entry.items].sort((a, b) => {
          if (plan.constraints.priceOperation === 'cheapest') return (a.price_value || Infinity) - (b.price_value || Infinity);
          return a.item.localeCompare(b.item);
        });
        // Objective searches need one price witness per requested term.
        // Ordinary and nearest searches retain every verified match at the
        // qualifying restaurant; the app can bound presentation without
        // silently discarding menu variants from the proven result set.
        return plan.constraints.priceOperation === 'cheapest' ? sorted.slice(0, 1) : sorted;
      })
      .forEach((item) => selectedByKey.set(`${item.restaurant_id}:${item.item_id}`, item));
    const selected = Array.from(selectedByKey.values());
    const distance = restaurantDistance(origin, restaurant);
    const objectiveScore = plan.constraints.priceOperation === 'cheapest'
      ? selected.reduce((sum, item) => sum + (item.price_value > 0 ? item.price_value : Infinity), 0)
      : plan.constraints.distanceOperation === 'nearest' || origin
        ? distance ?? Infinity
        : 0;
    return [{ restaurant, items: selected, distance, objectiveScore }];
  });
  rows.sort((a, b) => {
    const objectiveDifference = a.objectiveScore - b.objectiveScore;
    return objectiveDifference || a.restaurant.restaurant.localeCompare(b.restaurant.restaurant);
  });
  if (rows.length === 0) return null;

  let resultRows = (plan.constraints.priceOperation === 'cheapest' || plan.constraints.distanceOperation === 'nearest')
    ? rows.slice(0, 1)
    : rows;
  if (plan.constraints.locationSet === 'theme_parks'
    && plan.constraints.priceOperation !== 'cheapest'
    && plan.constraints.distanceOperation !== 'nearest') {
    const representatives = THEME_PARK_ORDER
      .map((park) => rows.find((row) => row.restaurant.park === park))
      .filter((row): row is (typeof rows)[number] => Boolean(row));
    const represented = new Set(representatives.map((row) => row.restaurant.restaurant_id));
    resultRows = [...representatives, ...rows.filter((row) => !represented.has(row.restaurant.restaurant_id))];
  }
  const shown = resultRows.slice(0, 12);
  const labels = shown.map(({ restaurant, items, distance }) => {
    const itemLabel = items.map((item) => `${item.item}${item.price_value > 0 ? ` (${item.price_display})` : ''}`).join(' + ');
    return `${restaurant.restaurant}${distance == null ? '' : ` (${formatProximityDistance(distance)})`}: ${itemLabel}`;
  });
  const requested = plan.subject.foodTerms.join(plan.subject.foodMode === 'any' ? ' or ' : ' and ');
  const prefix = plan.constraints.priceOperation === 'cheapest'
    ? `Cheapest verified match for "${requested}": `
    : plan.constraints.distanceOperation === 'nearest'
      ? `Nearest verified match for "${requested}": `
      : plan.action === 'check_menu' && resultRows.length === 1
    ? `Yes, ${resultRows[0].restaurant.restaurant} has a verified match for "${requested}": `
    : `${rows.length} verified location${rows.length === 1 ? '' : 's'} for "${requested}": `;
  const selectedItemRows = resultRows.flatMap((row) => row.items.map((item) => ({
    item,
    restaurant: row.restaurant,
  })));
  const selectedItems = (plan.constraints.priceOperation === 'cheapest' || plan.constraints.distanceOperation === 'nearest'
    ? selectedItemRows
    : diversifyRestaurants(selectedItemRows))
    .map((row) => row.item);
  const result: UnprovenPlanExecution = {
    kind: 'answer',
    text: `${prefix}${labels.join('; ')}${plan.constraints.priceOperation !== 'cheapest' && plan.constraints.distanceOperation !== 'nearest' && resultRows.length > shown.length ? `; and ${resultRows.length - shown.length} more` : ''}.`,
    restaurantIds: resultRows.map((row) => row.restaurant.restaurant_id),
    itemIds: selectedItems.map((item) => item.item_id),
    itemKeys: selectedItems.map((item) => `${item.restaurant_id}:${item.item_id}`),
    distanceMilesByRestaurant: Object.fromEntries(
      resultRows.flatMap(({ restaurant, distance }) => distance == null ? [] : [[restaurant.restaurant_id, distance]]),
    ),
    trace,
    safety: acknowledgement(plan),
  };
  if (plan.constraints.priceOperation === 'cheapest' || plan.constraints.distanceOperation === 'nearest') {
    return withObjectiveCandidates(result, rows.map((row) => ({
      restaurantId: row.restaurant.restaurant_id,
      itemKeys: row.items.map((item) => `${item.restaurant_id}:${item.item_id}`),
      score: row.objectiveScore,
      evidence: plan.constraints.priceOperation === 'cheapest'
        ? `${row.items.map((item) => item.item).join(' + ')}=${row.objectiveScore}`
        : `${row.restaurant.restaurant}=${row.objectiveScore}mi`,
    })));
  }
  return result;
}

function executeQueryPlanUnproven(plan: QueryPlan, source: LoadedData, userOrigin: Coordinates | null = DEFAULT_ORIGIN): UnprovenPlanExecution {
  const capability = assessPlanCapability(plan);
  if (capability.disposition !== 'execute') {
    const kind = capability.disposition === 'clarify' ? 'clarification' : capability.disposition;
    return {
      kind,
      text: capability.reason,
      capability,
      ...(kind === 'handoff' ? { actions: handoffActions(plan, source) } : {}),
    };
  }

  const applied: string[] = [];
  const genericFood = hasGenericFood(plan);
  const namedDistanceAnchor = plan.constraints.distanceAnchor;
  let origin = namedDistanceAnchor
    ? { latitude: namedDistanceAnchor.latitude, longitude: namedDistanceAnchor.longitude }
    : userOrigin;
  let restaurants = source.restaurants;
  if (plan.constraints.locationSet === 'theme_parks') {
    const themeParks = new Set<string>(THEME_PARK_ORDER);
    restaurants = restaurants.filter((restaurant) => restaurant.park != null && themeParks.has(restaurant.park));
    applied.push('location:set:theme-parks');
  }
  if (namedDistanceAnchor) applied.push(`distance-anchor:${namedDistanceAnchor.entityId}`);
  if (namedDistanceAnchor) {
    restaurants = restaurants.filter((restaurant) => restaurant.lat != null && restaurant.lng != null);
    applied.push('distance-coordinate-available');
  }
  if (namedDistanceAnchor && plan.constraints.distanceRadiusMiles != null) {
    const radius = plan.constraints.distanceRadiusMiles;
    restaurants = restaurants.filter((restaurant) => restaurant.lat != null && restaurant.lng != null
      && distanceMiles(
        { latitude: namedDistanceAnchor.latitude, longitude: namedDistanceAnchor.longitude },
        { latitude: restaurant.lat, longitude: restaurant.lng },
      ) <= radius);
    applied.push(`distance-radius:${radius}mi`);
  }
  if (plan.subject.restaurantIds.length > 0) {
    const ids = new Set(plan.subject.restaurantIds);
    restaurants = restaurants.filter((restaurant) => ids.has(restaurant.restaurant_id));
    applied.push('restaurant');
  }
  const rawLocations = plan.constraints.locations?.length
    ? plan.constraints.locations
    : plan.constraints.location ? [plan.constraints.location] : [];
  // Defensive compatibility for plans created before named area anchors were
  // separated from location scopes in the parser.
  const locations = rawLocations.filter((location) => location.entityId !== namedDistanceAnchor?.entityId);
  if (locations.length > 0 && plan.subject.restaurantIds.length === 0) {
    const accepted = new Set<string>();
    const approximations: string[] = [];
    for (const location of locations) {
      const inside = source.restaurants.filter((restaurant) => matchesLocation(restaurant, location));
      if (location.relation === 'in') {
        inside.forEach((restaurant) => accepted.add(restaurant.restaurant_id));
        applied.push('location:in');
      } else {
        const anchor = centroid(inside);
        if (!anchor) continue;
        const radius = NEAR_RADIUS_MILES[location.entityType];
        source.restaurants.forEach((restaurant) => {
          if (restaurant.lat == null || restaurant.lng == null) return;
          if (distanceMiles(anchor, { latitude: restaurant.lat, longitude: restaurant.lng }) <= radius) accepted.add(restaurant.restaurant_id);
        });
        if (locations.length === 1 && !namedDistanceAnchor) origin = anchor;
        approximations.push(`${location.label} dining-location centroid`);
        applied.push(`location:near:${radius}mi`);
      }
    }
    restaurants = restaurants.filter((restaurant) => accepted.has(restaurant.restaurant_id));
    if (approximations.length > 0) applied.push(`location-approximation:${approximations.join('|')}`);
  }
  if (plan.constraints.time === 'now') {
    restaurants = restaurants.filter((restaurant) => getTodayStatus(source.hoursData, restaurant.restaurant_id).kind === 'open');
    applied.push('time:open-now');
  }
  if (plan.constraints.requiredFeatures.length > 0 && plan.action !== 'check_feature') {
    restaurants = restaurants.filter((restaurant) => plan.constraints.requiredFeatures.every((feature) => hasFeature(restaurant, feature)));
    applied.push(...plan.constraints.requiredFeatures.map((feature) => `feature:${feature}`));
  }
  if (plan.constraints.excludedFeatures.length > 0) {
    restaurants = restaurants.filter((restaurant) => plan.constraints.excludedFeatures.every((feature) => !hasFeature(restaurant, feature)));
    applied.push(...plan.constraints.excludedFeatures.map((feature) => `excluded-feature:${feature}`));
  }
  if (plan.constraints.serviceStyle) {
    const style = normalizeForSearch(plan.constraints.serviceStyle);
    restaurants = restaurants.filter((r) => normalizeForSearch(r.service_style ?? '') === style);
    applied.push('service-style');
  }
  if (plan.constraints.cuisine) {
    restaurants = restaurants.filter((restaurant) => Boolean(restaurantProvesCuisine(restaurant, plan.constraints.cuisine ?? '')));
    applied.push('cuisine');
  }
  // With no specific dish to match, a meal period is a restaurant-level
  // eligibility constraint. This avoids answering “character breakfast”
  // with hundreds of individual beverages and sides.
  if (genericFood && plan.constraints.mealPeriods.length > 0) {
    restaurants = restaurants.filter((restaurant) => plan.constraints.mealPeriods.some((period) =>
      restaurant.meal_periods.some((value) => normalizeForSearch(value).includes(period))));
    applied.push('restaurant-meal-period');
  }

  const restaurantIds = new Set(restaurants.map((r) => r.restaurant_id));
  // Disney allergy rows are intentionally hidden from ordinary browsing,
  // so an allergy query must begin from all rows and then fail closed on
  // the direct label. Ordinary searches retain show_in_menu behavior.
  let menuItems = source.menuItems.filter((item) => restaurantIds.has(item.restaurant_id)
    && (plan.constraints.allergenKeys.length > 0 || item.show_in_menu));
  if (plan.constraints.maxPrice != null) {
    menuItems = menuItems.filter((item) => item.price_value > 0 && item.price_value <= (plan.constraints.maxPrice ?? 0));
    applied.push('maximum-price');
  }
  if (plan.subject.excludedFoodTerms.length > 0) {
    menuItems = menuItems.filter((item) => exclusionMatch(item, plan.subject.excludedFoodTerms));
    applied.push('food-exclusions');
  }
  if (plan.constraints.mealPeriods.length > 0) {
    const effectivePeriods = plan.subject.foodTerms.length > 0
      ? plan.constraints.mealPeriods.filter((period) => period !== 'snack')
      : plan.constraints.mealPeriods;
    if (effectivePeriods.length > 0) {
      menuItems = menuItems.filter((item) => mealPeriodMatch(item, effectivePeriods));
      applied.push('meal-period');
    }
  }
  if (plan.constraints.dietaryKeys.length > 0) {
    menuItems = menuItems.filter((item) => dietaryMatch(item, plan.constraints.dietaryKeys));
    applied.push('dietary-label');
  }
  if (plan.constraints.allergenKeys.length > 0) {
    menuItems = menuItems.filter((item) => directAllergenMatch(item, plan.constraints.allergenKeys));
    applied.push('disney-allergen-label');
  }
  if (plan.constraints.recency != null) {
    const { withinDays } = plan.constraints.recency;
    menuItems = menuItems.filter((item) => itemIsRecent(item, source, withinDays));
    applied.push(`first-seen-within:${withinDays}d`);
  }
  if (genericFood && plan.subject.foodTerms.some((term) => /^meals?$/.test(normalizeForSearch(term)))) {
    menuItems = menuItems.filter((item) => /entr[ée]e|entr-es|kids-meals/.test(normalizeForSearch(`${item.category} ${item.category_group}`)));
    applied.push('generic-meal-as-entree');
  }

  const menuKeys = new Set(menuItems.map((item) => `${item.restaurant_id}:${item.item_id}`));
  const exposeFilteredAllergyRows = plan.constraints.allergenKeys.length > 0;
  const executionMenuItems = exposeFilteredAllergyRows
    ? menuItems.map((item) => ({ ...item, show_in_menu: true }))
    : menuItems;
  const data: LoadedData = {
    restaurants,
    menuItems: executionMenuItems,
    searchIndex: source.searchIndex
      .filter((item) => menuKeys.has(`${item.restaurant_id}:${item.item_id}`))
      .map((item) => exposeFilteredAllergyRows ? { ...item, show_in_menu: true } : item),
    hoursData: source.hoursData,
  };
  const trace: ExecutionTrace = {
    appliedConstraints: applied,
    candidateRestaurants: restaurants.length,
    candidateItems: menuItems.length,
    ...(namedDistanceAnchor
      ? { locationApproximation: namedDistanceAnchor.approximation === 'central-area'
        ? `Direct distance from central ${namedDistanceAnchor.label}.`
        : `Direct distance from the representative point for ${namedDistanceAnchor.label}.` }
      : locations.some((location) => location.relation === 'near')
      ? { locationApproximation: `Direct distance from ${locations.filter((location) => location.relation === 'near').map((location) => `the dining-location centroid for ${location.label}`).join(' or ')}.` }
      : {}),
  };
  if (restaurants.length === 0) return { kind: 'no-match', text: 'No restaurants matched every requested constraint.', trace };

  if (plan.action === 'open_menu') {
    if (restaurants.length !== 1) {
      return { kind: 'no-match', text: 'A single restaurant is required before opening its menu.', trace };
    }
    const restaurant = restaurants[0];
    return {
      kind: 'answer',
      text: `I can open ${restaurant.restaurant}'s full menu in Rumbly.`,
      restaurantIds: [restaurant.restaurant_id],
      actions: [{ kind: 'openRestaurant', label: `View ${restaurant.restaurant} menu`, restaurantId: restaurant.restaurant_id }],
      trace,
      safety: acknowledgement(plan),
    };
  }

  if (plan.action === 'check_feature') {
    const compilation = compileQueryPlan(plan);
    if (compilation.kind !== 'compiled') return { kind: 'error', text: `Execution adapter could not preserve this feature check: ${compilation.reason}`, trace };
    const result = answerQuery(compilation.query, source, userOrigin ?? DEFAULT_ORIGIN);
    if (result.kind === 'answer') return { ...result, trace };
    return adaptLegacyNonAnswer(result, plan, trace);
  }

  if (plan.action === 'compare' && genericFood && restaurants.length > 1) {
    return {
      kind: 'answer',
      text: `I can open these restaurant pages so you can compare their current menus: ${restaurants.map((restaurant) => restaurant.restaurant).join('; ')}.`,
      restaurantIds: restaurants.map((restaurant) => restaurant.restaurant_id),
      actions: restaurants.map((restaurant) => ({ kind: 'openRestaurant' as const, label: `View ${restaurant.restaurant}`, restaurantId: restaurant.restaurant_id })),
      trace,
    };
  }

  const itemConstrained = plan.constraints.maxPrice != null
    || plan.constraints.priceOperation === 'cheapest'
    || plan.constraints.allergenKeys.length > 0
    || plan.constraints.dietaryKeys.length > 0
    || plan.constraints.mealPeriods.length > 0
    // "What's new" is a question about rows, not venues. Without this the
    // answer is every restaurant in the park rather than the new items.
    || plan.constraints.recency != null;
  const restaurantListing = plan.action === 'hours'
    || plan.action === 'distance'
    || plan.claimType === 'restaurant_hours'
    || (genericFood && plan.constraints.distanceOperation === 'nearest' && !itemConstrained)
    || (genericFood && Boolean(namedDistanceAnchor) && !itemConstrained)
    || (genericFood && locations.length > 0 && !itemConstrained)
    || (genericFood && Boolean(plan.constraints.cuisine))
    || (plan.constraints.requiredFeatures.length > 0 && !itemConstrained);
  if (genericFood && restaurantListing) {
    return nativeRestaurantList(plan, data, origin, trace);
  }
  if (genericFood && itemConstrained) return nativeList(plan, data, origin, trace);

  const verifiedFoodAnswer = nativeVerifiedFoodAnswer(plan, data, origin, trace);
  if (verifiedFoodAnswer) return verifiedFoodAnswer;

  if (plan.action === 'check_menu' && restaurants.length === 1 && plan.subject.foodTerms.length > 0) {
    const restaurant = restaurants[0];
    const requested = plan.subject.foodTerms.join(plan.subject.foodMode === 'any' ? ' or ' : ' and ');
    return {
      kind: 'no-match',
      text: plan.constraints.allergenKeys.length > 0
        ? `No verified match: Rumbly's current menu data for ${restaurant.restaurant} does not contain "${requested}" that Disney lists for the requested allergy label(s). Disney's labels are informational; ask a Cast Member about your needs before ordering.`
        : `No verified match: Rumbly's current menu data for ${restaurant.restaurant} does not list "${requested}".`,
      trace,
      safety: acknowledgement(plan),
    };
  }

  if (plan.constraints.allergenKeys.length > 0 && menuItems.length === 0) {
    return {
      kind: 'no-match',
      text: `I didn't find a matching menu item that Disney lists for the requested allergy label(s). Disney's labels are informational; ask a Cast Member about your needs before ordering.`,
      trace,
      safety: acknowledgement(plan),
    };
  }

  const executablePlan = cloneWithoutAppliedConstraints(plan, genericFood);
  if (exposeFilteredAllergyRows) executablePlan.constraints.allergenKeys = [];
  const compilation = compileQueryPlan(executablePlan);
  if (compilation.kind !== 'compiled') return { kind: 'error', text: `Execution adapter could not preserve this plan: ${compilation.reason}`, trace };
  const result = answerQuery(compilation.query, data, origin ?? DEFAULT_ORIGIN);
  if (result.kind !== 'answer') {
    const text = exposeFilteredAllergyRows
      ? `${result.text} This search used only menu rows Disney lists for the requested allergy label(s). Disney's labels are informational; ask a Cast Member about your needs before ordering.`
      : result.text;
    return adaptLegacyNonAnswer(result, plan, trace, text);
  }
  const text = exposeFilteredAllergyRows
    ? `Using only menu rows Disney lists for the requested allergy label(s): ${result.text} Disney's labels are informational; ask a Cast Member about your needs before ordering.`
    : result.text;
  return { ...result, text, trace, safety: acknowledgement(plan) ?? result.safety };
}

function derivedItemKeys(result: Extract<UnprovenPlanExecution, { kind: 'answer' }>, source: LoadedData): string[] | undefined {
  if (result.itemKeys?.length) return result.itemKeys;
  if (!result.itemIds?.length || !result.restaurantIds?.length) return undefined;
  const itemIds = new Set(result.itemIds);
  const restaurantIds = new Set(result.restaurantIds);
  return source.menuItems
    .filter((item) => restaurantIds.has(item.restaurant_id) && itemIds.has(item.item_id))
    .map((item) => `${item.restaurant_id}:${item.item_id}`);
}

/**
 * Executes the typed plan and then independently proves the returned rows.
 * This is the final fail-closed boundary: ranking may propose a candidate,
 * but it cannot become a guest-facing answer unless the actual returned
 * restaurant/menu rows witness every food term and explicit global scope.
 */
export function executeQueryPlan(plan: QueryPlan, source: LoadedData, userOrigin: Coordinates | null = DEFAULT_ORIGIN): TypedPlanExecution {
  const result = executeQueryPlanUnproven(plan, source, userOrigin);
  if (result.kind !== 'answer') return result;
  const itemKeys = derivedItemKeys(result, source);
  const proof = proveExecutionResult(plan, source, { ...result, itemKeys });
  const objectiveProof = proveGlobalObjective(plan, { ...result, itemKeys }, objectiveCandidatesByResult.get(result));
  proof.witnesses.push(...objectiveProof.witnesses);
  proof.failures.push(...objectiveProof.failures);
  if (objectiveProof.status === 'failed') proof.status = 'failed';
  if (proof.status === 'failed') {
    const missing = proof.failures.join('; ');
    return {
      kind: 'no-match',
      text: `I found a partial match, but couldn't verify every requested detail, so I won't present it as an answer.${missing ? ` Missing proof: ${missing}.` : ''}`,
      trace: result.trace,
      safety: result.safety,
    };
  }
  return { ...result, itemKeys, proof };
}
