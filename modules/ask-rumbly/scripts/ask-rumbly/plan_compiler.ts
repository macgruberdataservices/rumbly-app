import { assessPlanCapability, type CapabilityDecision } from '../../../../src/askRumbly/capabilityRegistry.ts';
import type { QueryPlan, RestaurantFeature } from '../../../../src/askRumbly/queryPlan.ts';
import type { ClassifiedQuery } from './executor.ts';

export type PlanCompilation =
  | { kind: 'compiled'; query: ClassifiedQuery }
  | { kind: 'not_compiled'; capability: CapabilityDecision; reason: string };

const FEATURE_ATTRIBUTES: Partial<Record<RestaurantFeature, string>> = {
  mobile_order: 'mobile_order',
  walk_up_list: 'walkup_list',
  reservations: 'reservations',
};

function decline(plan: QueryPlan, reason: string): PlanCompilation {
  return { kind: 'not_compiled', capability: assessPlanCapability(plan), reason };
}

function restaurantName(plan: QueryPlan): string | null {
  const ids = new Set(plan.subject.restaurantIds);
  const restaurants = plan.linkedEntities.filter((entity) => entity.type === 'restaurant' && ids.has(entity.id));
  return restaurants.length === 1 ? restaurants[0].label : null;
}

function baseQuery(plan: QueryPlan): ClassifiedQuery {
  const foodTerms = plan.subject.foodTerms;
  return {
    queryType: 'unsupported',
    item: foodTerms.length > 0 ? foodTerms.join(plan.subject.foodMode === 'any' ? ' or ' : ' and ') : null,
    items: foodTerms.length > 1 ? foodTerms : null,
    compoundMode: foodTerms.length > 1 ? (plan.subject.foodMode === 'any' ? 'or' : 'and') : undefined,
    restaurantName: restaurantName(plan),
    park: plan.constraints.location?.label ?? null,
    allergenKeys: plan.constraints.allergenKeys.length > 0 ? plan.constraints.allergenKeys : null,
  };
}

export function compileQueryPlan(plan: QueryPlan): PlanCompilation {
  const capability = assessPlanCapability(plan);
  if (capability.disposition !== 'execute') {
    return { kind: 'not_compiled', capability, reason: capability.reason };
  }
  if (plan.constraints.location?.relation === 'near') {
    return decline(plan, 'The legacy executor cannot preserve distance relative to a linked place; it only supports inside-location filtering.');
  }
  if ((plan.constraints.locations?.length ?? 0) > 1) {
    return decline(plan, 'The legacy executor cannot preserve alternative location scopes.');
  }
  if (plan.constraints.locationSet) {
    return decline(plan, 'The legacy executor has no typed multi-park scope.');
  }
  if (plan.constraints.excludedFeatures.length > 0) {
    return decline(plan, 'The legacy executor cannot preserve negated restaurant features.');
  }
  if (plan.constraints.maxPrice != null) {
    return decline(plan, 'The legacy executor has no maximum-price operation.');
  }
  if (plan.subject.excludedFoodTerms.length > 0) {
    return decline(plan, 'The legacy executor cannot preserve excluded food terms.');
  }
  if (plan.constraints.dietaryKeys.length > 0 || plan.constraints.mealPeriods.length > 0) {
    return decline(plan, 'The legacy executor cannot preserve the plan\'s dietary or meal-period constraints through this adapter yet.');
  }
  if (plan.constraints.serviceStyle && plan.subject.foodTerms.length > 0) {
    return decline(plan, 'The legacy executor cannot apply a service-style constraint to an item search.');
  }
  if (plan.constraints.allergenKeys.length > 0 && plan.subject.foodTerms.length > 1) {
    return decline(plan, 'The legacy executor intentionally declines compound allergen item queries.');
  }

  const query = baseQuery(plan);
  if (plan.action === 'open_menu') {
    if (!query.restaurantName) return decline(plan, 'Opening a menu requires one linked restaurant.');
    return { kind: 'compiled', query: { ...query, queryType: 'menu' } };
  }
  if (plan.action === 'check_menu') {
    if (!query.restaurantName || !query.item) return decline(plan, 'A menu check requires one restaurant and one food term.');
    return { kind: 'compiled', query: { ...query, queryType: 'hasItem' } };
  }
  if (plan.action === 'hours') {
    if (!query.restaurantName) return decline(plan, 'Hours require one linked restaurant.');
    return {
      kind: 'compiled',
      query: {
        ...query,
        queryType: 'hours',
        dayOffset: plan.constraints.time === 'tomorrow' ? 1 : 0,
        hoursMode: plan.constraints.time === 'now' ? 'openNow' : 'schedule',
      },
    };
  }
  if (plan.action === 'distance') {
    if (!query.restaurantName) return decline(plan, 'Distance requires one linked restaurant.');
    return { kind: 'compiled', query: { ...query, queryType: 'distance' } };
  }
  if (plan.action === 'check_feature' || (plan.action === 'find' && plan.claimType === 'restaurant_feature')) {
    const attributes = plan.constraints.requiredFeatures
      .map((feature) => FEATURE_ATTRIBUTES[feature])
      .filter((attribute): attribute is string => Boolean(attribute));
    const serviceStyle = plan.constraints.requiredFeatures.includes('quick_service') ? 'Quick Service' : null;
    if (attributes.length > 1) return decline(plan, 'The legacy executor cannot intersect multiple restaurant feature fields.');
    if (plan.action === 'check_feature') {
      if (!query.restaurantName || attributes.length !== 1) return decline(plan, 'A restaurant feature check requires one restaurant and one supported feature.');
      return { kind: 'compiled', query: { ...query, queryType: 'attribute', attribute: attributes[0] } };
    }
    if (attributes.length === 1) {
      return { kind: 'compiled', query: { ...query, queryType: 'attributeList', attribute: attributes[0], serviceStyle } };
    }
    if (serviceStyle) return { kind: 'compiled', query: { ...query, queryType: 'list', serviceStyle } };
    return decline(plan, 'No executor-supported restaurant feature was found.');
  }
  if (plan.action === 'find') {
    if (plan.constraints.cuisine) {
      if (query.item) return decline(plan, 'The legacy executor cannot preserve both cuisine and item concepts in one search.');
      const queryType = plan.constraints.distanceOperation === 'nearest' ? 'nearest' : plan.constraints.priceOperation === 'cheapest' ? 'cheapest' : 'list';
      return { kind: 'compiled', query: { ...query, queryType, cuisine: plan.constraints.cuisine } };
    }
    if (plan.claimType === 'disney_label' && !query.item) {
      return { kind: 'compiled', query: { ...query, queryType: 'allergyList' } };
    }
    if (!query.item) return decline(plan, 'An item search requires at least one food term.');
    const queryType = plan.constraints.priceOperation === 'cheapest'
      ? 'cheapest'
      : plan.constraints.distanceOperation === 'nearest' ? 'nearest' : 'list';
    return { kind: 'compiled', query: { ...query, queryType } };
  }
  return decline(plan, `Action "${plan.action}" does not have a legacy executor compilation.`);
}
