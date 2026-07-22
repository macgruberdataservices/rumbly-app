import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Restaurant } from '../data/types';
import type { HoursStatus } from '../data/hoursStatus';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';
import { sanitizeRestaurantDescription } from '../data/restaurantDescription';
import { restaurantLocationLabel } from '../data/locationNames';

interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

function hasDiningPlan(r: Restaurant): boolean {
  return r.raw_facets.some((f) => f.group === 'diningPlan');
}

// Long-press preview for a restaurant row: purely visual, no buttons of
// its own -- tapping it navigates (same destination a plain tap would),
// tapping outside dismisses. Grows from the row's on-screen position, see
// MenuItemPreviewCard.tsx for the technique (same pattern, this project's
// "Reusable UI patterns" ROADMAP section has the full writeup).
export function RestaurantPreviewCard({
  restaurant,
  hoursStatus,
  isLoved,
  gotItCount,
  origin,
  onOpen,
  onClose,
}: {
  restaurant: Restaurant | null;
  hoursStatus: HoursStatus;
  isLoved: boolean;
  gotItCount: number;
  origin: Origin | null;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const growAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (restaurant) {
      growAnim.setValue(0);
      Animated.spring(growAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
    }
  }, [restaurant, growAnim]);

  const originCenterX = origin ? origin.x + origin.width / 2 : screenWidth / 2;
  const originCenterY = origin ? origin.y + origin.height / 2 : screenHeight / 2;
  const translateX0 = originCenterX - screenWidth / 2;
  const translateY0 = originCenterY - screenHeight / 2;

  const pills = restaurant
    ? ([
        restaurant.accepts_reservations && 'Reservations',
        restaurant.has_walkup_list && 'Walk-up List',
        hasDiningPlan(restaurant) && 'Dining Plan',
      ].filter(Boolean) as string[])
    : [];
  const description = sanitizeRestaurantDescription(restaurant?.description ?? null);

  return (
    <Modal visible={restaurant !== null} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: growAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX: growAnim.interpolate({ inputRange: [0, 1], outputRange: [translateX0, 0] }) },
                { translateY: growAnim.interpolate({ inputRange: [0, 1], outputRange: [translateY0, 0] }) },
                { scale: growAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              ],
            },
          ]}
        >
          <Pressable onPress={onOpen}>
            {restaurant && (
              <>
                <Text style={text.sectionTitle}>{restaurant.restaurant}</Text>
                <Text style={[text.bodyMuted, styles.location]}>{restaurantLocationLabel(restaurant)}</Text>
                <Text
                  style={[text.body, hoursStatus.kind === 'open' ? styles.openLabel : styles.closedLabel]}
                >
                  {hoursStatus.scheduleLabel}
                </Text>
                {!!description && (
                  <Text style={[text.bodyMuted, styles.description]} numberOfLines={6}>
                    {description}
                  </Text>
                )}
                {isLoved && <Text style={[text.bodyMuted, styles.loved]}>♥ Love It</Text>}
                {gotItCount > 0 && (
                  <Text style={[text.bodyMuted, styles.gotIt]}>✓ Got It ×{gotItCount}</Text>
                )}
                {pills.length > 0 && (
                  <View style={styles.pillRow}>
                    {pills.map((p) => (
                      <View key={p} style={styles.pill}>
                        <Text style={text.chip}>{p}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    width: '100%',
  },
  location: {
    marginTop: SPACING.xs,
  },
  openLabel: {
    color: COLORS.pine,
    marginTop: SPACING.sm,
  },
  closedLabel: {
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  description: {
    lineHeight: 18,
    marginTop: SPACING.md,
  },
  loved: {
    color: COLORS.pine,
    marginTop: SPACING.xs,
  },
  gotIt: {
    color: COLORS.barkBrown,
    marginTop: SPACING.xs,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  pill: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
});
