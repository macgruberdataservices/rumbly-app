import type { ConstraintWitness, ResultProof } from '../../../../src/askRumbly/execution.ts';
import type { QueryPlan } from '../../../../src/askRumbly/queryPlan.ts';
import { normalizeForSearch } from '../../../../src/data/diacritics.ts';
import { getStatusForDayOffset, getTodayStatus } from '../../../../src/data/hoursStatus.ts';
import { DISNEY_SPRINGS_AREAS, parkDisplayName, THEME_PARK_ORDER } from '../../../../src/data/locationNames.ts';
import type { MenuItem, Restaurant } from '../../../../src/data/types.ts';
import { distanceMiles, type Coordinates } from '../../../../src/location/proximity.ts';
import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import { resortsShareGuestFacingFamily } from './location_aliases.ts';
import { distanceAnchorById } from '../../../../src/askRumbly/distanceAnchors.ts';
import { CLASS_TERM_CATEGORIES, FOOD_TERM_ALTERNATIVES } from '../../../../src/askRumbly/foodSynonyms.ts';
import { itemIsRecent } from '../../../../src/askRumbly/recency.ts';

export interface ProofTarget {
  restaurantIds?: string[];
  itemIds?: string[];
  itemKeys?: string[];
  distanceMilesByRestaurant?: Record<string, number>;
}

export interface ObjectiveCandidate {
  restaurantId: string;
  itemKeys: string[];
  score: number;
  evidence: string;
}

const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'at', 'available', 'for', 'from', 'get', 'in', 'of', 'on', 'or',
  'serve', 'served', 'serves', 'style', 'that', 'the', 'to', 'topped', 'with',
]);
const GENERIC_FOOD_TERMS = new Set(['food', 'meal', 'meals', 'option', 'options', 'dish', 'dishes', 'something', 'anything', 'for']);
// Pavilions sit about 100m apart along the World Showcase promenade, so an
// area-sized radius around Japan would sweep in most of the lagoon.
const NEAR_RADIUS_MILES = { area: 0.75, park: 2, resort: 1.5, pavilion: 0.15 } as const;
const CUISINE_NAME_EVIDENCE: Record<string, RegExp> = {
  bbq: /\b(?:bbq|barbecue|smokehouse)\b/,
  barbecue: /\b(?:bbq|barbecue|smokehouse)\b/,
};


function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (token === 'fries') return 'fry';
  if (/(?:ch|sh|s|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeForSearch(value)
    .replace(/soft[ -]serve/g, 'softserve')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularize));
}

function termAlternatives(term: string): string[][] {
  const normalized = normalizeForSearch(term).trim();
  const known = FOOD_TERM_ALTERNATIVES[normalized];
  if (known) return known.map((alternative) => alternative.map(singularize));
  const required = normalized
    .replace(/soft[ -]serve/g, 'softserve')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !FUNCTION_WORDS.has(token))
    .map(singularize);
  return required.length > 0 ? [required] : [];
}


