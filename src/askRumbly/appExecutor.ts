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
}

export function runAskRumbly(
  query: string,
  data: AskRumblyData,
  origin?: Coordinates,
): AskRumblyResponse {
  const vocabulary = buildParserVocabulary(data);
  let plan = parseQueryPlan(query, vocabulary);
  const needsCurrentLocation = !origin
    && !plan.constraints.location
    && !plan.constraints.locations?.length
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
  const result = executeQueryPlan(plan, data, origin);
  return { plan, result };
}
