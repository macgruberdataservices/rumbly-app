import { useCallback, useMemo, useState } from 'react';
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
import type { Coordinates } from '../../location/proximity';
import { formatProximityDistance } from '../../location/proximity';
import { loadSearchIndex } from '../../search/searchIndexLoader';
import { buildFindFeed } from '../../recommendations/engine';
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
import type { SearchIndexEntry } from '../../data/types';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

interface Props {
  origin: Coordinates | null;
  onOpenItem: (item: SearchIndexEntry) => void;
  onOpenRestaurant: (restaurantId: string) => void;
  onOpenChallenge: (challengeId: string) => void;
  onOpenExplore: () => void;
}

const EMPTY_REMOTE: RemoteFeedData = { configs: [], content: [], events: [] };

function FeedItemCard({
  recommendation,
  moduleKey,
  onPress,
}: {
  recommendation: FeedItemRecommendation;
  moduleKey: string;
  onPress: () => void;
}) {
  const imageUrl = recommendation.restaurant.detail_image_url
    ?? recommendation.restaurant.list_image_url;
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
      <View style={[
        styles.itemArtwork,
        moduleKey === 'new_at_loved' && styles.itemArtworkGold,
        moduleKey === 'seasonal' && styles.itemArtworkSeasonal,
      ]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.itemImage} resizeMode="cover" />
        ) : (
          <View style={styles.itemPlaceholder}>
            <Text style={styles.placeholderMark}>
              {recommendation.restaurant.restaurant.slice(0, 1).toLocaleUpperCase()}
            </Text>
            <Text style={styles.placeholderCategory} numberOfLines={1}>
              {recommendation.item.category}
            </Text>
          </View>
        )}
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
  onPress,
}: {
  recommendation: FeedContentRecommendation;
  onPress: () => void;
}) {
  const { content } = recommendation;
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
        <View style={styles.contentPlaceholder}>
          <Text style={styles.contentPlaceholderMark}>✦</Text>
        </View>
      )}
      <View style={styles.contentCopy}>
        {content.eyebrow && <Text style={styles.eyebrow}>{content.eyebrow.toUpperCase()}</Text>}
        <Text style={styles.contentTitle}>{content.title}</Text>
        {content.summary && <Text style={styles.contentSummary}>{content.summary}</Text>}
        <View style={styles.contentFooter}>
          {content.attribution && <Text style={styles.attribution}>{content.attribution}</Text>}
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
  const { restaurants } = useDataProvider();
  const { personalActivity, isActivityReady } = useActivity();
  const { user } = useAuth();
  const { isEnabled: isEntitled } = useEntitlements();
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[]>([]);
  const [remote, setRemote] = useState<RemoteFeedData>(EMPTY_REMOTE);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([
        loadSearchIndex(),
        loadRemoteFeedData(user?.id ?? null).catch((error) => {
          console.warn('Find feed remote data failed:', error);
          return EMPTY_REMOTE;
        }),
      ]).then(([index, nextRemote]) => {
        if (cancelled) return;
        setSearchIndex(index);
        setRemote(nextRemote);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  const modules = useMemo(
    () => buildFindFeed({
      restaurants,
      searchIndex,
      activity: personalActivity,
      events: remote.events,
      content: remote.content,
      configs: remote.configs,
      origin,
      isEntitled,
    }),
    [
      isEntitled,
      origin,
      personalActivity,
      remote.configs,
      remote.content,
      remote.events,
      restaurants,
      searchIndex,
    ]
  );

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

  if ((loading || !isActivityReady) && modules.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.forest} />
        <Text style={text.bodyMuted}>Building your feed…</Text>
      </View>
    );
  }
  if (modules.length === 0) return null;

  return (
    <View style={styles.feed}>
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
                      moduleKey={module.key}
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
  },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontFamily: FONT_FAMILY.besleyBold,
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
    paddingRight: SPACING.lg,
  },
  featureBody: { marginTop: SPACING.md },
  itemCard: {
    width: 214,
    minHeight: 262,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
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
    backgroundColor: COLORS.pineLight,
  },
  itemArtworkGold: { backgroundColor: '#F7DCA6' },
  itemArtworkSeasonal: { backgroundColor: '#DDEDE3' },
  itemImage: { width: '100%', height: '100%' },
  itemPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  placeholderMark: {
    fontFamily: FONT_FAMILY.besleyBold,
    fontSize: 42,
    color: COLORS.ink,
    opacity: 0.72,
  },
  placeholderCategory: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: COLORS.ink,
    opacity: 0.72,
    marginTop: -4,
    textTransform: 'uppercase',
  },
  distancePill: {
    position: 'absolute',
    right: SPACING.sm,
    bottom: SPACING.sm,
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
    color: COLORS.forest,
    textTransform: 'uppercase',
  },
  cardChevron: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 22,
    lineHeight: 20,
    color: COLORS.forest,
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
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  contentImage: { width: '100%', height: 142, backgroundColor: COLORS.cream },
  contentPlaceholder: {
    height: 142,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pineLight,
  },
  contentPlaceholderMark: {
    fontFamily: FONT_FAMILY.besleyBold,
    fontSize: 44,
    color: COLORS.ink,
    opacity: 0.68,
  },
  contentCopy: { flex: 1, padding: SPACING.md },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    color: COLORS.forest,
  },
  contentTitle: {
    fontFamily: FONT_FAMILY.besleyBold,
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
    color: COLORS.forest,
  },
  pressed: { backgroundColor: COLORS.goldLight },
  cardPressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
