import type { CapabilityDecision } from './capabilityRegistry';
import type { QueryPlanRefinement } from './queryPlan';

export type ClarificationKind = 'menu_item_kind' | 'ordering';

export interface ClarificationOption {
  id: string;
  label: string;
  refinement: QueryPlanRefinement;
}

export interface ClarificationRequest {
  kind: ClarificationKind;
  prompt: string;
  options: ClarificationOption[];
}

export interface ExecutionTrace {
  appliedConstraints: string[];
  candidateRestaurants: number;
  candidateItems: number;
  locationApproximation?: string;
}

export interface ConstraintWitness {
  constraint: string;
  evidence: string[];
  restaurantId?: string;
  itemKey?: string;
}

export interface ResultProof {
  status: 'proven' | 'failed';
  witnesses: ConstraintWitness[];
  failures: string[];
}

export type PlanExecutionResult<Action = unknown> =
  | {
      kind: 'answer';
      text: string;
      restaurantIds?: string[];
      itemIds?: string[];
      itemKeys?: string[];
      distanceMilesByRestaurant?: Record<string, number>;
      actions?: Action[];
      trace: ExecutionTrace;
      proof: ResultProof;
      safety?: { kind: 'allergy'; acknowledgementVersion: number; allergenKeys: string[] };
    }
  | {
      kind: 'clarification' | 'handoff' | 'unsupported';
      text: string;
      capability: CapabilityDecision;
      /** Present when the follow-up can be applied without reparsing prose. */
      clarification?: ClarificationRequest;
      actions?: Action[];
    }
  | {
      kind: 'no-match' | 'error';
      text: string;
      trace?: ExecutionTrace;
      safety?: { kind: 'allergy'; acknowledgementVersion: number; allergenKeys: string[] };
    };
