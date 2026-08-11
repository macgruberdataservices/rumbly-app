import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChallengeSummaryCard } from '../challenges/ChallengeSummaryCard';
import { useActivity } from '../../hooks/useActivity';
import { useAuth } from '../../hooks/useAuth';
import { useDataProvider } from '../../hooks/useDataProvider';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useAppSettings } from '../../hooks/useAppSettings';
import { daysAgoStr, loadChangesForRange, todayStr } from '../../data/changes';
import type { Coordinates } from '../../location/proximity';
import { formatProximityDistance } from '../../location/proximity';
import { loadSearchIndex } from '../../search/searchIndexLoader';
import { scheduleAfterNavigation, scheduleChunk } from '../../navigation/scheduleAfterNavigation';
import { PERF, perfNow, recordPerfSample } from '../../perf/perfLog';
import { buildFindFeedSteps } from '../../recommendations/engine';
import {
  loadRemoteFeedData,
  recordRecommendationEvent,
  type RemoteFeedData,
} from '../../recommendations/remote';
import type {
  CuratedFeedContent,
  FeedContentRecommendation,
  FeedItemRecommendation,
  FeedModule,
} from '../../recommendations/types';
import type { ChangeEvent, SearchIndexEntry } from '../../data/types';
import { IllustrationSlot } from '../illustrations/IllustrationSlot';
import { illustrationTagForMenuItem } from '../../illustrations/catalog';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

interface Props {
  origin: Coordinates | null;
  onOpenItem: (item: SearchIndexEntry) => void;
  onOpenRestaurant: (restaurantId: string) => void;
  onOpenChallenge: (challengeId: string) => void;
  onOpenExplore: () => void;
}

const EMPTY_REMOTE: RemoteFeedData = { configs: [], content: [], events: [] };
const DEFAULT_FEED_REFRESH_MINUTES = 60;

// How long the feed build may hold the thread before yielding. Chosen under a
// 16.7ms frame: chunks are sized so at least one usually fits, and exceeding
// it costs a frame, not a stall. The engine also yields at finer granularity
// than this, so the budget -- not the rail boundaries -- is what bounds a
// pause on a slow device.
const FEED_FRAME_BUDGET_MS = 12;

interface CachedFeedData {
  searchIndex: SearchIndexEntry[];
  remote: RemoteFeedData;
  changes: ChangeEvent[];
  loadedAt: number;
  dataVersion: number | null;
}

const feedDataCache = new Map<string, CachedFeedData>();

function feedRefreshIntervalMs(remote: RemoteFeedData): number {
  const configured = remote.configs
    .find((config) => config.moduleKey === 'find_feed')
    ?.settings.refresh_interval_minutes;
  const minutes =
    typeof configured === 'number' && Number.isFinite(configured)
      ? Math.max(15, Math.min(configured, 24 * 60))
      : DEFAULT_FEED_REFRESH_MINUTES;
  return minutes * 60_000;
}

