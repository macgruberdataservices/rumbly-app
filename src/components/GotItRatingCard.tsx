import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

const RATING_REACTIONS = [
  '',
  'Not for me',
  'Maybe skip it',
  'A solid park bite',
  'Great find',
  'Worth the detour',
] as const;

export interface GotItCardOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GotItCardEvent {
  clientId: string;
  targetName: string;
  count: number;
  origin: GotItCardOrigin | null;
}

export function GotItRatingCard({
  event,
  ratingsEnabled,
  onConfirm,
  onUndo,
}: {
  event: GotItCardEvent | null;
  ratingsEnabled: boolean;
  onConfirm: (rating: number | null) => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const growAnim = useRef(new Animated.Value(0)).current;
  const [rating, setRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!event) return;
    setRating(null);
    setSubmitting(false);
    growAnim.setValue(0);
    Animated.spring(growAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 8,
    }).start();
  }, [event, growAnim]);

  const originCenterX = event?.origin ? event.origin.x + event.origin.width / 2 : screenWidth / 2;
  const originCenterY = event?.origin ? event.origin.y + event.origin.height / 2 : screenHeight / 2;
  const translateX0 = originCenterX - screenWidth / 2;
  const translateY0 = originCenterY - screenHeight / 2;

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onConfirm(rating);
  };

  const undo = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onUndo();
  };

  return (
    <Modal visible={event !== null} transparent animationType="none" onRequestClose={confirm}>
      <Animated.View style={[styles.backdrop, { opacity: growAnim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={confirm}
          accessibilityRole="button"
          accessibilityLabel="Close and log Got It"
        />
        <Animated.View
          style={[
            styles.card,
            {
              transform: [
                { translateX: growAnim.interpolate({ inputRange: [0, 1], outputRange: [translateX0, 0] }) },
                { translateY: growAnim.interpolate({ inputRange: [0, 1], outputRange: [translateY0, 0] }) },
                { scale: growAnim.interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.titleRow}>
            <View style={styles.gotItBadge}>
              <Text style={styles.gotItCheck}>✓</Text>
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.eyebrow}>TASTE MEMORY SAVED</Text>
              <Text style={[text.sectionTitle, styles.title]}>{ratingsEnabled ? 'How was it?' : 'Got It logged'}</Text>
            </View>
          </View>
          <Text style={[text.bodyMuted, styles.targetName]} numberOfLines={3}>{event?.targetName}</Text>

          {ratingsEnabled && (
            <View style={styles.ratingPanel}>
              <View style={styles.ratingRow} accessibilityRole="radiogroup">
                {[1, 2, 3, 4, 5].map((value) => {
                  const selected = rating !== null && value <= rating;
                  return (
                    <Pressable
                      key={value}
                      style={[styles.starButton, selected && styles.starButtonSelected]}
                      onPress={() => {
                        setRating(value);
                        Haptics.selectionAsync().catch(() => undefined);
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
                      accessibilityState={{ checked: rating === value }}
                    >
                      <Text style={[styles.star, selected && styles.starSelected]}>{selected ? '★' : '☆'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.ratingReaction, rating !== null && styles.ratingReactionSelected]}>
                {rating === null ? 'Tap a star to remember your take' : RATING_REACTIONS[rating]}
              </Text>
            </View>
          )}

          <View style={styles.countPill}>
            <Text style={styles.countLabel}>Tasted {event?.count ?? 0} {(event?.count ?? 0) === 1 ? 'time' : 'times'}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.secondaryButton, submitting && styles.buttonDisabled]}
              onPress={undo}
              disabled={submitting}
              accessibilityRole="button"
            >
              <Text style={text.buttonLabel}>Undo</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, submitting && styles.buttonDisabled]}
              onPress={confirm}
              disabled={submitting}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonLabel}>Log It</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 40, 45, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    width: '100%',
    backgroundColor: DAYLIGHT.paper,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    shadowColor: DAYLIGHT.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gotItBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DAYLIGHT.sage,
    transform: [{ rotate: '-6deg' }],
  },
  gotItCheck: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 24,
    color: DAYLIGHT.paper,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: SPACING.md,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 8.5,
    letterSpacing: 1,
    color: DAYLIGHT.coral,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
  },
  targetName: {
    marginTop: SPACING.md,
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 13,
    lineHeight: 18,
    color: DAYLIGHT.ink,
  },
  ratingPanel: {
    marginTop: SPACING.lg,
    borderRadius: RADII.xl,
    padding: SPACING.sm,
    backgroundColor: DAYLIGHT.sky,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  starButton: {
    flex: 1,
    maxWidth: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starButtonSelected: {
    backgroundColor: DAYLIGHT.sun,
    transform: [{ scale: 1.06 }],
  },
  star: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 28,
    color: DAYLIGHT.border,
  },
  starSelected: {
    color: DAYLIGHT.coral,
  },
  ratingReaction: {
    minHeight: 28,
    paddingTop: SPACING.xs,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 11,
    color: DAYLIGHT.muted,
  },
  ratingReactionSelected: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 13,
    color: DAYLIGHT.ocean,
  },
  countPill: {
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
    borderRadius: 13,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: '#D8EEE4',
  },
  countLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 10,
    color: DAYLIGHT.ink,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADII.lg,
    backgroundColor: DAYLIGHT.ocean,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: text.buttonLabel.fontSize,
    color: DAYLIGHT.paper,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
