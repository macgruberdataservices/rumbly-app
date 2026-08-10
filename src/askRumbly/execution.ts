import type { CapabilityDecision } from './capabilityRegistry';

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
      actions?: Action[];
    }
  | {
      kind: 'no-match' | 'error';
      text: string;
      trace?: ExecutionTrace;
      safety?: { kind: 'allergy'; acknowledgementVersion: number; allergenKeys: string[] };
    };
