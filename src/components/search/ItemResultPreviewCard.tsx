import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

function locationLabel(r: Restaurant): string {
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

// Long-press preview for a search-result item row: purely visual, no
// buttons -- tapping it navigates (same destination a plain tap gives),
// tapping outside dismisses. Grows from the row's on-screen position, see
// MenuItemPreviewCard.tsx for the technique (this project's "Reusable UI
// patterns" ROADMAP section has the full writeup).
//
// Lighter content than MenuItemPreviewCard by necessity: SearchIndexEntry
// is a deliberately slim projection (cold-launch memory budget) with no
// `description` and no `is_alcoholic` -- shows restaurant/location instead,
// which the detail-screen row doesn't need since it's already on that
// restaurant's own screen.
export function ItemResultPreviewCard({
  item,
  restaurant,
  badges,
  isLoved,
  isNeeded,
  gotItCount,
  origin,
  onOpen,
  onClose,
}: {
  item: SearchIndexEntry | null;
  restaurant: Restaurant;
  badges: string[];
  isLoved: boolean;
  isNeeded: boolean;
  gotItCount: number;
  origin: Origin | null;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const growAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (item) {
      growAnim.setValue(0);
      Animated.spring(growAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
    }
  }, [item, growAnim]);

  const originCenterX = origin ? origin.x + origin.width / 2 : screenWidth / 2;
  const originCenterY = origin ? origin.y + origin.height / 2 : screenHeight / 2;
  const translateX0 = originCenterX - screenWidth / 2;
  const translateY0 = originCenterY - screenHeight / 2;

  const statusLabels = [
    isNeeded && '★ Need It',
    gotItCount > 0 && `✓ Got It ×${gotItCount}`,
    isLoved && '♥ Love It',
  ].filter(Boolean) as string[];

  return (
    <Modal visible={item !== null} transparent animationType="none" onRequestClose={onClose}>
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
            {item && (
              <>
                <View style={styles.titleRow}>
                  <Text style={[text.sectionTitle, styles.name]}>{item.item}</Text>
                  <Text style={text.body}>{item.price_display}</Text>
                </View>
                <Text style={[text.body, styles.restaurant]}>{restaurant.restaurant}</Text>
                <Text style={[text.bodyMuted, styles.location]}>{locationLabel(restaurant)}</Text>
                {statusLabels.length > 0 && (
                  <Text style={[text.bodyMuted, styles.status]}>{statusLabels.join(' · ')}</Text>
                )}
                {badges.length > 0 && (
                  <View style={styles.badgeRow}>
                    {badges.map((b) => (
                      <View key={b} style={styles.badge}>
                        <Text style={text.sectionToggle}>{b}</Text>
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  name: {
    flex: 1,
  },
  restaurant: {
    marginTop: SPACING.sm,
  },
  location: {
    marginTop: 2,
  },
  status: {
    marginTop: SPACING.xs,
    color: COLORS.pine,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  badge: {
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 6,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
});
