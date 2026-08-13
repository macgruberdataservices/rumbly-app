import { parseQueryPlan } from './semanticParser';
import type { QueryPlan } from './queryPlan';
import type { ClarificationOption } from './execution';
import { assessPlanCapability } from './capabilityRegistry';
import { applyQueryPlanRefinement, ORDERING_AMBIGUITY_REASON } from './queryRefinement';
import type { Coordinates } from '../location/proximity';
import { buildParserVocabulary } from '../../modules/ask-rumbly/scripts/ask-rumbly/parser_vocabulary';
import {
  executeQueryPlan,
  type TypedPlanExecution,
} from '../../modules/ask-rumbly/scripts/ask-rumbly/typed_plan_executor';
import type { buildAskRumblyData } from './appData';

export type AskRumblyData = ReturnType<typeof buildAskRumblyData>;

export interface AskRumblyResponse {
  plan: QueryPlan;
  result: TypedPlanExecution;
  adaptation?: {
    kind: 'subjective_options';
    originalPlan: QueryPlan;
    usedCurrentLocation: boolean;
  };
  continuation?: {
    kind: 'plan_refinement';
    optionId: string;
    basePlan: QueryPlan;
    refinement: ClarificationOption['refinement'];
  };
}

const GENERIC_SUBJECTS = new Set(['food', 'meal', 'meals', 'option', 'options', 'dish', 'dishes', 'something', 'anything', 'for']);
// "Good", "great", and "decent" are conversational filler rather than a request
// for a ranking, but they still route to editorial_judgment. Adapting them here
// reuses the tested options path — which keeps the "Rumbly cannot pick a best"
// wording and re-enters the capability, execution, and proof gates — instead of
// quietly reclassifying the question as an ordinary menu search.
const SUBJECTIVE_OPTIONS_PATTERN = /\b(?:best|top(?:\s+\d+)?|highest[ -]rated|favorite|must[ -]eat|most famous|signature|recommend(?:ed|ation)?|good|great|decent|nice|solid)\b/i;
const CURRENT_LOCATION_REASON = 'Current location is required for an unscoped distance question.';
const BROAD_BUDGET_REASON = 'A broad budget search needs a food or location to produce useful results.';

function hasSpecificSubject(plan: QueryPlan): boolean {
  return plan.subject.foodTerms.some((term) => !GENERIC_SUBJECTS.has(term.toLowerCase()));
}

