import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RelatedTag } from '../../search/relatedTaxonomy';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Related-taxonomy refinement row. Tapping narrows the current result set
// in place per the search spec's "Cuisine and experience refinements"
// section (Scenario 4) — tapping again removes it. The full removable-chip
// treatment and additive multi-group filter sheet are Milestone 6; this is
// the minimal interaction the spec's acceptance scenario actually needs.
export function RelatedResultRow({
  tag,
  active,
  onPress,
}: {
  tag: RelatedTag;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, active && styles.active, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[text.chip, active && styles.activeText]}>{tag.label}</Text>
      <View style={styles.badge}>
        <Text style={[text.sectionToggle, active && styles.activeText]}>
          {active ? 'APPLIED · TAP TO REMOVE' : 'RELATED'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  rowPressed: {
    opacity: 0.6,
  },
  active: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  activeText: {
    color: COLORS.goldLight,
  },
  badge: {
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: 6,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
  },
});