export function itemProvesFoodTerm(item: MenuItem, term: string): boolean {
  const normalizedTerm = normalizeForSearch(term).trim();
  const classCategories = CLASS_TERM_CATEGORIES[normalizedTerm];
  if (classCategories) {
    const published = (item.norm_categories ?? []).map((value) => normalizeForSearch(value));
    if (classCategories.some((category) => published.includes(category))) return true;
  }
  if (/^chilis?$/.test(normalizedTerm)) {
    // “Chili” as a guest food request means the dish, not every item with a
    // chili rub, chili-lime seasoning, chili crisp, or chili sauce.
    const itemName = normalizeForSearch(item.item).trim();
    return /^(?:(?:a\s+)?(?:bowl|cup)\s+of\s+|1871\s+|plant[ -]based\s+)?chili(?:$|[ -](?:cheese|dog)\b)/.test(itemName);
  }
  if (/^(?:coke|coca cola)$/.test(normalizedTerm)) {
    const itemName = normalizeForSearch(item.item);
    return !item.is_alcoholic && /\b(?:coke|coca cola)\b/.test(itemName);
  }
  if (normalizedTerm === 'french fries') {
    const itemEvidence = normalizeForSearch(`${item.item} ${item.category} ${item.category_group}`);
    // The singular word "fry" also appears in unrelated dishes such as
    // "Stir Fry". French-fries evidence must name the fries preparation (or
    // explicitly say French Fry), not merely contain that generic token.
    if (!/\b(?:fries|french\s+fr(?:y|ies))\b/.test(itemEvidence)) return false;
    if (/\b(?:hummus|yucca|yuca|pickle|zucchini|avocado|polenta|plantain|green bean|asparagus)\b[\s\S]*\b(?:fries|fry)\b/.test(itemEvidence)) return false;
    // "Home fries" are breakfast potatoes, not French fries. Keep the
    // singular `fry` synonym for real rows such as "French Fry Basket", but
    // reject this distinct named preparation before token matching.
    if (/\bhome\s+fr(?:y|ies)\b/.test(itemEvidence)) return false;
  }
  if (/^beers?$/.test(normalizedTerm)) {
    const nameAndCategory = normalizeForSearch(`${item.item} ${item.category} ${item.category_group} ${(item.norm_categories ?? []).join(' ')}`);
    const category = normalizeForSearch(`${item.category} ${item.category_group} ${(item.norm_categories ?? []).join(' ')}`);
    const alcoholicBeerRole = /\b(?:beer|beers|cider|drafts?|alcoholic)\b/.test(category);
    return alcoholicBeerRole && /\bbeer\b/.test(nameAndCategory) && !/\b(?:ginger|root) beer\b/.test(normalizeForSearch(item.item));
  }
  if (/^(?:corn\s+dog|corndog)s?$/.test(normalizedTerm)) {
    // A corn dog is a named preparation. Requiring the adjacent phrase keeps
    // unrelated rows such as "street corn ... hot dog" from being treated as
    // corn dogs merely because both words occur somewhere in the row.
    const itemName = normalizeForSearch(item.item);
    if (/\bcorn\s+dogs?\b|\bcorndogs?\b/.test(itemName)) return true;
    const category = normalizeForSearch(`${item.category} ${item.category_group}`);
    return /\bcorn\s+dogs?\b|\bcorndogs?\b/.test(category) && /\bdogs?\b/.test(itemName);
  }
  const alternatives = termAlternatives(term);
  const nameTokens = tokens(item.item);
  if (alternatives.some((alternative) => alternative.every((token) => nameTokens.has(token)))) return true;

  // A single, specific Disney menu category can complete an abbreviated item
  // name (for example item "Burrata" under category "Wood-fired Pizza").
  // Mixed categories such as "Breakfast Sandwiches & Burgers" cannot prove
  // which side an individual row belongs to and are therefore excluded.
  const categorySegments = item.category
    .split(/[&/,]|\s+and\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (categorySegments.length !== 1) return false;
  const boundedTokens = tokens(`${item.item} ${categorySegments[0]}`);
  return alternatives.some((alternative) => alternative.every((token) => boundedTokens.has(token)));
}

export function restaurantProvesCuisine(restaurant: Restaurant, cuisine: string): string | null {
  const normalizedCuisine = normalizeForSearch(cuisine);
  const tag = restaurant.cuisine_tags.find((value) => normalizeForSearch(value) === normalizedCuisine);
  if (tag) return tag;
  // Cuisine tags are intentionally coarse in the current Disney snapshot.
  // A narrow canonical-name witness recovers venues whose defining cuisine is
  // explicit in Disney's restaurant name but absent from the tag list.
  return CUISINE_NAME_EVIDENCE[normalizedCuisine]?.test(normalizeForSearch(restaurant.restaurant))
    ? restaurant.restaurant
    : null;
}

function itemConstraintFailureCount(plan: QueryPlan, item: MenuItem): number {
  let failures = 0;
  if (plan.constraints.maxPrice != null && !(item.price_value > 0 && item.price_value <= plan.constraints.maxPrice)) failures += 1;
  failures += plan.constraints.allergenKeys.filter((allergen) =>
    !(item.is_allergy_friendly && (allergen === 'allergy-friendly' || item.allergens.includes(allergen)))).length;
  failures += plan.constraints.dietaryKeys.filter((dietary) => dietary === 'kids'
    ? !item.is_kids
    : (dietary === 'plant-based' || dietary === 'vegetarian')
      ? !/plant[ -]based/.test(normalizeForSearch(`${item.category} ${item.category_group}`))
      : true).length;
  const effectivePeriods = plan.subject.foodTerms.length > 0
    ? plan.constraints.mealPeriods.filter((period) => period !== 'snack')
    : plan.constraints.mealPeriods;
  if (effectivePeriods.length > 0 && !effectivePeriods.some((period) => normalizeForSearch(item.dining_period).includes(period))) failures += 1;
  return failures;
}

function targetItems(plan: QueryPlan, target: ProofTarget, data: LoadedData, restaurantId: string): MenuItem[] {
  const exactKeys = new Set(target.itemKeys ?? []);
  const itemIds = new Set(target.itemIds ?? []);
  const hasItemReferences = exactKeys.size > 0 || itemIds.size > 0;
  if (!hasItemReferences) return [];
  const candidates = data.menuItems.filter((item) => item.restaurant_id === restaurantId && (exactKeys.size > 0
    ? exactKeys.has(`${item.restaurant_id}:${item.item_id}`)
    : itemIds.has(item.item_id)));
  const byKey = new Map<string, MenuItem[]>();
  for (const item of candidates) {
    const key = `${item.restaurant_id}:${item.item_id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  return Array.from(byKey.values()).map((versions) => [...versions]
    .sort((a, b) => itemConstraintFailureCount(plan, a) - itemConstraintFailureCount(plan, b))[0]);
}

type LocationConstraint = NonNullable<QueryPlan['constraints']['location']>;

function matchesLocation(restaurant: Restaurant, location: LocationConstraint): boolean {
  const q = normalizeForSearch(location.label);
  if (location.entityType === 'park') {
    const canonical = (value: string) => normalizeForSearch(value).replace(/^disney'?s /, '').replace(/ theme park$/, '').trim();
    return canonical(parkDisplayName(restaurant.park)) === canonical(parkDisplayName(location.label))
      || (q === 'disney springs' && Boolean(restaurant.area && DISNEY_SPRINGS_AREAS.has(restaurant.area)));
  }
  if (location.entityType === 'area') return normalizeForSearch(restaurant.area ?? '') === q;
  if (location.entityType === 'pavilion') {
    // Absent and null both mean "pavilion unknown", never "not in World
    // Showcase", so an unmapped venue must not match anything -- including an
    // empty query label.
    const pavilion = normalizeForSearch(restaurant.world_showcase_pavilion ?? '');
    return pavilion.length > 0 && q.length > 0 && pavilion === q;
  }
  return normalizeForSearch(restaurant.resort ?? '') === q
    || Boolean(restaurant.resort && resortsShareGuestFacingFamily(restaurant.resort, location.label));
}

function centroid(restaurants: Restaurant[]): Coordinates | null {
  const located = restaurants.filter((restaurant) => restaurant.lat != null && restaurant.lng != null);
  if (located.length === 0) return null;
  return {
    latitude: located.reduce((sum, restaurant) => sum + (restaurant.lat ?? 0), 0) / located.length,
    longitude: located.reduce((sum, restaurant) => sum + (restaurant.lng ?? 0), 0) / located.length,
  };
}

function featureEvidence(restaurant: Restaurant, feature: QueryPlan['constraints']['requiredFeatures'][number]): string | null {
  if (feature === 'mobile_order') return restaurant.raw_facets.some((facet) => facet.id === 'mobile-orders' || /mobile order/i.test(facet.name)) ? 'mobile-orders facet' : null;
  if (feature === 'walk_up_list') return restaurant.has_walkup_list ? 'has_walkup_list' : null;
  if (feature === 'reservations') return restaurant.accepts_reservations ? 'accepts_reservations' : null;
  if (feature === 'quick_service') return normalizeForSearch(restaurant.service_style ?? '') === 'quick service' ? restaurant.service_style ?? 'Quick Service' : null;
  if (feature === 'table_service') {
    const style = normalizeForSearch(restaurant.service_style ?? '');
    return style.length > 0 && style !== 'quick service' ? restaurant.service_style ?? '' : null;
  }
  if (feature === 'character_dining') return restaurant.is_character_dining ? 'is_character_dining' : null;
  if (feature === 'festival_booth') return restaurant.is_festival_booth ? 'is_festival_booth' : null;
  if (feature === 'resort_bar') {
    const text = normalizeForSearch([restaurant.restaurant, restaurant.service_style, ...restaurant.tags].filter(Boolean).join(' '));
    return restaurant.resort && /\b(bar|lounge)\b/.test(text) ? `${restaurant.resort}; bar/lounge` : null;
  }
  return null;
}

function proveItemConstraints(plan: QueryPlan, item: MenuItem, witnesses: ConstraintWitness[], failures: string[]): void {
  const key = `${item.restaurant_id}:${item.item_id}`;
  const evidence = normalizeForSearch(`${item.item} ${item.category} ${item.category_group}`);
  if (plan.constraints.maxPrice != null) {
    if (item.price_value > 0 && item.price_value <= plan.constraints.maxPrice) witnesses.push({ constraint: 'maximum-price', itemKey: key, evidence: [item.price_display] });
    else failures.push(`${item.item} does not prove a price at or below $${plan.constraints.maxPrice}`);
  }
  for (const excluded of plan.subject.excludedFoodTerms) {
    if (!evidence.includes(normalizeForSearch(excluded))) witnesses.push({ constraint: `excluded-food:${excluded}`, itemKey: key, evidence: [item.item] });
    else failures.push(`${item.item} contains excluded food: ${excluded}`);
  }
  for (const allergen of plan.constraints.allergenKeys) {
    if (item.is_allergy_friendly && (allergen === 'allergy-friendly' || item.allergens.includes(allergen))) {
      witnesses.push({ constraint: `disney-allergen:${allergen}`, itemKey: key, evidence: ['is_allergy_friendly', ...item.allergens] });
    } else failures.push(`${item.item} lacks Disney's direct ${allergen} allergy flag`);
  }
  for (const dietary of plan.constraints.dietaryKeys) {
    const proven = dietary === 'kids'
      ? item.is_kids
      : (dietary === 'plant-based' || dietary === 'vegetarian')
        ? /plant[ -]based/.test(normalizeForSearch(`${item.category} ${item.category_group}`))
        : false;
    if (proven) witnesses.push({ constraint: `dietary:${dietary}`, itemKey: key, evidence: [item.category, item.category_group] });
    else failures.push(`${item.item} lacks Disney's ${dietary} row/category evidence`);
  }
  const effectivePeriods = plan.subject.foodTerms.length > 0
    ? plan.constraints.mealPeriods.filter((period) => period !== 'snack')
    : plan.constraints.mealPeriods;
  if (effectivePeriods.length > 0) {
    if (effectivePeriods.some((period) => normalizeForSearch(item.dining_period).includes(period))) {
      witnesses.push({ constraint: 'meal-period', itemKey: key, evidence: [item.dining_period] });
    } else failures.push(`${item.item} lacks the requested meal-period evidence`);
  }
}

function proveRecency(plan: QueryPlan, item: MenuItem, data: LoadedData, witnesses: ConstraintWitness[], failures: string[]): void {
  if (plan.constraints.recency == null) return;
  const key = `${item.restaurant_id}:${item.item_id}`;
  if (itemIsRecent(item, data, plan.constraints.recency.withinDays)) {
    witnesses.push({
      constraint: `first-seen-within:${plan.constraints.recency.withinDays}d`,
      itemKey: key,
      evidence: [`first_seen=${(item.first_seen ?? '').slice(0, 10)}`],
    });
  } else failures.push(`${item.item} was not first seen inside the requested window`);
}

function restaurantProof(
  plan: QueryPlan,
  restaurant: Restaurant,
  items: MenuItem[],
  data: LoadedData,
  reportedDistance?: number,
): { witnesses: ConstraintWitness[]; failures: string[] } {
  const witnesses: ConstraintWitness[] = [];
  const failures: string[] = [];
  if (plan.constraints.distanceAnchor) {
    const planned = plan.constraints.distanceAnchor;
    const trusted = distanceAnchorById(planned.entityId);
    if (!trusted
      || trusted.entityType !== planned.entityType
      || trusted.label !== planned.label
      || Math.abs(trusted.latitude - planned.latitude) > 0.0000001
      || Math.abs(trusted.longitude - planned.longitude) > 0.0000001) {
      failures.push(`The named distance origin could not be verified: ${planned.label}`);
    } else if (restaurant.lat == null || restaurant.lng == null || reportedDistance == null) {
      failures.push(`${restaurant.restaurant} lacks a complete named-origin distance witness`);
    } else {
      const expected = distanceMiles(
        { latitude: trusted.latitude, longitude: trusted.longitude },
        { latitude: restaurant.lat, longitude: restaurant.lng },
      );
      if (Math.abs(expected - reportedDistance) <= 0.000001) {
        witnesses.push({
          constraint: `distance-anchor:${planned.entityId}`,
          restaurantId: restaurant.restaurant_id,
          evidence: [planned.label, planned.approximation, `${reportedDistance}mi`],
        });
        if (plan.constraints.distanceRadiusMiles != null) {
          if (reportedDistance <= plan.constraints.distanceRadiusMiles) {
            witnesses.push({
              constraint: `distance-radius:${plan.constraints.distanceRadiusMiles}mi`,
              restaurantId: restaurant.restaurant_id,
              evidence: [`${reportedDistance}mi`],
            });
          } else failures.push(`${restaurant.restaurant} is outside the requested nearby radius`);
        }
      } else failures.push(`${restaurant.restaurant}'s distance was not calculated from ${planned.label}`);
    }
  }
  if (plan.constraints.locationSet === 'theme_parks') {
    if (restaurant.park && THEME_PARK_ORDER.includes(restaurant.park)) {
      witnesses.push({ constraint: 'location:set:theme-parks', restaurantId: restaurant.restaurant_id, evidence: [restaurant.park] });
    } else failures.push(`${restaurant.restaurant} is not inside one of the four theme parks`);
  }
  if (plan.subject.restaurantIds.length > 0) {
    if (plan.subject.restaurantIds.includes(restaurant.restaurant_id)) witnesses.push({ constraint: 'restaurant', restaurantId: restaurant.restaurant_id, evidence: [restaurant.restaurant] });
    else failures.push(`${restaurant.restaurant} is not one of the requested restaurants`);
  }
  const rawLocations = plan.constraints.locations?.length ? plan.constraints.locations : plan.constraints.location ? [plan.constraints.location] : [];
  // Match executor semantics and prevent an older plan from proving the same
  // named area as both a coordinate origin and a legacy centroid scope.
  const locations = rawLocations.filter((location) => location.entityId !== plan.constraints.distanceAnchor?.entityId);
  if (locations.length > 0 && plan.subject.restaurantIds.length === 0) {
    const matching = locations.filter((location) => {
      if (location.relation === 'in') return matchesLocation(restaurant, location);
      const anchor = centroid(data.restaurants.filter((candidate) => matchesLocation(candidate, location)));
      return Boolean(anchor && restaurant.lat != null && restaurant.lng != null
        && distanceMiles(anchor, { latitude: restaurant.lat, longitude: restaurant.lng }) <= NEAR_RADIUS_MILES[location.entityType]);
    });
    if (matching.length > 0) witnesses.push({ constraint: 'location', restaurantId: restaurant.restaurant_id, evidence: matching.map((location) => `${location.relation}:${location.label}`) });
    else failures.push(`${restaurant.restaurant} is outside every requested location scope`);
  }
  for (const feature of plan.constraints.requiredFeatures) {
    const evidence = featureEvidence(restaurant, feature);
    if (plan.action === 'check_feature') {
      witnesses.push({ constraint: `feature-check:${feature}`, restaurantId: restaurant.restaurant_id, evidence: [evidence ?? 'feature absent'] });
    } else if (evidence) witnesses.push({ constraint: `feature:${feature}`, restaurantId: restaurant.restaurant_id, evidence: [evidence] });
    else failures.push(`${restaurant.restaurant} lacks required feature: ${feature}`);
  }
  for (const feature of plan.constraints.excludedFeatures) {
    if (!featureEvidence(restaurant, feature)) witnesses.push({ constraint: `excluded-feature:${feature}`, restaurantId: restaurant.restaurant_id, evidence: ['feature absent'] });
    else failures.push(`${restaurant.restaurant} has excluded feature: ${feature}`);
  }
  if (plan.constraints.serviceStyle) {
    if (normalizeForSearch(restaurant.service_style ?? '') === normalizeForSearch(plan.constraints.serviceStyle)) witnesses.push({ constraint: 'service-style', restaurantId: restaurant.restaurant_id, evidence: [restaurant.service_style ?? ''] });
    else failures.push(`${restaurant.restaurant} lacks service style: ${plan.constraints.serviceStyle}`);
  }
  if (plan.constraints.cuisine) {
    const match = restaurantProvesCuisine(restaurant, plan.constraints.cuisine);
    if (match) witnesses.push({ constraint: 'cuisine', restaurantId: restaurant.restaurant_id, evidence: [match] });
    else failures.push(`${restaurant.restaurant} lacks cuisine evidence: ${plan.constraints.cuisine}`);
  }
  if (plan.constraints.time === 'now') {
    const hours = getTodayStatus(data.hoursData, restaurant.restaurant_id);
    if (hours.kind === 'open') witnesses.push({ constraint: 'time:now', restaurantId: restaurant.restaurant_id, evidence: [hours.label] });
    else failures.push(`${restaurant.restaurant} is not proven open now`);
  }
  if (plan.constraints.time === 'today' && (plan.action === 'hours' || plan.claimType === 'restaurant_hours')) {
    const hours = getTodayStatus(data.hoursData, restaurant.restaurant_id);
    if (hours.todayLabel.startsWith('Open today')) witnesses.push({ constraint: 'time:today', restaurantId: restaurant.restaurant_id, evidence: [hours.todayLabel] });
    else failures.push(`${restaurant.restaurant} is not proven open today`);
  }
  if (plan.constraints.time === 'tomorrow' && (plan.action === 'hours' || plan.claimType === 'restaurant_hours')) {
    const hours = getStatusForDayOffset(data.hoursData, restaurant.restaurant_id, 1);
    if (hours.kind !== 'unknown' && hours.kind !== 'none') {
      witnesses.push({ constraint: 'time:tomorrow', restaurantId: restaurant.restaurant_id, evidence: [`Tomorrow: ${hours.todayLabel}`] });
    } else failures.push(`${restaurant.restaurant} has no published hours for tomorrow in the current data`);
  }
  const hasSpecificFood = plan.subject.foodTerms.some((term) => !GENERIC_FOOD_TERMS.has(normalizeForSearch(term)));
  if (!hasSpecificFood && plan.constraints.mealPeriods.length > 0 && items.length === 0) {
    const matches = plan.constraints.mealPeriods.some((period) => restaurant.meal_periods.some((value) => normalizeForSearch(value).includes(period)));
    if (matches) witnesses.push({ constraint: 'restaurant-meal-period', restaurantId: restaurant.restaurant_id, evidence: restaurant.meal_periods });
    else failures.push(`${restaurant.restaurant} lacks the requested restaurant meal period`);
  }

  const proofTerms = plan.subject.foodTerms.filter((term) => !GENERIC_FOOD_TERMS.has(normalizeForSearch(term)));
  const termMatches = proofTerms.map((term) => ({
    term,
    items: items.filter((item) => itemProvesFoodTerm(item, term)),
  }));
  const requiredMatches = plan.subject.foodMode === 'any'
    ? termMatches.filter((match) => match.items.length > 0).slice(0, 1)
    : termMatches;
  const missing = plan.subject.foodMode === 'any'
    ? (termMatches.length === 0 || termMatches.some((match) => match.items.length > 0) ? [] : proofTerms)
    : termMatches.filter((match) => match.items.length === 0).map((match) => match.term);
  for (const match of requiredMatches) {
    const item = match.items[0];
    if (!item) continue;
    witnesses.push({
      constraint: `food:${match.term}`,
      restaurantId: restaurant.restaurant_id,
      itemKey: `${item.restaurant_id}:${item.item_id}`,
      evidence: [item.item, item.category, item.category_group].filter(Boolean),
    });
  }
  if (missing.length > 0) failures.push(`${restaurant.restaurant} lacks item evidence for: ${missing.join(', ')}`);
  for (const item of items) {
    proveItemConstraints(plan, item, witnesses, failures);
    proveRecency(plan, item, data, witnesses, failures);
  }
  return { witnesses, failures };
}

export function proveExecutionResult(plan: QueryPlan, data: LoadedData, target: ProofTarget): ResultProof {
  const witnesses: ConstraintWitness[] = [];
  const failures: string[] = [];
  const restaurantIds = [...new Set(target.restaurantIds ?? [])];

  // App-routing answers are proven by their linked entity/action and do not
  // make a menu-content claim themselves.
  if (restaurantIds.length === 0 && plan.subject.foodTerms.length === 0) {
    return { status: 'proven', witnesses: [{ constraint: 'routing', evidence: [plan.action] }], failures: [] };
  }

  const restaurants = new Map(data.restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant]));
  for (const restaurantId of restaurantIds) {
    const restaurant = restaurants.get(restaurantId);
    if (!restaurant) {
      failures.push(`Unknown returned restaurant: ${restaurantId}`);
      continue;
    }
    const result = restaurantProof(
      plan,
      restaurant,
      targetItems(plan, target, data, restaurantId),
      data,
      target.distanceMilesByRestaurant?.[restaurantId],
    );
    witnesses.push(...result.witnesses);
    failures.push(...result.failures);
  }

  const hasSpecificFood = plan.subject.foodTerms.some((term) => !GENERIC_FOOD_TERMS.has(normalizeForSearch(term)));
  if (hasSpecificFood && restaurantIds.length === 0) {
    failures.push('The answer returned no restaurant that can witness the requested food');
  }
  if (!hasSpecificFood && witnesses.length === 0) {
    witnesses.push({ constraint: 'typed-prefilter', evidence: ['All returned rows survived the typed plan filters.'] });
  }
  return { status: failures.length === 0 ? 'proven' : 'failed', witnesses, failures };
}

