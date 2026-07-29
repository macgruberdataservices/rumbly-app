import { StyleSheet, Text, View } from 'react-native';
import type { JournalEntry } from '../../data/journal';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

function formatVisitDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function JournalEntryCard({
  entry,
  rating,
  showTarget = true,
}: {
  entry: JournalEntry;
  rating: number | null;
  showTarget?: boolean;
}) {
  const target = entry.itemNameSnapshot ?? entry.restaurantNameSnapshot;
  const context = [entry.mealPeriodSnapshot, formatVisitDate(entry.visitedOn)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      {showTarget && <Text style={text.restaurantName}>{target}</Text>}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{context}</Text>
        {rating !== null && (
          <Text style={styles.rating} accessibilityLabel={`${rating} out of 5`}>
            ★ {rating}/5
          </Text>
        )}
      </View>
      {!!entry.note && <Text style={styles.note}>{entry.note}</Text>}
      {entry.syncState === 'failed' && (
        <Text style={styles.syncError}>Saved here · Sync needs attention</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  meta: {
    flex: 1,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: COLORS.muted,
  },
  rating: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.gold,
  },
  note: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.ink,
  },
  syncError: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    color: COLORS.gold,
  },
});
