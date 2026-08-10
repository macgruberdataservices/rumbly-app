import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MenuItem } from '../data/types';
import { isNewMenuItem } from '../data/newItem';
import { formatDateLabel } from '../data/changes';
import { sanitizeRestaurantDescription } from '../data/restaurantDescription';
import type { RatingAverage } from '../data/ratingAverage';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';
import { MenuItemRatingSummary } from './MenuItemRatingSummary';

interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Long-press preview for a menu row. Unlike the restaurant version this
// replaced, the row is already on the restaurant detail screen, so a tap
// outside dismisses it while the entitled Journal action opens the composer.
// It also shows the full description that the fixed-height row cannot fit.
//
// Grows from the row's on-screen position (MenuItemRow measures it via
// measureInWindow right before showing this) rather than just fading in
// centered -- animationType="none" on the Modal itself, with our own
// transform-based animation instead: the card is always laid out at its
// natural centered resting position (screen-centered, auto height), and
// starts translated+scaled down to sit at/near the row before animating
// to identity. Deliberately not a pixel-exact row-rect-to-card-rect
// morph -- the row (68pt, one line) and the expanded card (multi-line,
// badges) have too different an aspect ratio for that to look right;
// scale+translate from the row's center reads as "grew out of there"
// without needing reflow-safe height animation. No reverse-grow on
// dismiss -- closes instantly, kept simple.
export function MenuItemPreviewCard({
  item,
  badges,
  ratingAverage,
  origin,
  onClose,
  onJournal,
  onPressAllergyInfo,
}: {
  item: MenuItem | null;
  badges: string[];
  ratingAverage: RatingAverage | undefined;
  origin: Origin | null;
  onClose: () => void;
  onJournal?: () => void;
  onPressAllergyInfo: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const growAnim = useRef(new Animated.Value(0)).current;
  // Same raw-HTML issue Restaurant.description has (e.g. "<p>Sweet Thai
  // Chili Dipping Sauce</p>") -- reusing its sanitizer here too.
  const description = sanitizeRestaurantDescription(item?.description ?? null);

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
          <Pressable onPress={onClose}>
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
                <MenuItemRatingSummary ratingAverage={ratingAverage} variant="feature" />
                {!!description && (
                  <View style={styles.descriptionPanel}>
                    <Text style={styles.descriptionEyebrow}>THE DETAILS</Text>
                    <Text style={[text.bodyMuted, styles.description]}>{description}</Text>
                  </View>
                )}
                {(badges.length > 0 || item.has_allergy_option) && (
                  <View style={styles.badgeRow}>
                    {badges.map((b) => (
                      <View key={b} style={styles.badge}>
                        <Text style={text.sectionToggle}>{b}</Text>
                      </View>
                    ))}
                    {/* Tappable, unlike the badges above -- has_allergy_option
                        is an inferred signal (see filters.ts's header
                        comment), so it needs the hedged disclaimer +
                        Disney link that AllergyInfoSheet provides rather
                        than asserting anything as inert text. */}
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
  descriptionPanel: {
    marginTop: SPACING.md,
    borderRadius: RADII.md,
    padding: SPACING.md,
    backgroundColor: DAYLIGHT.sky,
  },
  descriptionEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 8.5,
    letterSpacing: 0.9,
    color: DAYLIGHT.ocean,
  },
  description: {
    marginTop: SPACING.xs,
    fontSize: 13,
    lineHeight: 18,
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
