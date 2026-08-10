import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengeDefinition } from '../../challenges/evaluate';
import type { ChallengeProgress } from '../../challenges/evaluate';
import { DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
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
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    backgroundColor: '#D8EEE4',
    shadowColor: DAYLIGHT.ocean,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardCompact: { paddingVertical: SPACING.sm },
  pressed: { opacity: 0.82 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DAYLIGHT.ocean,
    marginRight: SPACING.sm,
    transform: [{ rotate: '-7deg' }],
  },
  iconText: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 15, color: '#FFFFFF' },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { flexShrink: 1, fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 19, color: DAYLIGHT.ink },
  repeatPill: { borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.72)', paddingHorizontal: 7, paddingVertical: 3 },
  repeatLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 8, color: DAYLIGHT.ocean },
  description: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 13, lineHeight: 18, color: DAYLIGHT.muted, marginTop: 2 },
  chevron: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 28, color: DAYLIGHT.ocean, marginLeft: SPACING.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.78)' },
  fill: { height: '100%', backgroundColor: DAYLIGHT.coral },
  progressLabel: { width: 40, textAlign: 'right', fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 11, color: DAYLIGHT.ocean },
  completionLabel: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 10, color: DAYLIGHT.muted, marginTop: 6 },
});
