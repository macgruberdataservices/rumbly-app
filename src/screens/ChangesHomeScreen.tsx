import { useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChangesStackParamList } from '../navigation/changesTypes';
import type { ChangeEvent } from '../data/types';
import {
  categoryBreakdown,
  daysAgoStr,
  groupEventsByRestaurant,
  loadChangesForRange,
  restaurantSummaryLine,
  todayStr,
  type GroupMode,
} from '../data/changes';
import { ChangeEventGroups } from '../components/changes/ChangeEventGroups';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<ChangesStackParamList, 'ChangesHome'>;

type RangeMode = 'week' | 'month';

// Level 0 of the ported See Changes feature (see src/data/changes.ts for
// the full port notes): date-range picker, aggregate show-all buttons,
// Openings & Closures, and Restaurant Updates (one row per restaurant
// with any change, tap to drill into Level 1).
//
// Scope trim vs. the original: "This Week" / "This Month" quick presets
// only, no arbitrary custom date-range picker -- avoids pulling in a new
// native date-picker dependency for a first pass. Revisit if a real
// custom range turns out to matter.
export function ChangesHomeScreen({ navigation }: Props) {
  const [rangeMode, setRangeMode] = useState<RangeMode>('week');
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [events, setEvents] = useState<ChangeEvent[]>([]);

  const groupMode: GroupMode = rangeMode === 'week' ? 'day' : 'week';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    const from = rangeMode === 'week' ? daysAgoStr(6) : daysAgoStr(29);
    loadChangesForRange(from, todayStr())
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeMode]);

  const facilityEvents = useMemo(
    () => events.filter((e) => e.category === 'restaurant_added' || e.category === 'restaurant_closed'),
    [events]
  );
  const changeEvents = useMemo(
    () =>
      events.filter(
        (e) => e.category === 'menu_item_added' || e.category === 'menu_item_removed' || e.category === 'price_change'
      ),
    [events]
  );
  const menuCount = useMemo(
    () => changeEvents.filter((e) => e.category === 'menu_item_added' || e.category === 'menu_item_removed').length,
    [changeEvents]
  );
  const priceCount = useMemo(() => changeEvents.filter((e) => e.category === 'price_change').length, [changeEvents]);
  const byRestaurant = useMemo(() => groupEventsByRestaurant(changeEvents), [changeEvents]);

  const openShowAll = (key: 'menu' | 'price') => {
    const evs = changeEvents.filter((e) =>
      key === 'menu' ? e.category === 'menu_item_added' || e.category === 'menu_item_removed' : e.category === 'price_change'
    );
    navigation.navigate('ChangesCategory', {
      catKey: key,
      catLabel: key === 'menu' ? 'Menu Changes' : 'Price Changes',
      events: evs,
      backLabel: 'Changes',
      scopeRestaurant: false,
      groupMode,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>See Changes</Text>
        <Text style={text.bodyMuted}>Menu updates, prices, openings & closures</Text>
      </View>

      <View style={styles.rangeRow}>
        <Pressable
          style={[styles.rangeButton, rangeMode === 'week' && styles.rangeButtonActive]}
          onPress={() => setRangeMode('week')}
          accessibilityRole="button"
          accessibilityState={{ selected: rangeMode === 'week' }}
        >
          <Text style={[text.chip, rangeMode === 'week' && styles.rangeButtonTextActive]}>This Week</Text>
        </Pressable>
        <Pressable
          style={[styles.rangeButton, rangeMode === 'month' && styles.rangeButtonActive]}
          onPress={() => setRangeMode('month')}
          accessibilityRole="button"
          accessibilityState={{ selected: rangeMode === 'month' }}
        >
          <Text style={[text.chip, rangeMode === 'month' && styles.rangeButtonTextActive]}>This Month</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={COLORS.forest} />
        </View>
      ) : errored ? (
        <View style={styles.statePanel}>
          <Text style={text.body}>Could not load changes. Try again later.</Text>
        </View>
      ) : !facilityEvents.length && !byRestaurant.length ? (
        <View style={styles.statePanel}>
          <Text style={text.bodyMuted}>No changes in this range.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {(menuCount > 0 || priceCount > 0) && (
            <View style={styles.showAllRow}>
              {menuCount > 0 && (
                <Pressable style={styles.showAllButton} onPress={() => openShowAll('menu')}>
                  <Text style={text.buttonLabel}>🍽️ All Menu Changes ({menuCount})</Text>
                </Pressable>
              )}
              {priceCount > 0 && (
                <Pressable style={styles.showAllButton} onPress={() => openShowAll('price')}>
                  <Text style={text.buttonLabel}>💲 All Price Changes ({priceCount})</Text>
                </Pressable>
              )}
            </View>
          )}

          {facilityEvents.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={text.sectionTitle}>Openings & Closures</Text>
                <Text style={text.bodyMuted}>{facilityEvents.length}</Text>
              </View>
              <ChangeEventGroups
                events={facilityEvents}
                groupMode={groupMode}
                onPressEvent={(restaurantId) => navigation.navigate('RestaurantDetail', { restaurantId })}
              />
            </View>
          )}

          {byRestaurant.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={text.sectionTitle}>Restaurant Updates</Text>
                <Text style={text.bodyMuted}>{byRestaurant.length}</Text>
              </View>
              {byRestaurant.map((r) => {
                const cats = categoryBreakdown(r.events);
                return (
                  <Pressable
                    key={r.restaurantId ?? r.restaurantName}
                    style={styles.row}
                    onPress={() => {
                      if (cats.length === 1) {
                        navigation.navigate('ChangesCategory', {
                          catKey: cats[0].key,
                          catLabel: cats[0].label,
                          events: cats[0].events,
                          backLabel: r.restaurantName,
                          scopeRestaurant: true,
                          groupMode,
                        });
                      } else {
                        navigation.navigate('ChangesRestaurant', {
                          restaurantId: r.restaurantId,
                          restaurantName: r.restaurantName,
                          events: r.events,
                          groupMode,
                        });
                      }
                    }}
                  >
                    <View style={styles.rowLeft}>
                      <Text style={text.restaurantName} numberOfLines={1}>
                        {r.restaurantName}
                      </Text>
                      <Text style={text.bodyMuted} numberOfLines={1}>
                        {restaurantSummaryLine(r.events)}
                      </Text>
                    </View>
                    <Text style={[text.bodyMuted, styles.rowDate]}>{r.lastDate}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
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
  rangeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  rangeButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  rangeButtonActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  rangeButtonTextActive: {
    color: COLORS.goldLight,
  },
  statePanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  showAllRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  showAllButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
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
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  rowDate: {
    fontSize: 12,
  },
});
