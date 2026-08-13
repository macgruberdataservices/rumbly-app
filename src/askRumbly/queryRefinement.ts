import type { QueryPlan, QueryPlanRefinement } from './queryPlan';

const ORDERING_AMBIGUITY_REASON = 'Choose whether lowest price or closest distance should decide the result.';

/**
 * Apply one server-authored clarification choice without reparsing text or
 * replacing the rest of the plan. Every unrelated constraint survives.
 */
export function applyQueryPlanRefinement(
  basePlan: QueryPlan,
  refinement: QueryPlanRefinement,
): QueryPlan {
  const constraints = { ...basePlan.constraints };
  if (refinement.kind === 'menu_item_kind') {
    constraints.menuItemKind = refinement.value;
    constraints.beverageRole = undefined;
  } else if (refinement.value === 'cheapest') {
    constraints.priceOperation = 'cheapest';
    constraints.distanceOperation = undefined;
    // A bare "closest to X" anchor only supports the ordering being
    // discarded. A `near X` scope carries a radius and remains a real search
    // boundary, so preserve that form.
    if (constraints.distanceRadiusMiles == null) constraints.distanceAnchor = undefined;
  } else {
    constraints.distanceOperation = 'nearest';
    if (constraints.priceOperation === 'cheapest') constraints.priceOperation = undefined;
  }

  const reasons = basePlan.diagnostics.reasons.filter((reason) => reason !== ORDERING_AMBIGUITY_REASON);
  return {
    ...basePlan,
    action: basePlan.action === 'clarify'
      ? reasons.length > 0 ? 'clarify' : 'find'
      : basePlan.action,
    subject: { ...basePlan.subject },
    constraints,
    linkedEntities: [...basePlan.linkedEntities],
    diagnostics: {
      ...basePlan.diagnostics,
      confidence: basePlan.diagnostics.meaningfulUnconsumedText ? 'low' : reasons.length > 0 ? 'medium' : 'high',
      reasons,
    },
  };
}

export function isQueryPlanRefinement(value: unknown): value is QueryPlanRefinement {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { kind?: unknown; value?: unknown };
  if (candidate.kind === 'ordering') return candidate.value === 'cheapest' || candidate.value === 'nearest';
  return candidate.kind === 'menu_item_kind'
    && ['cocktail', 'non_alcoholic_drink', 'dessert', 'savory'].includes(String(candidate.value));
}

export { ORDERING_AMBIGUITY_REASON };
