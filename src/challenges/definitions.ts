import type { ChallengeDefinition } from './evaluate';

export const QUICK_FIVE_CHALLENGE: ChallengeDefinition = {
  id: 'quick-five',
  version: 1,
  title: 'Quick Five',
  description: 'Visit five different Quick Service restaurants.',
  badgeTitle: 'Quick Five',
  repeatMode: 'repeatable_round',
  goal: {
    kind: 'distinct_restaurants',
    requiredCount: 5,
  },
  criteria: {
    serviceStyles: ['Quick Service'],
  },
};

export const CHALLENGES: ChallengeDefinition[] = [QUICK_FIVE_CHALLENGE];

export function getChallengeDefinition(challengeId: string): ChallengeDefinition | undefined {
  return CHALLENGES.find((challenge) => challenge.id === challengeId);
}