function runQueryPlan(
  initialPlan: QueryPlan,
  data: AskRumblyData,
  origin?: Coordinates,
): AskRumblyResponse {
  let plan = initialPlan;
  const initialCapability = assessPlanCapability(plan);
  const canAdaptSubjective = plan.claimType === 'editorial_judgment'
    && SUBJECTIVE_OPTIONS_PATTERN.test(plan.sourceText)
    && hasSpecificSubject(plan);
  const adaptation = canAdaptSubjective ? {
    kind: 'subjective_options' as const,
    originalPlan: initialPlan,
    usedCurrentLocation: Boolean(origin),
  } : undefined;
  if (canAdaptSubjective) {
    plan = {
      ...plan,
      action: plan.action === 'clarify'
        && !plan.diagnostics.reasons.some((reason) => reason !== ORDERING_AMBIGUITY_REASON && !/rankings or safety judgments/i.test(reason))
          ? plan.constraints.priceOperation === 'cheapest' && plan.constraints.distanceOperation === 'nearest' ? 'clarify' : 'find'
          : plan.action,
      claimType: plan.constraints.allergenKeys.length > 0 ? 'disney_label' : 'menu_presence',
      diagnostics: {
        ...plan.diagnostics,
        confidence: plan.diagnostics.meaningfulUnconsumedText ? 'low' : 'high',
        reasons: plan.diagnostics.reasons.filter((reason) => !/rankings or safety judgments/i.test(reason)),
      },
    };
  }
  if (!canAdaptSubjective
    && (initialCapability.disposition === 'unsupported' || initialCapability.disposition === 'handoff')) {
    return { plan, result: executeQueryPlan(plan, data, origin ?? null) };
  }
  if (plan.constraints.priceOperation === 'cheapest'
    && plan.constraints.distanceOperation === 'nearest') {
    const nearLocation = (plan.constraints.locations?.length
      ? plan.constraints.locations
      : plan.constraints.location ? [plan.constraints.location] : [])
      .find((location) => location.relation === 'near');
    const competingReason = plan.diagnostics.reasons.find((reason) => reason !== ORDERING_AMBIGUITY_REASON);
    if (competingReason) {
      const clarificationPlan: QueryPlan = {
        ...plan,
        diagnostics: {
          ...plan.diagnostics,
          reasons: plan.diagnostics.reasons.filter((reason) => reason !== ORDERING_AMBIGUITY_REASON),
        },
      };
      return {
        plan: clarificationPlan,
        result: {
          kind: 'clarification',
          text: competingReason,
          capability: assessPlanCapability(clarificationPlan),
        },
        ...(adaptation ? { adaptation } : {}),
      };
    }
    if (plan.action !== 'clarify' || !plan.diagnostics.reasons.includes(ORDERING_AMBIGUITY_REASON)) {
      plan = {
        ...plan,
        action: 'clarify',
        diagnostics: {
          ...plan.diagnostics,
          confidence: 'medium',
          reasons: [...plan.diagnostics.reasons, ORDERING_AMBIGUITY_REASON],
        },
      };
    }
    return {
      plan,
      result: {
        kind: 'clarification',
        text: 'Should lowest price or closest distance decide this search?',
        capability: assessPlanCapability(plan),
        clarification: {
          kind: 'ordering',
          prompt: 'Should lowest price or closest distance decide this search?',
          options: [
            { id: 'ordering:cheapest', label: 'Lowest price', refinement: { kind: 'ordering', value: 'cheapest' } },
            {
              id: 'ordering:nearest',
              label: plan.constraints.distanceAnchor
                ? `Closest to ${plan.constraints.distanceAnchor.label}`
                : nearLocation ? `Closest near ${nearLocation.label}` : 'Closest to me',
              refinement: { kind: 'ordering', value: 'nearest' },
            },
          ],
        },
      },
      ...(adaptation ? { adaptation } : {}),
    };
  }
  // Capability first. A question Rumbly cannot answer at all must not be met
  // with a request for the guest's location: "where is the closest bathroom"
  // asked for Near Me before declining, which reads as though turning location
  // on would have produced an answer.
  // "Not a decline" rather than "executable": a low-confidence plan should
  // still get the specific budget or location prompt, which is more useful than
  // the generic unresolved-text clarification it would otherwise fall through
  // to. Only unsupported and handoff claims skip these branches.
  const answerable = initialCapability.disposition === 'execute'
    || initialCapability.disposition === 'clarify'
    || canAdaptSubjective;
  const locations = plan.constraints.locations?.length
    ? plan.constraints.locations
    : plan.constraints.location ? [plan.constraints.location] : [];
  const hasDistanceAnchor = locations.some((location) => location.relation === 'near');
  const namedDistanceAnchor = plan.constraints.distanceAnchor;
  const needsCurrentLocation = answerable
    && !origin
    && !hasDistanceAnchor
    && !namedDistanceAnchor
    && (plan.action === 'distance' || plan.constraints.distanceOperation != null);
  if (needsCurrentLocation) {
    const reason = CURRENT_LOCATION_REASON;
    plan = {
      ...plan,
      action: 'clarify',
      diagnostics: {
        ...plan.diagnostics,
        confidence: 'medium',
        reasons: [...plan.diagnostics.reasons, reason],
      },
    };
    return {
      plan,
      result: {
        kind: 'clarification',
        text: 'Turn on the location button so I can answer from where you are, or name a park, resort, or area to search near.',
        capability: assessPlanCapability(plan),
      },
      ...(adaptation ? { adaptation } : {}),
    };
  }
  const broadBudgetWithoutContext = answerable
    && !origin
    && locations.length === 0
    && plan.constraints.locationSet == null
    && plan.constraints.maxPrice != null
    && !hasSpecificSubject(plan);
  if (broadBudgetWithoutContext) {
    const reason = BROAD_BUDGET_REASON;
    plan = {
      ...plan,
      action: 'clarify',
      diagnostics: {
        ...plan.diagnostics,
        confidence: 'medium',
        reasons: [...plan.diagnostics.reasons, reason],
      },
    };
    return {
      plan,
      result: {
        kind: 'clarification',
        text: 'Name a food or an area, or turn on the location button, and I can keep the same price limit.',
        capability: assessPlanCapability(plan),
      },
      ...(adaptation ? { adaptation } : {}),
    };
  }
  if (canAdaptSubjective) {
    const optionsResult = executeQueryPlan(plan, data, namedDistanceAnchor
      ? { latitude: namedDistanceAnchor.latitude, longitude: namedDistanceAnchor.longitude }
      : origin ?? null);
    if (optionsResult.kind === 'answer' || optionsResult.kind === 'no-match' || optionsResult.kind === 'clarification') {
      return {
        plan,
        result: optionsResult,
        ...(adaptation ? { adaptation } : {}),
      };
    }
  }
  // `null` is intentional here. The terminal harness retains a documented
  // Magic Kingdom stand-in origin, but the in-app path must never let that
  // development fallback influence guest-facing ranking or distance prose.
  const result = executeQueryPlan(plan, data, namedDistanceAnchor
    ? { latitude: namedDistanceAnchor.latitude, longitude: namedDistanceAnchor.longitude }
    : origin ?? null);
  return { plan, result, ...(adaptation ? { adaptation } : {}) };
}

