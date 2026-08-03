import { useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChangesStackParamList } from '../navigation/changesTypes';
import { ChangeEventGroups } from '../components/changes/ChangeEventGroups';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<ChangesStackParamList, 'ChangesCategory'>;

// Menu Changes mixes item_added and item_removed events -- Price Changes
// (the only other catKey) has no such split, so the filter pills only make
// sense here.
type ItemFilter = 'all' | 'added' | 'removed';

// Level 2 of the ported See Changes feature: one category's actual
// events, either scoped to a single restaurant (hides the redundant
// restaurant name on each row) or "all restaurants" for that category.
export function ChangesCategoryScreen({ navigation, route }: Props) {
  const { catKey, catLabel, events, scopeRestaurant, groupMode } = route.params;
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');

  const filteredEvents = useMemo(() => {
    if (catKey !== 'menu' || itemFilter === 'all') return events;
    const wantCategory = itemFilter === 'added' ? 'menu_item_added' : 'menu_item_removed';
    return events.filter((e) => e.category === wantCategory);
  }, [events, catKey, itemFilter]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{catLabel}</Text>
        <Text style={text.bodyMuted}>
          {scopeRestaurant ? '' : 'All restaurants · '}
          {filteredEvents.length} change{filteredEvents.length === 1 ? '' : 's'} in this range
        </Text>
      </View>

      {catKey === 'menu' && (
        <View style={styles.filterRow}>
          {(
            [
              ['all', 'All'],
              ['added', 'Added'],
              ['removed', 'Removed'],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.filterPill, itemFilter === key && styles.filterPillActive]}
              onPress={() => setItemFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: itemFilter === key }}
            >
              <Text style={[text.chip, itemFilter === key && styles.filterPillTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ChangeEventGroups
          events={filteredEvents}
          groupMode={groupMode}
          hideRestaurant={scopeRestaurant}
          onPressEvent={(restaurantId) => navigation.navigate('RestaurantDetail', { restaurantId })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  title: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 24,
    color: COLORS.ink,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  filterPill: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  filterPillActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  filterPillTextActive: {
    color: COLORS.goldLight,
  },
});