function FeedItemCard({
  recommendation,
  onPress,
}: {
  recommendation: FeedItemRecommendation;
  onPress: () => void;
}) {
  const venueImageUrl = recommendation.restaurant.detail_image_url
    ?? recommendation.restaurant.list_image_url;
  const artworkTag = illustrationTagForMenuItem(
    recommendation.item.category,
    recommendation.item.item
  );
  const meta = [
    recommendation.item.category,
    recommendation.item.price_display,
  ].filter(Boolean);
  const distance = recommendation.distanceMiles === null
    ? null
    : formatProximityDistance(recommendation.distanceMiles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        recommendation.item.item,
        ...meta,
        recommendation.reason,
      ].join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.itemCard, pressed && styles.cardPressed]}
    >
      <View style={styles.itemArtwork}>
        <IllustrationSlot tagId={artworkTag} style={styles.artworkSlot} />
        <View style={styles.venueMarker}>
          <Text style={styles.venueMarkerLabel}>VENUE</Text>
          {venueImageUrl ? (
            <Image source={{ uri: venueImageUrl }} style={styles.venueImage} resizeMode="cover" />
          ) : (
            <View style={[styles.venueImage, styles.venueInitial]}>
              <Text style={styles.venueInitialText}>
                {recommendation.restaurant.restaurant.slice(0, 1).toLocaleUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {distance && (
          <View style={styles.distancePill}>
            <Text style={styles.distanceLabel}>{distance}</Text>
          </View>
        )}
      </View>
      <View style={styles.itemCopy}>
        <Text style={styles.reason} numberOfLines={1}>{recommendation.reason}</Text>
        <Text style={styles.itemTitle} numberOfLines={2}>{recommendation.item.item}</Text>
        <Text style={styles.restaurantName} numberOfLines={1}>
          {recommendation.restaurant.restaurant}
        </Text>
        <View style={styles.itemFooter}>
          <Text style={styles.itemMeta} numberOfLines={1}>{meta.join(' · ')}</Text>
          <Text style={styles.cardChevron}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ContentCard({
  recommendation,
  previewMode,
  onPress,
}: {
  recommendation: FeedContentRecommendation;
  previewMode: boolean;
  onPress: () => void;
}) {
  const { content } = recommendation;
  const now = Date.now();
  const startsAt = Date.parse(content.startsAt);
  const endsAt = content.endsAt ? Date.parse(content.endsAt) : null;
  const previewStatus =
    content.contentState === 'inactive' || content.contentState === 'waiting'
      ? content.contentState.toLocaleUpperCase()
      : startsAt > now
        ? 'SCHEDULED'
        : endsAt !== null && endsAt <= now
          ? 'EXPIRED'
          : 'LIVE';
  return (
    <Pressable
      accessibilityRole={content.destinationType === 'external_url' ? 'link' : 'button'}
      accessibilityLabel={[content.title, content.summary, content.attribution].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.contentCard, pressed && styles.cardPressed]}
    >
      {content.imageUrl && (
        <Image source={{ uri: content.imageUrl }} style={styles.contentImage} resizeMode="cover" />
      )}
      {!content.imageUrl && (
        <IllustrationSlot
          tagId="find.editorial.feature-card.v1"
          style={styles.contentPlaceholder}
        />
      )}
      {previewMode && (
        <View style={[
          styles.previewStatusPill,
          previewStatus === 'LIVE' && styles.previewStatusPillLive,
        ]}>
          <Text style={styles.previewStatusText}>{previewStatus}</Text>
        </View>
      )}
      <View style={styles.contentCopy}>
        {content.eyebrow && (
          <Text style={styles.eyebrow} numberOfLines={1}>
            {content.eyebrow.toUpperCase()}
          </Text>
        )}
        <Text style={styles.contentTitle} numberOfLines={2} ellipsizeMode="tail">
          {content.title}
        </Text>
        {content.summary && (
          <Text style={styles.contentSummary} numberOfLines={3} ellipsizeMode="tail">
            {content.summary}
          </Text>
        )}
        <View style={styles.contentFooter}>
          {content.attribution && (
            <Text style={styles.attribution} numberOfLines={1}>
              {content.attribution}
            </Text>
          )}
          <Text style={styles.openLabel}>
            {content.destinationType === 'external_url' ? 'OPEN ↗' : 'OPEN ›'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function FindFeed({
  origin,
  onOpenItem,
  onOpenRestaurant,
  onOpenChallenge,
  onOpenExplore,
}: Props) {
  const { restaurants, lastSyncedAt } = useDataProvider();
  const { personalActivity, isActivityReady } = useActivity();
  const { user } = useAuth();
  const { isEnabled: isEntitled } = useEntitlements();
  const { findFeedContentMode } = useAppSettings();
  const isContentAdmin = isEntitled('content_admin');
  const previewMode = isContentAdmin && findFeedContentMode === 'preview';
  const cacheKey = `${user?.id ?? 'anonymous'}:${previewMode ? 'preview' : 'live'}`;
  const initialCached = feedDataCache.get(cacheKey);
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[]>(
    () => initialCached?.searchIndex ?? []
  );
  const [remote, setRemote] = useState<RemoteFeedData>(
    () => initialCached?.remote ?? EMPTY_REMOTE
  );
  const [changes, setChanges] = useState<ChangeEvent[]>(
    () => initialCached?.changes ?? []
  );
  const [loading, setLoading] = useState(!initialCached);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const cached = feedDataCache.get(cacheKey);
      if (cached) {
        setSearchIndex(cached.searchIndex);
        setRemote(cached.remote);
        setChanges(cached.changes);
        setLoading(false);
      }
      const cacheIsFresh =
        cached
        && cached.dataVersion === lastSyncedAt
        && Date.now() - cached.loadedAt < feedRefreshIntervalMs(cached.remote);
      if (cacheIsFresh) {
        return () => {
          cancelled = true;
        };
      }
      setLoading(!cached);
      // Deferred off the first-paint path. loadSearchIndex() JSON.parses
      // search_index.json -- ~31k entries, 16.6MB after the import-time
      // dedupe -- and JSON.parse is synchronous, so it blocks the JS thread
      // outright: no taps, no tab switches, no scrolling until it returns.
      // This effect is the app's first focus effect on the default tab, so
      // that block used to land squarely on cold launch and on every
      // foreground that had lost the module cache. Yielding until
      // interactions settle lets the tab bar and the rest of Find paint and
      // become responsive first; the feed then fills in behind its own
      // existing loading state, which is exactly what that state is for.
      const cancelScheduledLoad = scheduleAfterNavigation(() => {
        Promise.all([
          loadSearchIndex(),
          // Remote editorial content must never take the local personalized
          // feed down with it. A stale/future JWT or temporary Supabase
          // outage used to reject this entire Promise.all, discarding the
          // successfully loaded local search index and leaving only the
          // challenge module (the one module that needs neither source).
          loadRemoteFeedData(user?.id ?? null, previewMode ? 'preview' : 'live')
            .catch((error) => {
              console.warn('Find feed remote content refresh failed:', error);
              return cached?.remote ?? EMPTY_REMOTE;
            }),
          loadChangesForRange(daysAgoStr(30), todayStr()).catch((error) => {
            console.warn('Find feed change log failed:', error);
            return cached?.changes ?? [] as ChangeEvent[];
          }),
        ])
          .then(([index, nextRemote, nextChanges]) => {
            if (cancelled) return;
            const nextCached: CachedFeedData = {
              searchIndex: index,
              remote: nextRemote,
              changes: nextChanges,
              loadedAt: Date.now(),
              dataVersion: lastSyncedAt,
            };
            feedDataCache.set(cacheKey, nextCached);
            setSearchIndex(index);
            setRemote(nextRemote);
            setChanges(nextChanges);
            setLoading(false);
          })
          .catch((error) => {
            if (cancelled) return;
            console.warn('Find feed data refresh failed:', error);
            setLoading(false);
          });
      });
      return () => {
        cancelled = true;
        cancelScheduledLoad();
      };
    }, [cacheKey, lastSyncedAt, previewMode, user?.id])
  );

  const visibleContent = useMemo(
    () => previewMode
      ? remote.content
      : remote.content.filter(
        (content) => !content.requiredEntitlement || isEntitled(content.requiredEntitlement)
      ),
    [isEntitled, previewMode, remote.content]
  );

  // Built across frames rather than in one go. As a useMemo this ran
  // synchronously during render and measured ~1,980ms on device -- long
  // enough to swallow a tap or a keystroke outright, which is the whole
  // reason the app felt like it hung on launch and when returning to Find.
  //
  // The engine yields between rails (and mid-rail for the expensive one), so
  // this pumps it: run steps until the frame budget is spent, hand the thread
  // back, resume on the next tick. Rails appear progressively as they finish,
  // which is why partial results are rendered rather than held back -- the
  // feed filling in top-down reads far better than a spinner, and the search
  // field above it stays live throughout either way.
  const [modules, setModules] = useState<FeedModule[]>([]);

  useEffect(() => {
    let cancelled = false;
    const steps = buildFindFeedSteps({
      restaurants,
      searchIndex,
      activity: personalActivity,
      events: remote.events,
      changes,
      content: visibleContent,
      configs: remote.configs,
      origin,
      isEntitled,
    });
    let totalMs = 0;
    let renderedCount = -1;

    const pump = () => {
      if (cancelled) return;
      const budgetStartedAt = perfNow();
      let latest: FeedModule[] = [];
      let done = false;

      do {
        const stepStartedAt = perfNow();
        const step = steps.next();
        const stepMs = perfNow() - stepStartedAt;
        totalMs += stepMs;
        // Branch on step.done directly so the iterator result narrows -- the
        // yielded step and the final return are different shapes.
        if (step.done) {
          done = true;
          latest = step.value;
          recordPerfSample(PERF.feedChunk, stepMs, 'final');
        } else {
          latest = step.value.modules;
          recordPerfSample(PERF.feedChunk, stepMs, step.value.label);
        }
      } while (!done && perfNow() - budgetStartedAt < FEED_FRAME_BUDGET_MS);

      // Only re-render when a rail actually landed. Every chunk yields a
      // result, but most add nothing, and re-rendering the feed for each
      // would hand back a good part of what the chunking just bought.
      if (done || latest.length !== renderedCount) {
        renderedCount = latest.length;
        setModules(latest);
      }

      if (done) {
        recordPerfSample(PERF.feedBuild, totalMs, `${searchIndex.length} entries`);
        return;
      }
      cancelPump = scheduleChunk(pump);
    };

    let cancelPump = scheduleChunk(pump);
    return () => {
      cancelled = true;
      cancelPump();
    };
  }, [
    changes,
    isEntitled,
    origin,
    personalActivity,
    remote.configs,
    remote.events,
    restaurants,
    searchIndex,
    visibleContent,
  ]);

  const trackOpen = useCallback(
    (event: Parameters<typeof recordRecommendationEvent>[1]) => {
      void recordRecommendationEvent(user?.id ?? null, event);
    },
    [user?.id]
  );

  const openContent = useCallback(
    (content: CuratedFeedContent) => {
      const baseEvent = {
        targetType: 'content' as const,
        contentId: content.id,
        restaurantId: content.restaurantId,
        itemId: content.itemId,
        context: { source: 'find_feed', slug: content.slug },
      };
      if (content.destinationType === 'external_url' && content.externalUrl) {
        trackOpen({ ...baseEvent, eventType: 'external_open' });
        Linking.openURL(content.externalUrl).catch(() => {});
        return;
      }
      trackOpen({ ...baseEvent, eventType: 'feed_open' });
      if (content.destinationType === 'item' && content.restaurantId && content.itemId) {
        const item = searchIndex.find(
          (candidate) =>
            candidate.restaurant_id === content.restaurantId
            && candidate.item_id === content.itemId
        );
        if (item) onOpenItem(item);
        return;
      }
      if (content.destinationType === 'restaurant' && content.restaurantId) {
        onOpenRestaurant(content.restaurantId);
        return;
      }
      if (content.destinationType === 'challenge' && content.challengeId) {
        onOpenChallenge(content.challengeId);
        return;
      }
      if (content.destinationType === 'explore') onOpenExplore();
    },
    [onOpenChallenge, onOpenExplore, onOpenItem, onOpenRestaurant, searchIndex, trackOpen]
  );

  // Do not render the challenge-only intermediate state while the local
  // index is still loading. It reads as if the rest of the feed vanished.
  if ((loading && searchIndex.length === 0) || !isActivityReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.forest} />
        <Text style={text.bodyMuted}>Feeding your Feed…</Text>
      </View>
    );
  }
  if (modules.length === 0) return null;

  return (
    <View style={styles.feed}>
      {previewMode && (
        <View style={styles.previewBanner} accessibilityRole="alert">
          <Text style={styles.previewBannerTitle}>CONTENT PREVIEW</Text>
          <Text style={styles.previewBannerCopy}>
            Unpublished and inactive cards are visible on this device.
          </Text>
        </View>
      )}
      {modules.map((module: FeedModule, moduleIndex) => (
        <View
          key={module.key}
          style={[styles.module, moduleIndex === 0 && styles.firstModule]}
        >
          <View style={styles.sectionHeading}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>{module.title}</Text>
              {module.subtitle && <Text style={styles.sectionSubtitle}>{module.subtitle}</Text>}
            </View>
          </View>
          {module.key === 'continue_challenge' ? (
            <View style={styles.featureBody}>
            {module.items.map((recommendation) => {
              if (recommendation.kind === 'challenge') {
                return (
                  <View key={recommendation.key}>
                    <ChallengeSummaryCard
                      definition={recommendation.definition}
                      progress={recommendation.progress}
                      compact
                      onPress={() => {
                        trackOpen({
                          eventType: 'feed_open',
                          targetType: 'challenge',
                          context: {
                            source: 'find_feed',
                            module: module.key,
                            challenge_id: recommendation.definition.id,
                          },
                        });
                        onOpenChallenge(recommendation.definition.id);
                      }}
                    />
                    <Text style={styles.challengeReason}>{recommendation.reason}</Text>
                  </View>
                );
              }
              return null;
            })}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
              decelerationRate={0.995}
              directionalLockEnabled
              alwaysBounceHorizontal={module.items.length > 1}
            >
              {module.items.map((recommendation) => {
                if (recommendation.kind === 'item') {
                  return (
                    <FeedItemCard
                      key={recommendation.key}
                      recommendation={recommendation}
                      onPress={() => {
                        trackOpen({
                          eventType: 'feed_open',
                          targetType: 'item',
                          restaurantId: recommendation.item.restaurant_id,
                          itemId: recommendation.item.item_id,
                          context: { source: 'find_feed', module: module.key },
                        });
                        onOpenItem(recommendation.item);
                      }}
                    />
                  );
                }
                if (recommendation.kind === 'content') {
                  return (
                    <ContentCard
                      key={recommendation.key}
                      recommendation={recommendation}
                      previewMode={previewMode}
                      onPress={() => openContent(recommendation.content)}
                    />
                  );
                }
                return null;
              })}
            </ScrollView>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  feed: { paddingTop: SPACING.sm, paddingBottom: SPACING.xxl },
  previewBanner: {
    borderWidth: 1,
    borderColor: '#D09B2D',
    borderRadius: RADII.md,
    backgroundColor: '#FFF4D6',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
  previewBannerTitle: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#76500D',
  },
  previewBannerCopy: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 11,
    lineHeight: 15,
    color: '#76500D',
    marginTop: 2,
  },
  loading: {
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  module: { marginTop: SPACING.xxl },
  firstModule: { marginTop: SPACING.sm },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 21,
    color: COLORS.ink,
  },
  sectionSubtitle: {
    ...text.bodyMuted,
    marginTop: 2,
  },
  rail: {
    gap: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },
  featureBody: {
    marginTop: SPACING.md,
    marginHorizontal: SPACING.lg,
  },
  itemCard: {
    width: 214,
    minHeight: 262,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  itemArtwork: {
    height: 126,
    overflow: 'hidden',
    backgroundColor: DAYLIGHT.sky,
  },
  artworkSlot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 0,
  },
  venueMarker: {
    position: 'absolute',
    right: SPACING.sm,
    bottom: SPACING.sm,
    alignItems: 'center',
  },
  venueMarkerLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 7,
    letterSpacing: 0.7,
    color: COLORS.ink,
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: -3,
    zIndex: 1,
  },
  venueImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  venueInitial: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cream,
  },
  venueInitialText: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 20,
    color: COLORS.ink,
  },
  distancePill: {
    position: 'absolute',
    right: SPACING.sm,
    top: SPACING.sm,
    borderRadius: RADII.sm,
    backgroundColor: 'rgba(32, 42, 46, 0.86)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  distanceLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 10,
    color: COLORS.surface,
  },
  itemCopy: { flex: 1, padding: SPACING.md },
  itemTitle: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 16,
    lineHeight: 19,
    color: COLORS.ink,
    marginTop: 4,
  },
  restaurantName: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.muted,
    marginTop: 3,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginTop: 'auto',
    paddingTop: SPACING.sm,
  },
  itemMeta: {
    flex: 1,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 11,
    color: COLORS.muted,
  },
  reason: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.25,
    color: DAYLIGHT.ocean,
    textTransform: 'uppercase',
  },
  cardChevron: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 22,
    lineHeight: 20,
    color: DAYLIGHT.ocean,
  },
  challengeReason: {
    ...text.bodyMuted,
    color: COLORS.forest,
    marginTop: SPACING.xs,
  },
  contentCard: {
    width: 258,
    minHeight: 280,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  contentImage: { width: '100%', height: 142, backgroundColor: COLORS.cream },
  contentPlaceholder: {
    width: '100%',
    height: 142,
    minHeight: 142,
    borderRadius: 0,
  },
  previewStatusPill: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    borderRadius: RADII.sm,
    backgroundColor: '#7D5310',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  previewStatusPillLive: {
    backgroundColor: COLORS.forest,
  },
  previewStatusText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: COLORS.surface,
  },
  contentCopy: { flex: 1, padding: SPACING.md },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    color: DAYLIGHT.ocean,
  },
  contentTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 18,
    color: COLORS.ink,
    marginTop: 2,
  },
  contentSummary: {
    ...text.bodyMuted,
    marginTop: SPACING.xs,
  },
  contentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  attribution: {
    ...text.bodyMuted,
    flex: 1,
  },
  openLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    color: DAYLIGHT.ocean,
  },
  pressed: { backgroundColor: COLORS.goldLight },
  cardPressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
