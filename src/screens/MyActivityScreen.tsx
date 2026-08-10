import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { scheduleAfterNavigation } from '../navigation/scheduleAfterNavigation';
import type { PersonalActivityEvent } from '../data/activity';
import type { Restaurant, SearchIndexEntry } from '../data/types';
import { restaurantLocationLabel } from '../data/locationNames';
import { loadSearchIndex } from '../search/searchIndexLoader';
import { useActivity } from '../hooks/useActivity';
import { useAuth } from '../hooks/useAuth';
import { useDataProvider } from '../hooks/useDataProvider';
import { useEntitlement } from '../hooks/useEntitlement';
import { registerSwipeableOpen, unregisterSwipeable, closeOpenSwipeable } from '../components/swipeableCoordinator';
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'MyActivity'>;
type CollectionTab = 'love' | 'need' | 'history';

function eventKey(event: PersonalActivityEvent): string {
  return `${event.restaurantId}:${event.itemId ?? ''}`;
}

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function restaurantLocation(restaurant: Restaurant | undefined): string {
  if (!restaurant) return '';
  return restaurantLocationLabel(restaurant);
}

export function MyActivityScreen({ navigation }: Props) {
  const { restaurants } = useDataProvider();
  const { user, initializing } = useAuth();
  const needItEnabled = useEntitlement('need_it');
  const {
    personalActivity,
    isActivityReady,
    reloadActivity,
    toggleLove,
    toggleRestaurantNeedIt,
    toggleItemLove,
    toggleItemNeedIt,
  } = useActivity();
  const [activeTab, setActiveTab] = useState<CollectionTab>('love');
  const [itemByKey, setItemByKey] = useState<Map<string, SearchIndexEntry>>(new Map());
  const activityRefreshScheduledAt = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - activityRefreshScheduledAt.current < 5_000) return;
      activityRefreshScheduledAt.current = now;
      return scheduleAfterNavigation(() => {
        reloadActivity().catch((error) => console.warn('My Rumbly refresh failed:', error));
      });
    }, [reloadActivity])
  );

  useEffect(() => {
    let cancelled = false;
    loadSearchIndex().then((items) => {
      if (cancelled) return;
      setItemByKey(new Map(items.map((item) => [`${item.restaurant_id}:${item.item_id}`, item])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!needItEnabled && activeTab === 'need') setActiveTab('love');
  }, [activeTab, needItEnabled]);

  const restaurantById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant])),
    [restaurants]
  );
  const lovedEvents = useMemo(
    () =>
      [...personalActivity.lovedRestaurants, ...personalActivity.lovedItems].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
    [personalActivity]
  );
  const neededEvents = useMemo(
    () =>
      [...personalActivity.neededRestaurants, ...personalActivity.neededItems].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
    [personalActivity]
  );
  const visibleEvents =
    activeTab === 'love'
      ? lovedEvents
      : activeTab === 'need'
        ? neededEvents
        : personalActivity.gotItHistory;
  const loveCount = lovedEvents.length;
  const needCount = neededEvents.length;

  // Swipe-to-remove (owner request, 2026-07-23): Love It and Need It are
  // both simple toggles at the data layer (activity.ts), so "remove" here
  // is just re-toggling the event that's already known to be active --
  // no separate delete path needed. Got It history is left alone; those
  // are timestamped visit records, not a saved list to prune from here.
  const removeFromCollection = useCallback(
    (event: PersonalActivityEvent, collection: 'love' | 'need') => {
      const title = event.itemId ? itemByKey.get(eventKey(event))?.item : restaurantById.get(event.restaurantId)?.restaurant;
      Alert.alert(
        collection === 'love' ? 'Remove from Love It?' : 'Remove from Need It?',
        title ? `"${title}" will be removed from your ${collection === 'love' ? 'Love It' : 'Need It'} list.` : undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              if (collection === 'need') {
                if (event.itemId) {
                  await toggleItemNeedIt(event.restaurantId, event.itemId);
                } else {
                  await toggleRestaurantNeedIt(event.restaurantId);
                }
              } else if (event.itemId) {
                await toggleItemLove(event.restaurantId, event.itemId);
              } else {
                await toggleLove(event.restaurantId);
              }
              reloadActivity().catch((error) => console.warn('My Rumbly refresh failed:', error));
            },
          },
        ]
      );
    },
    [
      itemByKey,
      reloadActivity,
      restaurantById,
      toggleItemLove,
      toggleItemNeedIt,
      toggleLove,
      toggleRestaurantNeedIt,
    ]
  );

  const openEvent = (event: PersonalActivityEvent) => {
    const item = event.itemId ? itemByKey.get(eventKey(event)) : undefined;
    navigation.navigate('RestaurantDetail', {
      restaurantId: event.restaurantId,
      itemId: event.itemId ?? undefined,
      period: item?.dining_period,
      category: item?.category,
    });
  };

  if (initializing || !isActivityReady) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={closeOpenSwipeable}
      >
        <View style={styles.headingRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to My Rumbly"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headingCopy}>
            <Text style={styles.heading}>Personal Activity</Text>
            <Text style={text.bodyMuted}>{user?.email ?? 'Saved on this device'}</Text>
          </View>
        </View>

        <View style={styles.statsBand}>
          <Stat value={loveCount} label="Love It" />
          <Stat value={needCount} label="Need It" />
          <Stat value={personalActivity.totalGotItCount} label="Got It" />
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <CollectionTabButton label="Love It" active={activeTab === 'love'} onPress={() => setActiveTab('love')} />
          {needItEnabled && (
            <CollectionTabButton label="Need It" active={activeTab === 'need'} onPress={() => setActiveTab('need')} />
          )}
          <CollectionTabButton
            label="History"
            active={activeTab === 'history'}
            onPress={() => setActiveTab('history')}
          />
        </View>

        <View style={styles.collectionSection}>
          <Text style={styles.collectionTitle}>
            {activeTab === 'love' ? 'Things you love' : activeTab === 'need' ? 'Your Need It list' : 'Your history'}
          </Text>
          {visibleEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <IllustrationSlot
                tagId="activity.state.empty.v1"
                variant="artwork"
                style={styles.emptyArt}
              />
              <Text style={text.bodyMuted}>
                {activeTab === 'love'
                  ? 'Restaurants and menu items you Love will appear here.'
                  : activeTab === 'need'
                    ? 'Menu items you Need will appear here.'
                    : 'Each Got It tap will appear here with its date and rating.'}
              </Text>
            </View>
          ) : (
            visibleEvents.map((event) => (
              <ActivityRow
                key={event.clientId}
                event={event}
                restaurant={restaurantById.get(event.restaurantId)}
                item={event.itemId ? itemByKey.get(eventKey(event)) : undefined}
                showDate={activeTab === 'history'}
                onPress={() => openEvent(event)}
                onRemove={
                  activeTab === 'love' || activeTab === 'need'
                    ? () => removeFromCollection(event, activeTab)
                    : undefined
                }
              />
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CollectionTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ActivityRow({
  event,
  restaurant,
  item,
  showDate,
  onPress,
  onRemove,
}: {
  event: PersonalActivityEvent;
  restaurant: Restaurant | undefined;
  item: SearchIndexEntry | undefined;
  showDate: boolean;
  onPress: () => void;
  onRemove: (() => void) | undefined;
}) {
  const title = event.itemId ? item?.item ?? 'Menu item no longer listed' : restaurant?.restaurant ?? 'Restaurant';
  const meta = event.itemId ? restaurant?.restaurant ?? event.restaurantId : restaurantLocation(restaurant);
  const swipeableRef = useRef<Swipeable>(null);

  const row = (
    <Pressable style={({ pressed }) => [styles.activityRow, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.rowCopy}>
        <Text style={text.restaurantName} numberOfLines={1}>{title}</Text>
        {!!meta && <Text style={text.bodyMuted} numberOfLines={1}>{meta}</Text>}
        {showDate && <Text style={styles.eventDate}>{formatEventDate(event.occurredAt)}</Text>}
      </View>
      {showDate && event.rating !== null ? (
        <Text style={styles.rating} accessibilityLabel={`${event.rating} out of 5 stars`}>
          {'★'.repeat(Math.round(event.rating))}
        </Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );

  if (!onRemove) return row;

  return (
    <Swipeable
      ref={swipeableRef}
      // Left actions (reveal on a rightward drag), not right actions like
      // MenuItemRow/ItemResultRow's Need It/Got It/Love It reveal -- a
      // deliberately different gesture direction for a destructive,
      // single-purpose action so it doesn't read as "the same swipe" as
      // those.
      renderLeftActions={() => (
        <Pressable
          style={styles.deleteAction}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title}`}
          onPress={() => {
            swipeableRef.current?.close();
            onRemove();
          }}
        >
          <Text style={styles.deleteActionIcon}>🗑</Text>
        </Pressable>
      )}
      overshootLeft={false}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) registerSwipeableOpen(swipeableRef.current);
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) unregisterSwipeable(swipeableRef.current);
      }}
      containerStyle={styles.swipeableContainer}
    >
      {row}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: SPACING.xxl },
  headingRow: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: DAYLIGHT.paper },
  backIcon: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 34, lineHeight: 36, color: DAYLIGHT.ocean },
  headingCopy: { flex: 1, gap: 2 },
  heading: { fontFamily: FONT_FAMILY.piazzollaExtraBold, fontSize: 25, lineHeight: 30, color: DAYLIGHT.ink },
  statsBand: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.coral,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 23, color: DAYLIGHT.paper },
  statLabel: { fontFamily: FONT_FAMILY.workSansMedium, fontSize: 11, color: '#FFF4EA', marginTop: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADII.lg,
    padding: 3,
    backgroundColor: DAYLIGHT.sky,
  },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADII.md },
  tabActive: { backgroundColor: DAYLIGHT.ocean },
  tabLabel: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 12, color: COLORS.muted },
  tabLabelActive: { color: COLORS.surface },
  collectionSection: { marginTop: SPACING.lg },
  collectionTitle: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 17,
    color: COLORS.ink,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyState: { minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  emptyArt: { width: '100%', maxWidth: 280, minHeight: 160, marginBottom: SPACING.lg },
  activityRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  rowPressed: { backgroundColor: DAYLIGHT.sky },
  rowCopy: { flex: 1, minWidth: 0 },
  eventDate: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 11, color: COLORS.dim, marginTop: 2 },
  rating: { fontFamily: FONT_FAMILY.workSansMedium, fontSize: 12, color: DAYLIGHT.amberInk, marginLeft: SPACING.sm },
  chevron: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 25, color: DAYLIGHT.ocean, marginLeft: SPACING.sm },
  swipeableContainer: {
    overflow: 'visible',
  },
  // Literal red, not a token from COLORS -- this app's palette is
  // deliberately blue/gold with nothing destructive-red in it, but a
  // delete action reading as red is a near-universal convention worth
  // keeping regardless of brand palette.
  deleteAction: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0524B',
  },
  deleteActionIcon: {
    fontSize: 22,
  },
});
