import { forwardRef, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { formatProximityDistance } from '../../location/proximity';
import { useActivity } from '../../hooks/useActivity';
import { useEntitlement } from '../../hooks/useEntitlement';
import { HighlightedText } from '../HighlightedText';
import { ItemResultPreviewCard } from './ItemResultPreviewCard';
import { COLORS, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Same resort > area > park single-value priority RestaurantCard already
// uses — matched for consistency with the already-shipped browse rows
// rather than the search spec's two-part "Fantasyland · Magic Kingdom"
// example, a deliberate reduction, not an oversight.
function locationLabel(r: Restaurant): string {
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

// Menu-item search result row per the search spec's utility hierarchy:
// item name, restaurant, location + price.
//
// Full interaction parity with MenuItemRow (owner decision 2026-07-20,
// after RestaurantCard/MenuItemRow's shared-Animated.Value peek pattern
// read as "feels native" -- see ROADMAP's "Reusable UI patterns" section):
// swipe-left reveals Favorite + (if entitled) Want-to-Try, long-press
// shows a grow-from-origin preview, both layered on top of the row's own
// existing tap-to-navigate (unlike MenuItemRow, which has no navigation
// target of its own). Activity now reflects this exact item
// (favoritedItemKeys/wantToTriedItemKeys, keyed by
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

  const { favoritedItemKeys, wantToTriedItemKeys, toggleItemFavorite, toggleItemWantToTry } = useActivity();
  const wantToTryEnabled = useEntitlement('want_to_try');
  const key = `${item.restaurant_id}:${item.item_id}`;
  const isFavorited = favoritedItemKeys.has(key);
  const isWantToTried = wantToTriedItemKeys.has(key);
  const hasActivity = isFavorited || isWantToTried;

  const swipeableRef = useRef<Swipeable>(null);
  const rowRef = useRef<View>(null);
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

  const confirmThenClose = async (toggle: () => Promise<void>) => {
    await toggle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn('haptics failed (native module may need a fresh build):', err)
    );
    setTimeout(() => swipeableRef.current?.close(), 350);
  };

  const renderRightActions = () => (
    <View style={styles.actionsRow}>
      <Pressable
        style={[styles.actionCircle, isFavorited && styles.actionCircleFavorite]}
        onPress={() => confirmThenClose(() => toggleItemFavorite(item.restaurant_id, item.item_id))}
        accessibilityRole="button"
        accessibilityLabel={isFavorited ? 'Remove favorite' : 'Add favorite'}
      >
        <Text style={styles.actionGlyph}>♥</Text>
      </Pressable>
      {wantToTryEnabled && (
        <Pressable
          style={[styles.actionCircle, isWantToTried && styles.actionCircleWantToTry]}
          onPress={() => confirmThenClose(() => toggleItemWantToTry(item.restaurant_id, item.item_id))}
          accessibilityRole="button"
          accessibilityLabel={isWantToTried ? 'Remove want to try' : 'Add want to try'}
        >
          <Text style={styles.actionGlyph}>★</Text>
        </Pressable>
      )}
    </View>
  );

  const metaLabel = [
    locationLabel(restaurant),
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
        onSwipeableClose={() => animateShadow(0)}
        containerStyle={styles.swipeableContainer}
      >
        <AnimatedPressable
          ref={setRefs}
          onPress={onPress}
          onPressIn={() => animateShadow(1)}
          onPressOut={() => animateShadow(0)}
          onLongPress={() => {
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
            restaurant.restaurant,
            locationLabel(restaurant),
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
        isFavorited={isFavorited}
        isWantToTried={isWantToTried}
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
    </>
  );
});

const styles = StyleSheet.create({
  swipeableContainer: {
    overflow: 'visible',
  },
  row: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
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
    gap: SPACING.sm,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.border,
  },
  actionCircleFavorite: {
    backgroundColor: COLORS.pine,
  },
  actionCircleWantToTry: {
    backgroundColor: COLORS.gold,
  },
  actionGlyph: {
    fontSize: 18,
    color: COLORS.surface,
  },
});
