import type { ClaimType, QueryPlan } from './queryPlan.ts';

export type EvidenceSource =
  | 'menu_item_fields'
  | 'disney_allergy_labels'
  | 'restaurant_fields'
  | 'hours_snapshot'
  | 'coordinates'
  | 'curated_disney_handoff';

export interface CapabilityRule {
  disposition: 'execute' | 'handoff' | 'clarify' | 'unsupported';
  evidence: EvidenceSource[];
  reason: string;
}

export const CAPABILITY_REGISTRY: Readonly<Record<ClaimType, CapabilityRule>> = {
  disney_label: {
    disposition: 'execute', evidence: ['disney_allergy_labels'],
    reason: 'Answer only from Disney-published allergy labels on menu rows.',
  },
  menu_presence: {
    disposition: 'execute', evidence: ['menu_item_fields'],
    reason: 'Menu presence is supported by current structured menu rows.',
  },
  menu_recency: {
    disposition: 'execute', evidence: ['menu_item_fields'],
    reason: "A row's first_seen date supports when Rumbly first saw it, which is not the same as when Disney added it.",
  },
  restaurant_feature: {
    disposition: 'execute', evidence: ['restaurant_fields'],
    reason: 'Restaurant feature flags support this question without claiming live availability.',
  },
  restaurant_hours: {
    disposition: 'execute', evidence: ['hours_snapshot'],
    reason: 'Published restaurant hours support today and tomorrow queries.',
  },
  restaurant_location: {
    disposition: 'execute', evidence: ['coordinates'],
    reason: 'Known restaurant coordinates support direct-distance answers.',
  },
  venue_amenity: {
    disposition: 'unsupported', evidence: [],
    reason: 'The structured dataset does not establish seating environment, views, crowd levels, weather protection, or entertainment amenities.',
  },
  sensory_attribute: {
    disposition: 'unsupported', evidence: [],
    reason: 'The structured dataset does not establish sensory qualities such as spiciness.',
  },
  price_comparison: {
    disposition: 'clarify', evidence: ['menu_item_fields'],
    reason: 'A comparable item pair must be identified before prices can be compared.',
  },
  ingredient_content: {
    disposition: 'unsupported', evidence: [],
    reason: 'Menu descriptions are not complete ingredient statements.',
  },
  allergy_safety: {
    disposition: 'clarify', evidence: ['disney_allergy_labels'],
    reason: 'Rumbly cannot decide what is safe, but can offer Disney-labeled options for a named allergen.',
  },
  cross_contact: {
    disposition: 'unsupported', evidence: [],
    reason: 'The local dataset does not describe cross-contact conditions.',
  },
  kitchen_process: {
    disposition: 'unsupported', evidence: [],
    reason: 'The local dataset does not establish kitchen procedures, equipment, or staff practices.',
  },
  live_availability: {
    disposition: 'handoff', evidence: ['curated_disney_handoff'],
    reason: 'A Disney app handoff can check current availability; local feature flags cannot.',
  },
  official_policy: {
    disposition: 'handoff', evidence: ['curated_disney_handoff'],
    reason: 'Policy and ordering guidance should open a maintained official Disney source.',
  },
  editorial_judgment: {
    disposition: 'unsupported', evidence: [],
    reason: 'The dataset has no editorial or safety-ranking ground truth.',
  },
  live_park_operations: {
    disposition: 'unsupported', evidence: [],
    reason: 'Park operations are outside Ask Rumbly dining data.',
  },
  general_information: {
    disposition: 'unsupported', evidence: [],
    reason: 'General-information questions are outside Ask Rumbly dining data.',
  },
};

export interface CapabilityDecision extends CapabilityRule {
  claimType: ClaimType;
}

export function assessPlanCapability(plan: QueryPlan): CapabilityDecision {
  const rule = CAPABILITY_REGISTRY[plan.claimType];
  if (plan.constraints.requiredFeatures.includes('wait_time')) {
    return {
      claimType: plan.claimType,
      disposition: 'unsupported',
      evidence: [],
      reason: 'Rumbly has no live restaurant wait-time source.',
    };
  }
  if (plan.constraints.time === 'specific') {
    return {
      claimType: plan.claimType,
      disposition: 'unsupported',
      evidence: [],
      reason: 'Rumbly has a daily open and close time, not a schedule it can filter by a specific hour.',
    };
  }
  if (plan.constraints.dietaryKeys.includes('kosher')) {
    return {
      claimType: plan.claimType,
      disposition: 'unsupported',
      evidence: [],
      reason: 'The local dataset does not provide structured kosher-meal evidence.',
    };
  }
  // A parser-level ambiguity cannot make an unsupported or handoff-only
  // claim answerable. Preserve that capability boundary before considering
  // clarification state on the plan.
  if (rule.disposition === 'unsupported' || rule.disposition === 'handoff') {
    return { claimType: plan.claimType, ...rule };
  }
  if (plan.action === 'clarify') {
    return {
      claimType: plan.claimType,
      disposition: 'clarify',
      evidence: rule.evidence,
      reason: plan.diagnostics.reasons.at(-1) ?? rule.reason,
    };
  }
  if (plan.diagnostics.confidence === 'low' && rule.disposition === 'execute') {
    return {
      claimType: plan.claimType,
      disposition: 'clarify',
      evidence: rule.evidence,
      reason: plan.diagnostics.reasons.at(-1) ?? 'The parser left meaningful text unresolved.',
    };
  }
  return { claimType: plan.claimType, ...rule };
}