/** Re-run an already validated plan after app context such as location changes. */
export function runAskRumblyPlan(
  plan: QueryPlan,
  data: AskRumblyData,
  origin?: Coordinates,
): AskRumblyResponse {
  if (!origin || plan.action !== 'clarify') return runQueryPlan(plan, data, origin);
  const reasons = plan.diagnostics.reasons.filter((reason) =>
    reason !== CURRENT_LOCATION_REASON && reason !== BROAD_BUDGET_REASON);
  if (reasons.length === plan.diagnostics.reasons.length) return runQueryPlan(plan, data, origin);
  if (reasons.length > 0) {
    return runQueryPlan({
      ...plan,
      diagnostics: {
        ...plan.diagnostics,
        confidence: plan.diagnostics.meaningfulUnconsumedText ? 'low' : 'medium',
        reasons,
      },
    }, data, origin);
  }
  const resumed: QueryPlan = {
    ...plan,
    action: plan.claimType === 'restaurant_location' && plan.subject.restaurantIds.length > 0 ? 'distance' : 'find',
    diagnostics: {
      ...plan.diagnostics,
      confidence: plan.diagnostics.meaningfulUnconsumedText ? 'low' : 'high',
      reasons,
    },
  };
  return runQueryPlan(resumed, data, origin);
}

export function runAskRumbly(
  query: string,
  data: AskRumblyData,
  origin?: Coordinates,
): AskRumblyResponse {
  const vocabulary = buildParserVocabulary(data);
  return runQueryPlan(parseQueryPlan(query, vocabulary), data, origin);
}

export function continueAskRumbly(
  basePlan: QueryPlan,
  option: ClarificationOption,
  data: AskRumblyData,
  origin?: Coordinates,
): AskRumblyResponse {
  const response = runQueryPlan(applyQueryPlanRefinement(basePlan, option.refinement), data, origin);
  return {
    ...response,
    continuation: {
      kind: 'plan_refinement',
      optionId: option.id,
      basePlan,
      refinement: option.refinement,
    },
  };
}
