import { publicSupabase, supabase } from '../data/supabaseClient';
import type {
  CuratedFeedContent,
  FeedConfig,
  RecommendationEvent,
  RecommendationEventType,
  RecommendationTargetType,
} from './types';

interface FeedConfigRow {
  module_key: string;
  enabled: boolean;
  sort_order: number;
  max_items: number;
  required_entitlement: string | null;
  settings: Record<string, unknown> | null;
}

interface FeedContentRow {
  id: string;
  slug: string;
  eyebrow: string | null;
  title: string;
  summary: string | null;
  image_url: string | null;
  destination_type: CuratedFeedContent['destinationType'];
  external_url: string | null;
  restaurant_id: string | null;
  item_id: string | null;
  challenge_id: string | null;
  attribution: string | null;
  sort_priority: number;
  required_entitlement: string | null;
  active: boolean;
  editorial_status: CuratedFeedContent['editorialStatus'];
  starts_at: string;
  ends_at: string | null;
}

interface RecommendationEventRow {
  event_type: RecommendationEventType;
  target_type: RecommendationTargetType;
  restaurant_id: string | null;
  item_id: string | null;
  content_id: string | null;
  occurred_at: string;
}

export interface RemoteFeedData {
  configs: FeedConfig[];
  content: CuratedFeedContent[];
  events: RecommendationEvent[];
}

export type FeedContentVisibility = 'live' | 'preview';

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadRemoteFeedData(
  userId: string | null,
  contentVisibility: FeedContentVisibility = 'live'
): Promise<RemoteFeedData> {
  const eventsQuery = userId
    ? supabase
        .from('recommendation_events')
        .select('event_type, target_type, restaurant_id, item_id, content_id, occurred_at')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(500)
    : Promise.resolve({ data: [] as RecommendationEventRow[], error: null });

  const nowIso = new Date().toISOString();
  // Published feed configuration/content are public through RLS and should
  // remain available even when a signed-in user's short-lived JWT needs
  // refreshing. Administrator preview still deliberately uses the
  // authenticated client because drafts are not public.
  const contentClient = contentVisibility === 'preview' ? supabase : publicSupabase;
  let contentQuery = contentClient
    .from('feed_content')
    .select(
      'id, slug, eyebrow, title, summary, image_url, destination_type, external_url, restaurant_id, item_id, challenge_id, attribution, sort_priority, required_entitlement, active, editorial_status, starts_at, ends_at'
    )
    .order('sort_priority', { ascending: false });

  // Content administrators can read every row through RLS so the dashboard can
  // edit drafts. Live mode adds the same visibility constraints normal users
  // receive from RLS; preview mode deliberately leaves those rows visible.
  if (contentVisibility === 'live') {
    contentQuery = contentQuery
      .eq('active', true)
      .eq('editorial_status', 'published')
      .lte('starts_at', nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  }

  const [configResult, contentResult, eventsResult] = await Promise.all([
    publicSupabase
      .from('feed_config')
      .select('module_key, enabled, sort_order, max_items, required_entitlement, settings')
      .order('sort_order'),
    contentQuery,
    eventsQuery,
  ]);

  if (configResult.error) throw new Error(configResult.error.message);
  if (contentResult.error) throw new Error(contentResult.error.message);
  // Recommendation history improves ranking but is not required to render
  // the feed. Local activity remains available when this authenticated
  // request fails, so do not discard public editorial content with it.
  if (eventsResult.error) {
    console.warn('Find feed recommendation history refresh failed:', eventsResult.error.message);
  }

  return {
    configs: ((configResult.data ?? []) as FeedConfigRow[]).map((row) => ({
      moduleKey: row.module_key,
      enabled: row.enabled,
      sortOrder: row.sort_order,
      maxItems: row.max_items,
      requiredEntitlement: row.required_entitlement,
      settings: row.settings ?? {},
    })),
    content: ((contentResult.data ?? []) as FeedContentRow[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      eyebrow: row.eyebrow,
      title: row.title,
      summary: row.summary,
      imageUrl: row.image_url,
      destinationType: row.destination_type,
      externalUrl: row.external_url,
      restaurantId: row.restaurant_id,
      itemId: row.item_id,
      challengeId: row.challenge_id,
      attribution: row.attribution,
      sortPriority: row.sort_priority,
      requiredEntitlement: row.required_entitlement,
      active: row.active,
      editorialStatus: row.editorial_status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
    events: ((eventsResult.error ? [] : eventsResult.data ?? []) as RecommendationEventRow[]).map((row) => ({
      eventType: row.event_type,
      targetType: row.target_type,
      restaurantId: row.restaurant_id,
      itemId: row.item_id,
      contentId: row.content_id,
      occurredAt: row.occurred_at,
    })),
  };
}

export async function recordRecommendationEvent(
  userId: string | null,
  event: {
    eventType: RecommendationEventType;
    targetType: RecommendationTargetType;
    restaurantId?: string | null;
    itemId?: string | null;
    contentId?: string | null;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  if (!userId) return;

  const { error } = await supabase.from('recommendation_events').insert({
    user_id: userId,
    client_id: generateClientId(),
    event_type: event.eventType,
    target_type: event.targetType,
    restaurant_id: event.restaurantId ?? null,
    item_id: event.itemId ?? null,
    content_id: event.contentId ?? null,
    context: event.context ?? {},
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('recommendation event failed:', error.message);
  }
}
