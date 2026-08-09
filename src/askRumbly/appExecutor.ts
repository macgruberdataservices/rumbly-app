import { parseQueryPlan } from './semanticParser';
import type { QueryPlan } from './queryPlan';
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
  const plan = parseQueryPlan(query, vocabulary);
  const result = executeQueryPlan(plan, data, origin);
  return { plan, result };
}
