import { forwardRef, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { restaurantLocationLabel } from '../../data/locationNames';
import { formatProximityDistance } from '../../location/proximity';
import { useActivity } from '../../hooks/useActivity';
import { useEntitlement } from '../../hooks/useEntitlement';
import { HighlightedText } from '../HighlightedText';
import { ItemResultPreviewCard } from './ItemResultPreviewCard';
import { GotItRatingCard, type GotItCardEvent, type GotItCardOrigin } from '../GotItRatingCard';
import { registerSwipeableOpen, unregisterSwipeable, closeOpenSwipeable } from '../swipeableCoordinator';
import { isNewMenuItem } from '../../data/newItem';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Menu-item search result row per the search spec's utility hierarchy:
// item name, restaurant, location + price.
//
// Full interaction parity with MenuItemRow (owner decision 2026-07-20,
// after RestaurantCard/MenuItemRow's shared-Animated.Value peek pattern
// read as "feels native" -- see ROADMAP's "Reusable UI patterns" section):
// swipe-left reveals labeled Need It / Got It / Love It actions, long-press
// shows a grow-from-origin preview, both layered on top of the row's own
// existing tap-to-navigate (unlike MenuItemRow, which has no navigation
// target of its own). Activity now reflects this exact item
// (lovedItemKeys/needItItemKeys/gotItItemCounts, keyed by
// `${restaurant_id}:${item_id}`) rather than the parent restaurant's
// activity, which was only ever a stand-in from before item-level
// tracking existed (Milestone 13). `restaurant` is guaranteed non-null
// as of Milestone 6 — rank.ts skips any item whose restaurant isn't in
// the current (possibly filtered) restaurants set.
interface ItemResultRowProps {
  item: SearchIndexEntry;
  restaurant: Restaurant;
  highlightQuery?: string;
  distanceMiles?: number | null;
  onPress: () => void;
}

export const ItemResultRow = forwardRef<View, ItemResultRowProps>(function ItemResultRow(
  { item, restaurant, highlightQuery, distanceMiles, onPress },
  ref
) {
  const badges = [
    item.is_kids && 'Kids',
    item.is_allergy_friendly && 'Allergy-friendly',
    item.has_allergy_option && 'Allergy option available',
  ].filter(Boolean) as string[];

  const {
    lovedItemKeys,
    needItItemKeys,
    gotItItemCounts,
    toggleItemLove,
    toggleItemNeedIt,
    addItemGotIt,
    confirmGotIt,
    undoGotIt,
  } = useActivity();
  const needItEnabled = useEntitlement('need_it');
  const gotItEnabled = useEntitlement('got_it');
  const ratingsEnabled = useEntitlement('ratings');
  const key = `${item.restaurant_id}:${item.item_id}`;
  const isLoved = lovedItemKeys.has(key);
  const isNeeded = needItItemKeys.has(key);
  const gotItCount = gotItItemCounts.get(key) ?? 0;
  const hasActivity = isLoved || (needItEnabled && isNeeded) || (gotItEnabled && gotItCount > 0);
  const isNew = isNewMenuItem(item.first_seen);

  const swipeableRef = useRef<Swipeable>(null);
  const rowRef = useRef<View>(null);
  const gotItButtonRef = useRef<View>(null);
  // Merges this component's own measurement ref with the ref the parent
  // forwarded in (FindHomeScreen's attachFocusedResultRef, for Milestone
  // 7 accessibility-focus restoration) -- can't just read from the
  // external `ref` prop for measureInWindow below, since it may be a
  // callback ref with no `.current` to read from.
  const setRefs = (node: View | null) => {
    rowRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      (ref as React.MutableRefObject<View | null>).current = node;
    }
  };

  const [previewVisible, setPreviewVisible] = useState(false);
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);
  const [previewOrigin, setPreviewOrigin] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );

  // Same shared-value technique as MenuItemRow/RestaurantCard: one
  // Animated.Value drives shadow, scale, and the highlight together from
  // both press-in/out and swipe-drag-start/close.
  const shadowAnim = useRef(new Animated.Value(0)).current;
  const animateShadow = (toValue: number) => {
    Animated.timing(shadowAnim, { toValue, duration: 150, useNativeDriver: false }).start();
  };

  // Guards against a swiped-open row unmounting mid-swipe (e.g. filtered
  // out by a new search query without ever scrolling) -- otherwise the
  // coordinator's singleton keeps pointing at a dead Swipeable.
  useEffect(
    () => () => {
      if (swipeableRef.current) unregisterSwipeable(swipeableRef.current);
    },
    []
  );

  const confirmThenClose = async (toggle: () => Promise<void>) => {
    await toggle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn('haptics failed (native module may need a fresh build):', err)
    );
    setTimeout(() => swipeableRef.current?.close(), 350);
  };

  const measureGotItOrigin = (): Promise<GotItCardOrigin | null> =>
    new Promise((resolve) => {
      if (!gotItButtonRef.current) {
        resolve(null);
        return;
      }
      gotItButtonRef.current.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    });

  const openGotItCard = async () => {
    const origin = await measureGotItOrigin();
    const clientId = await addItemGotIt(item.restaurant_id, item.item_id);
    setGotItEvent({ clientId, targetName: item.item, count: gotItCount + 1, origin });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn('haptics failed (native module may need a fresh build):', err)
    );
    swipeableRef.current?.close();
  };

  const renderRightActions = () => (
    <View style={styles.actionsRow}>
      {needItEnabled && (
        <Pressable
          style={styles.actionButton}
          onPress={() => confirmThenClose(() => toggleItemNeedIt(item.restaurant_id, item.item_id))}
          accessibilityRole="button"
          accessibilityLabel={isNeeded ? 'Remove from Need It' : 'Add to Need It'}
          accessibilityState={{ selected: isNeeded }}
        >
          <View style={[styles.actionCircle, isNeeded && styles.actionCircleNeed]}>
            <Text style={[styles.actionGlyph, isNeeded && styles.actionGlyphActive]}>★</Text>
          </View>
          <Text style={styles.actionLabel}>Need It</Text>
        </Pressable>
      )}
      {gotItEnabled && (
        <Pressable
          ref={gotItButtonRef}
          style={styles.actionButton}
          onPress={openGotItCard}
          accessibilityRole="button"
          accessibilityLabel={gotItCount > 0 ? `Log Got It again, logged ${gotItCount} times` : 'Log Got It'}
        >
          <View style={[styles.actionCircle, gotItCount > 0 && styles.actionCircleGot]}>
            <Text style={[styles.actionGlyph, gotItCount > 0 && styles.actionGlyphActive]}>✓</Text>
            {gotItCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeLabel}>{gotItCount > 99 ? '99+' : gotItCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.actionLabel}>Got It</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.actionButton}
        onPress={() => confirmThenClose(() => toggleItemLove(item.restaurant_id, item.item_id))}
        accessibilityRole="button"
        accessibilityLabel={isLoved ? 'Remove from Love It' : 'Add to Love It'}
        accessibilityState={{ selected: isLoved }}
      >
        <View style={[styles.actionCircle, isLoved && styles.actionCircleLove]}>
          <Text style={[styles.actionGlyph, isLoved && styles.actionGlyphActive]}>♥</Text>
        </View>
        <Text style={styles.actionLabel}>Love It</Text>
      </Pressable>
    </View>
  );

  const metaLabel = [
    restaurantLocationLabel(restaurant),
    distanceMiles === null || distanceMiles === undefined ? null : formatProximityDistance(distanceMiles),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        onSwipeableOpenStartDrag={() => animateShadow(1)}
        onSwipeableWillOpen={() => {
          if (swipeableRef.current) registerSwipeableOpen(swipeableRef.current);
        }}
        onSwipeableClose={() => {
          animateShadow(0);
          if (swipeableRef.current) unregisterSwipeable(swipeableRef.current);
        }}
        containerStyle={styles.swipeableContainer}
      >
        <AnimatedPressable
          ref={setRefs}
          onPress={() => {
            closeOpenSwipeable();
            onPress();
          }}
          onPressIn={() => animateShadow(1)}
          onPressOut={() => animateShadow(0)}
          onLongPress={() => {
            closeOpenSwipeable();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
              console.warn('haptics failed (native module may need a fresh build):', err)
            );
            rowRef.current?.measureInWindow((x, y, width, height) => {
              setPreviewOrigin({ x, y, width, height });
              setPreviewVisible(true);
            });
          }}
          accessibilityRole="button"
          accessibilityLabel={[
            item.item,
            isNew && 'New',
            restaurant.restaurant,
            restaurantLocationLabel(restaurant),
            distanceMiles === null || distanceMiles === undefined ? null : formatProximityDistance(distanceMiles),
            item.price_display,
          ]
            .filter(Boolean)
            .join(', ')}
          style={[
            styles.row,
            {
              backgroundColor: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.surface, COLORS.goldLight] }),
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 6,
              shadowOpacity: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] }),
              elevation: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }),
              transform: [{ scale: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
            },
          ]}
        >
          <View style={styles.titleRow}>
            <HighlightedText
              text={item.item}
              query={highlightQuery}
              style={[text.restaurantName, styles.name]}
              numberOfLines={1}
            />
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
            {hasActivity && <View style={styles.activityDot} />}
          </View>
          <Text style={[text.body, styles.restaurant]} numberOfLines={1}>
            {restaurant.restaurant}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[text.bodyMuted, styles.location]} numberOfLines={1}>
              {metaLabel}
            </Text>
            <Text style={[text.body, styles.price]}>{item.price_display}</Text>
          </View>
        </AnimatedPressable>
      </Swipeable>
      <ItemResultPreviewCard
        item={previewVisible ? item : null}
        restaurant={restaurant}
        badges={badges}
        isLoved={isLoved}
        isNeeded={needItEnabled && isNeeded}
        gotItCount={gotItEnabled ? gotItCount : 0}
        origin={previewOrigin}
        onOpen={() => {
          setPreviewVisible(false);
          animateShadow(0);
          onPress();
        }}
        onClose={() => {
          setPreviewVisible(false);
          animateShadow(0);
        }}
      />
      {gotItEvent && (
        <GotItRatingCard
          event={gotItEvent}
          ratingsEnabled={ratingsEnabled}
          onConfirm={async (rating) => {
            await confirmGotIt(gotItEvent.clientId, rating);
            setGotItEvent(null);
          }}
          onUndo={async () => {
            await undoGotIt(gotItEvent.clientId, item.restaurant_id, item.item_id);
            setGotItEvent(null);
          }}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  swipeableContainer: {
    overflow: 'visible',
  },
  row: {
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  name: {
    flex: 1,
    fontSize: 14,
  },
  newBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 9,
    lineHeight: 11,
    color: COLORS.ink,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.pine,
  },
  restaurant: {
    marginTop: 2,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  location: {
    flex: 1,
  },
  price: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  actionButton: {
    width: 50,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.border,
  },
  actionCircleLove: {
    backgroundColor: COLORS.pine,
  },
  actionCircleNeed: {
    backgroundColor: COLORS.gold,
  },
  actionCircleGot: {
    backgroundColor: COLORS.barkBrown,
  },
  actionGlyph: {
    fontSize: 16,
    color: COLORS.ink,
  },
  actionGlyphActive: {
    color: COLORS.surface,
  },
  actionLabel: {
    marginTop: 2,
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10,
    lineHeight: 12,
    color: COLORS.muted,
  },
  countBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pine,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  countBadgeLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 9,
    lineHeight: 11,
    color: COLORS.surface,
  },
});
