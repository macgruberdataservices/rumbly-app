import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MenuItem } from '../data/types';
import { isNewMenuItem } from '../data/newItem';
import { formatDateLabel } from '../data/changes';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Long-press preview for a menu row: purely visual, no buttons of its own
// -- unlike the restaurant version this replaced, there's no further
// screen to navigate to (the row is already on the restaurant detail
// screen), so a tap anywhere just dismisses. Exists mainly to show the
// full, untruncated description that the fixed-height row can't fit.
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
  origin,
  onClose,
}: {
  item: MenuItem | null;
  badges: string[];
  origin: Origin | null;
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
                <View style={styles.titleRow}>
                  <Text style={[text.sectionTitle, styles.name]}>{item.item}</Text>
                  <Text style={text.body}>{item.price_display}</Text>
                </View>
                <View style={styles.addedRow}>
                  {isNewMenuItem(item.first_seen) && (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  )}
                  <Text style={text.bodyMuted}>Added {formatDateLabel(item.first_seen)}</Text>
                </View>
                {!!item.description && (
                  <Text style={[text.bodyMuted, styles.description]}>{item.description}</Text>
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
  description: {
    marginTop: SPACING.sm,
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
