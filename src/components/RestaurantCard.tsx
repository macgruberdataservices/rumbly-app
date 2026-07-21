import { forwardRef, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Restaurant } from '../data/types';
import { formatProximityDistance } from '../location/proximity';
import { useActivity } from '../hooks/useActivity';
import { useEntitlement } from '../hooks/useEntitlement';
import { useDataProvider } from '../hooks/useDataProvider';
import { getTodayStatus } from '../data/hoursStatus';
import { HighlightedText } from './HighlightedText';
import { RestaurantPreviewCard } from './RestaurantPreviewCard';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function priceDots(tier: number | null): string {
  if (!tier) return '';
  return '$'.repeat(tier);
}

function locationLabel(r: Restaurant): string {
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

// highlightQuery is optional and defaults to undefined — existing
// non-search call sites (ParkListScreen, RestaurantListScreen) pass
// nothing and render exactly as before Milestone 6.
//
// No swipe here -- Need It/Got It/Love It item actions live on
// MenuItemRow/ItemResultRow; restaurant-level Love stays on
// ExpandedHeader, so there's no item-level action to reveal via swipe at
// this granularity. Long-press *does* get the same native-feeling peek
// as MenuItemRow (owner decision 2026-07-20, applied after that pattern
// was refined and confirmed to feel right -- see the ROADMAP's "Reusable
// UI patterns" section for the technique writeup): shadow/scale/
// highlight/grow-from-origin, all driven by one shared Animated.Value.
// Tapping the peek navigates (same destination a plain tap gives),
// tapping outside dismisses.
//
// Flat divider-row style (owner decision 2026-07-20, for consistency with
// MenuItemRow) rather than a bordered/rounded card -- no more per-row
// background box, no gap between rows, just a bottom border like an
// inbox/list view.
interface RestaurantCardProps {
  restaurant: Restaurant;
  highlightQuery?: string;
  distanceMiles?: number | null;
  onPress: () => void;
}

export const RestaurantCard = forwardRef<View, RestaurantCardProps>(function RestaurantCard(
  { restaurant, highlightQuery, distanceMiles, onPress },
  ref
) {
  const metaParts = [
    locationLabel(restaurant),
    distanceMiles === null || distanceMiles === undefined ? null : formatProximityDistance(distanceMiles),
    priceDots(restaurant.price_tier),
    restaurant.experience_type,
  ].filter(Boolean);
  const { lovedIds, gotItRestaurantCounts } = useActivity();
  const gotItEnabled = useEntitlement('got_it');
  const { hoursData } = useDataProvider();
  const isLoved = lovedIds.has(restaurant.restaurant_id);
  const gotItCount = gotItRestaurantCounts.get(restaurant.restaurant_id) ?? 0;
  const hasActivity = isLoved || (gotItEnabled && gotItCount > 0);

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

  // Same shared-value technique as MenuItemRow: one Animated.Value drives
  // shadow, scale, and the highlight together from press-in/out.
  const shadowAnim = useRef(new Animated.Value(0)).current;
  const animateShadow = (toValue: number) => {
    Animated.timing(shadowAnim, { toValue, duration: 150, useNativeDriver: false }).start();
  };

  const hoursStatus = getTodayStatus(hoursData, restaurant.restaurant_id);

  return (
    <>
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
        accessibilityLabel={[restaurant.restaurant, ...metaParts].join(', ')}
        style={[
          styles.card,
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
            text={restaurant.restaurant}
            query={highlightQuery}
            style={[text.restaurantName, highlightQuery && styles.searchTitle]}
          />
          {hasActivity && <View style={styles.activityDot} />}
        </View>
        {metaParts.length > 0 && (
          <Text style={[text.bodyMuted, styles.meta]}>{metaParts.join(' · ')}</Text>
        )}
      </AnimatedPressable>
      <RestaurantPreviewCard
        restaurant={previewVisible ? restaurant : null}
        hoursStatus={hoursStatus}
        isLoved={isLoved}
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
    </>
  );
});

const styles = StyleSheet.create({
  card: {
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
  searchTitle: {
    fontSize: 15,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.pine,
  },
  meta: {
    marginTop: 2,
  },
});
