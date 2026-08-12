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
// "Good", "great", and "decent" are conversational filler rather than a request
// for a ranking, but they still route to editorial_judgment. Adapting them here
// reuses the tested options path — which keeps the "Rumbly cannot pick a best"
// wording and re-enters the capability, execution, and proof gates — instead of
// quietly reclassifying the question as an ordinary menu search.
const SUBJECTIVE_OPTIONS_PATTERN = /\b(?:best|top(?:\s+\d+)?|highest[ -]rated|favorite|must[ -]eat|most famous|signature|recommend(?:ed|ation)?|good|great|decent|nice|solid)\b/i;

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
  // Capability first. A question Rumbly cannot answer at all must not be met
  // with a request for the guest's location: "where is the closest bathroom"
  // asked for Near Me before declining, which reads as though turning location
  // on would have produced an answer.
  // "Not a decline" rather than "executable": a low-confidence plan should
  // still get the specific budget or location prompt, which is more useful than
  // the generic unresolved-text clarification it would otherwise fall through
  // to. Only unsupported and handoff claims skip these branches.
  const initialCapability = assessPlanCapability(plan);
  const answerable = initialCapability.disposition === 'execute'
    || initialCapability.disposition === 'clarify';
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
  const broadBudgetWithoutContext = answerable
    && !origin
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
    const optionsResult = executeQueryPlan(optionsPlan, data, namedDistanceAnchor
      ? { latitude: namedDistanceAnchor.latitude, longitude: namedDistanceAnchor.longitude }
      : origin ?? null);
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
  const result = executeQueryPlan(plan, data, namedDistanceAnchor
    ? { latitude: namedDistanceAnchor.latitude, longitude: namedDistanceAnchor.longitude }
    : origin ?? null);
  return { plan, result };
}