export function proveGlobalObjective(
  plan: QueryPlan,
  target: ProofTarget,
  candidates: ObjectiveCandidate[] | undefined,
): ResultProof {
  const operation = plan.constraints.priceOperation === 'cheapest'
    ? 'cheapest' as const
    : plan.constraints.distanceOperation === 'nearest' ? 'nearest' as const : null;
  if (!operation) return { status: 'proven', witnesses: [], failures: [] };
  if (!candidates?.length) {
    return { status: 'failed', witnesses: [], failures: [`No independently enumerable candidate universe was available for ${operation}`] };
  }
  const finite = candidates.filter((candidate) => Number.isFinite(candidate.score));
  if (finite.length === 0) return { status: 'failed', witnesses: [], failures: [`No candidate has a provable ${operation} score`] };
  const optimum = Math.min(...finite.map((candidate) => candidate.score));
  const restaurantIds = new Set(target.restaurantIds ?? []);
  const itemKeys = new Set(target.itemKeys ?? []);
  const returned = finite.filter((candidate) => restaurantIds.has(candidate.restaurantId)
    && candidate.itemKeys.every((key) => itemKeys.has(key)));
  if (returned.length === 0) return { status: 'failed', witnesses: [], failures: [`The returned row is absent from the ${operation} candidate universe`] };
  const nonOptimal = returned.filter((candidate) => Math.abs(candidate.score - optimum) > 0.000001);
  if (nonOptimal.length > 0) {
    return {
      status: 'failed',
      witnesses: [],
      failures: [`A returned ${operation} score (${nonOptimal[0].score}) is worse than the global optimum (${optimum})`],
    };
  }
  return {
    status: 'proven',
    witnesses: [{
      constraint: `global-${operation}`,
      evidence: [`optimum=${optimum}`, `eligible-candidates=${finite.length}`, ...returned.map((candidate) => candidate.evidence)],
    }],
    failures: [],
  };
}
