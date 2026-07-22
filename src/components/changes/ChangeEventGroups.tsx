import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChangeEvent } from '../../data/types';
import { changeRowLine, formatDateLabel, groupEvents, isRowTappable, type GroupMode } from '../../data/changes';
import { COLORS, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Shared by ChangesHomeScreen (Level 0, Openings & Closures) and
// ChangesCategoryScreen (Level 2) -- day/week-grouped rows, ported from
// Disney Dining Dev's renderGroupedEvents(). onPressEvent only fires for
// tappable rows (isRowTappable: has a restaurant_id and isn't a closure).
export function ChangeEventGroups({
  events,
  groupMode,
  hideRestaurant = false,
  onPressEvent,
}: {
  events: ChangeEvent[];
  groupMode: GroupMode;
  hideRestaurant?: boolean;
  onPressEvent: (restaurantId: string) => void;
}) {
  const groups = groupEvents(events, groupMode);

  if (!groups.length) {
    return (
      <View style={styles.empty}>
        <Text style={text.bodyMuted}>No changes in this range.</Text>
      </View>
    );
  }

  return (
    <View>
      {groups.map((group) => (
        <View key={group.key}>
          <Text style={[text.sectionToggle, styles.groupHeading]}>
            {group.heading.toUpperCase()} ({group.events.length})
          </Text>
          {group.events.map((e, i) => {
            const { name, sub } = changeRowLine(e, { hideRestaurant });
            const tappable = isRowTappable(e);
            return (
              // No stable per-event id in the changes feed schema --
              // index within a deterministically-derived group is an
              // accepted tradeoff here.
              <Pressable
                key={`${group.key}-${i}`}
                style={[styles.row, !tappable && styles.rowStatic]}
                disabled={!tappable}
                onPress={() => {
                  if (tappable && e.restaurant_id) onPressEvent(e.restaurant_id);
                }}
              >
                <View style={styles.rowLeft}>
                  <Text style={text.restaurantName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={text.bodyMuted} numberOfLines={1}>
                    {sub}
                  </Text>
                </View>
                <Text style={[text.bodyMuted, styles.rowDate]}>{formatDateLabel(e.date)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  groupHeading: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  rowStatic: {
    opacity: 0.85,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  rowDate: {
    fontSize: 12,
  },
});
