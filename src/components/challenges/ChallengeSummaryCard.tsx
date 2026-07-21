import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengeDefinition } from '../../challenges/evaluate';
import type { ChallengeProgress } from '../../challenges/evaluate';
import { COLORS, SPACING } from '../../theme/tokens';
import { FONT_FAMILY } from '../../theme/typography';

interface Props {
  definition: ChallengeDefinition;
  progress: ChallengeProgress;
  onPress: () => void;
  compact?: boolean;
}

export function ChallengeSummaryCard({ definition, progress, onPress, compact = false }: Props) {
  const completionLabel = progress.completions.length === 1
    ? '1 round completed'
    : `${progress.completions.length} rounds completed`;
  const ratio = progress.requiredCount > 0 ? progress.currentCount / progress.requiredCount : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${definition.title}, ${progress.currentCount} of ${progress.requiredCount}`}
      style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.topRow}>
        <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.iconText}>★</Text>
        </View>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{definition.title}</Text>
            <View style={styles.repeatPill}>
              <Text style={styles.repeatLabel}>{definition.repeatMode === 'once' ? 'ONE TIME' : 'REPEATABLE'}</Text>
            </View>
          </View>
          <Text style={styles.description} numberOfLines={compact ? 1 : 2}>{definition.description}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
      <View style={styles.progressRow}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, ratio * 100)}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{progress.currentCount}/{progress.requiredCount}</Text>
      </View>
      {!compact && <Text style={styles.completionLabel}>{completionLabel}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  cardCompact: { paddingVertical: SPACING.sm },
  pressed: { backgroundColor: COLORS.goldLight },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.forest,
    marginRight: SPACING.sm,
  },
  iconText: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 15, color: COLORS.goldLight },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { flexShrink: 1, fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 17, color: COLORS.ink },
  repeatPill: { borderRadius: 8, backgroundColor: COLORS.cream, paddingHorizontal: 6, paddingVertical: 2 },
  repeatLabel: { fontFamily: FONT_FAMILY.interBold, fontSize: 8, color: COLORS.forest },
  description: { fontFamily: FONT_FAMILY.interRegular, fontSize: 12, lineHeight: 16, color: COLORS.muted, marginTop: 1 },
  chevron: { fontFamily: FONT_FAMILY.interRegular, fontSize: 25, color: COLORS.dim, marginLeft: SPACING.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.cream },
  fill: { height: '100%', backgroundColor: COLORS.pine },
  progressLabel: { width: 34, textAlign: 'right', fontFamily: FONT_FAMILY.interSemiBold, fontSize: 11, color: COLORS.forest },
  completionLabel: { fontFamily: FONT_FAMILY.interRegular, fontSize: 10, color: COLORS.dim, marginTop: 5 },
});
