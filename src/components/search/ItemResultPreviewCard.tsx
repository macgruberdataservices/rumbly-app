import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { restaurantLocationLabel } from '../../data/locationNames';
import { isNewMenuItem } from '../../data/newItem';
import { formatDateLabel } from '../../data/changes';
import type { RatingAverage } from '../../data/ratingAverage';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';
import { MenuItemRatingSummary } from '../MenuItemRatingSummary';

interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Long-press preview for a search-result item row. Tapping the main card
// navigates to the same destination as a plain tap, the entitled Journal
// action opens the composer, and tapping outside dismisses. It grows from
// the row's on-screen position; see
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
  ratingAverage,
  origin,
  onOpen,
  onClose,
  onJournal,
  onPressAllergyInfo,
}: {
  item: SearchIndexEntry | null;
  restaurant: Restaurant;
  badges: string[];
  isLoved: boolean;
  isNeeded: boolean;
  gotItCount: number;
  ratingAverage: RatingAverage | undefined;
  origin: Origin | null;
  onOpen: () => void;
  onClose: () => void;
  onJournal?: () => void;
  onPressAllergyInfo: () => void;
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
                <View style={styles.eyebrowRow}>
                  <Text style={styles.eyebrow}>MENU FIND</Text>
                  <Text style={styles.pricePill}>{item.price_display}</Text>
                </View>
                <View style={styles.titleRow}>
                  <Text style={[text.sectionTitle, styles.name]}>{item.item}</Text>
                </View>
                <View style={styles.addedRow}>
                  {isNewMenuItem(item.first_seen) && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  )}
                  <Text style={text.bodyMuted}>Added {formatDateLabel(item.first_seen)}</Text>
                </View>
                <View style={styles.restaurantPanel}>
                  <Text style={[text.body, styles.restaurant]}>{restaurant.restaurant}</Text>
                  <Text style={[text.bodyMuted, styles.location]}>{restaurantLocationLabel(restaurant)}</Text>
                </View>
                {statusLabels.length > 0 && (
                  <View style={styles.statusRow}>
                    {statusLabels.map((label) => (
                      <View key={label} style={styles.statusPill}>
                        <Text style={styles.status}>{label}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <MenuItemRatingSummary ratingAverage={ratingAverage} variant="feature" />
                {(badges.length > 0 || item.has_allergy_option) && (
                  <View style={styles.badgeRow}>
                    {badges.map((b) => (
                      <View key={b} style={styles.badge}>
                        <Text style={text.sectionToggle}>{b}</Text>
                      </View>
                    ))}
                    {item.has_allergy_option && (
                      <Pressable
                        onPress={onPressAllergyInfo}
                        style={[styles.badge, styles.badgeTappable]}
                        accessibilityRole="button"
                        accessibilityLabel="Allergy option available. View details."
                      >
                        <Text style={text.sectionToggle}>Allergy option available ⓘ</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {onJournal && (
                  <Pressable
                    style={styles.journalButton}
                    onPress={onJournal}
                    accessibilityRole="button"
                  >
                    <Text style={styles.journalButtonLabel}>Add to Journal</Text>
                  </Pressable>
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
    backgroundColor: 'rgba(23, 40, 45, 0.46)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    overflow: 'hidden',
    backgroundColor: DAYLIGHT.paper,
    borderRadius: RADII.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
    shadowColor: DAYLIGHT.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1.1,
    color: DAYLIGHT.coral,
  },
  pricePill: {
    overflow: 'hidden',
    borderRadius: 14,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: DAYLIGHT.sky,
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    color: DAYLIGHT.ocean,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  name: {
    flex: 1,
    fontSize: 24,
    lineHeight: 28,
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
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  restaurantPanel: {
    marginTop: SPACING.md,
    borderRadius: RADII.md,
    padding: SPACING.md,
    backgroundColor: DAYLIGHT.sky,
  },
  restaurant: {
    fontFamily: FONT_FAMILY.workSansBold,
    color: DAYLIGHT.ink,
  },
  location: {
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  statusPill: {
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: '#F3D4C9',
  },
  status: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 10,
    color: DAYLIGHT.ink,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: '#D8EEE4',
  },
  badgeTappable: {
    backgroundColor: '#FFF0BD',
  },
  journalButton: {
    minHeight: 44,
    marginTop: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.lg,
    backgroundColor: DAYLIGHT.ocean,
  },
  journalButtonLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 12,
    color: DAYLIGHT.paper,
  },
});
