import type { ChallengeDefinition, ChallengeProgress } from '../challenges/evaluate';
import type { Restaurant, SearchIndexEntry } from '../data/types';

export type RecommendationEventType =
  | 'search_open'
  | 'view'
  | 'feed_open'
  | 'dismiss'
  | 'external_open';

export type RecommendationTargetType = 'restaurant' | 'item' | 'challenge' | 'content';

export interface RecommendationEvent {
  eventType: RecommendationEventType;
  targetType: RecommendationTargetType;
  restaurantId: string | null;
  itemId: string | null;
  contentId: string | null;
  occurredAt: string;
}

export interface FeedConfig {
  moduleKey: string;
  enabled: boolean;
  sortOrder: number;
  maxItems: number;
  requiredEntitlement: string | null;
  settings: Record<string, unknown>;
}

export interface CuratedFeedContent {
  id: string;
  slug: string;
  eyebrow: string | null;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  destinationType: 'external_url' | 'restaurant' | 'item' | 'challenge' | 'explore';
  externalUrl: string | null;
  restaurantId: string | null;
  itemId: string | null;
  challengeId: string | null;
  attribution: string | null;
  sortPriority: number;
}

export interface FeedItemRecommendation {
  kind: 'item';
  key: string;
  item: SearchIndexEntry;
  restaurant: Restaurant;
  reason: string;
  distanceMiles: number | null;
}

export interface FeedChallengeRecommendation {
  kind: 'challenge';
  key: string;
  definition: ChallengeDefinition;
  progress: ChallengeProgress;
  reason: string;
}

export interface FeedContentRecommendation {
  kind: 'content';
  key: string;
  content: CuratedFeedContent;
}

export type FeedRecommendation =
  | FeedItemRecommendation
  | FeedChallengeRecommendation
  | FeedContentRecommendation;

export interface FeedModule {
  key: string;
  title: string;
  subtitle: string | null;
  sortOrder: number;
  items: FeedRecommendation[];
}
