import { parseQueryPlan } from './semanticParser';
import type { QueryPlan } from './queryPlan';
import { assessPlanCapability } from './capabilityRegistry';
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
}

const GENERIC_SUBJECTS = new Set(['food', 'meal', 'meals', 'option', 'options', 'dish', 'dishes', 'something', 'anything', 'for']);
const SUBJECTIVE_OPTIONS_PATTERN = /\b(?:best|top(?:\s+\d+)?|highest[ -]rated|favorite|must[ -]eat|most famous|signature|recommend(?:ed|ation)?)\b/i;

function hasSpecificSubject(plan: QueryPlan): boolean {
  return plan.subject.foodTerms.some((term) => !GENERIC_SUBJECTS.has(term.toLowerCase()));
}

export function runAskRumbly(
  query: string,
  data: AskRumblyData,
  origin?: Coordinates,
): AskRumblyResponse {
  const vocabulary = buildParserVocabulary(data);
  let plan = parseQueryPlan(query, vocabulary);
  const locations = plan.constraints.locations?.length
    ? plan.constraints.locations
    : plan.constraints.location ? [plan.constraints.location] : [];
  const hasDistanceAnchor = locations.some((location) => location.relation === 'near');
  const needsCurrentLocation = !origin
    && !hasDistanceAnchor
    && (plan.action === 'distance' || plan.constraints.distanceOperation === 'nearest');
  if (needsCurrentLocation) {
    const reason = 'Current location is required for an unscoped distance question.';
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
    };
  }
  const broadBudgetWithoutContext = !origin
    && locations.length === 0
    && plan.constraints.locationSet == null
    && plan.constraints.maxPrice != null
    && !hasSpecificSubject(plan);
  if (broadBudgetWithoutContext) {
    const reason = 'A broad budget search needs a food or location to produce useful results.';
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
    };
  }
  if (plan.claimType === 'editorial_judgment'
    && SUBJECTIVE_OPTIONS_PATTERN.test(plan.sourceText)
    && hasSpecificSubject(plan)) {
    const originalPlan = plan;
    const optionsPlan: QueryPlan = {
      ...plan,
      action: 'find',
      claimType: plan.constraints.allergenKeys.length > 0 ? 'disney_label' : 'menu_presence',
      diagnostics: {
        ...plan.diagnostics,
        confidence: plan.diagnostics.meaningfulUnconsumedText ? 'low' : 'high',
        reasons: ['Subjective ranking is unsupported; searching the same constraints for verified options instead.'],
      },
    };
    const optionsResult = executeQueryPlan(optionsPlan, data, origin ?? null);
    if (optionsResult.kind === 'answer' || optionsResult.kind === 'no-match') {
      return {
        plan: optionsPlan,
        result: optionsResult,
        adaptation: {
          kind: 'subjective_options',
          originalPlan,
          usedCurrentLocation: Boolean(origin),
        },
      };
    }
  }
  // `null` is intentional here. The terminal harness retains a documented
  // Magic Kingdom stand-in origin, but the in-app path must never let that
  // development fallback influence guest-facing ranking or distance prose.
  const result = executeQueryPlan(plan, data, origin ?? null);
  return { plan, result };
}
