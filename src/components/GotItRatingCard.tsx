import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

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
          <Text style={text.sectionTitle}>{ratingsEnabled ? 'How was it?' : 'Got It logged'}</Text>
          <Text style={[text.bodyMuted, styles.targetName]} numberOfLines={2}>
            {event?.targetName}
          </Text>

          {ratingsEnabled && (
            <View style={styles.ratingRow} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = rating !== null && value <= rating;
                return (
                  <Pressable
                    key={value}
                    style={styles.starButton}
                    onPress={() => setRating(value)}
                    accessibilityRole="radio"
                    accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
                    accessibilityState={{ checked: rating === value }}
                  >
                    <Text style={[styles.star, selected && styles.starSelected]}>{selected ? '★' : '☆'}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[text.bodyMuted, styles.countLabel]}>
            Got It count: {event?.count ?? 0}
          </Text>

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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
  },
  targetName: {
    marginTop: SPACING.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.lg,
  },
  starButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    fontSize: 30,
    color: COLORS.borderMid,
  },
  starSelected: {
    color: COLORS.gold,
  },
  countLabel: {
    marginTop: SPACING.md,
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
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.pine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: text.buttonLabel.fontSize,
    color: COLORS.surface,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
