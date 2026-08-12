import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChangesStackParamList } from '../navigation/changesTypes';
import type { ChangeEvent } from '../data/types';
import {
  categoryBreakdown,
  changeQueryTokens,
  changeSearchHaystack,
  changesEarliestDate,
  clampDayStr,
  dayStr,
  daysAgoStr,
  formatRangeLabel,
  groupEventsByRestaurant,
  groupModeForRange,
  haystackMatchesTokens,
  loadChangesForRange,
  parseDayStr,
  restaurantSummaryLine,
  todayStr,
} from '../data/changes';
import { ChangeEventGroups } from '../components/changes/ChangeEventGroups';
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<ChangesStackParamList, 'ChangesHome'>;

type RangeMode = 'week' | 'month' | 'custom';
type RangeEdge = 'from' | 'to';

// How far back the custom picker will go when the manifest can't be read
// (offline, or a request that failed). Deliberately generous -- the real
// floor is whatever changesEarliestDate() reports, and an over-wide picker
// just yields an empty range rather than an error.
const FALLBACK_EARLIEST = '2024-01-01';

// Level 0 of the ported See Changes feature (see src/data/changes.ts for
// the full port notes): date-range picker, aggregate show-all buttons,
// Openings & Closures, and Restaurant Updates (one row per restaurant
// with any change, tap to drill into Level 1).
//
// The original port shipped "This Week"/"This Month" presets only, noting a
// real custom range was skipped to avoid a native date-picker dependency.
// That dependency arrived anyway for the Journal composer's visit date
// (@expo/ui's community DateTimePicker), so the custom range is now here on
// the same platform split that screen established: an inline picker inside
// a modal on iOS, the native dialog on Android.
export function ChangesHomeScreen({ navigation }: Props) {
  const [rangeMode, setRangeMode] = useState<RangeMode>('week');
  const [customFrom, setCustomFrom] = useState(() => daysAgoStr(29));
  const [customTo, setCustomTo] = useState(() => todayStr());
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [query, setQuery] = useState('');
  const [earliest, setEarliest] = useState<string | null>(null);

  // Custom-range picker: drafts so Cancel really cancels -- the applied
  // range only moves on Done, which also avoids refetching once per nudge
  // of the wheel while the user is still choosing.
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftFrom, setDraftFrom] = useState(customFrom);
  const [draftTo, setDraftTo] = useState(customTo);
  const [editingEdge, setEditingEdge] = useState<RangeEdge>('from');
  const [androidEdge, setAndroidEdge] = useState<RangeEdge | null>(null);

  const { from, to } = useMemo(() => {
    if (rangeMode === 'week') return { from: daysAgoStr(6), to: todayStr() };
    if (rangeMode === 'month') return { from: daysAgoStr(29), to: todayStr() };
    return { from: customFrom, to: customTo };
  }, [rangeMode, customFrom, customTo]);

  const groupMode = useMemo(() => groupModeForRange(from, to), [from, to]);
  const rangeLabel = useMemo(() => formatRangeLabel(from, to), [from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    loadChangesForRange(from, to)
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
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    changesEarliestDate().then((d) => {
      if (!cancelled) setEarliest(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keystroke filtering runs against a haystack built once per loaded range
  // rather than re-deriving each event's searchable text on every render;
  // useDeferredValue keeps the field itself responsive when a month's worth
  // of events makes that filter pass non-trivial.
  const deferredQuery = useDeferredValue(query);
  const haystacks = useMemo(() => events.map(changeSearchHaystack), [events]);
  const tokens = useMemo(() => changeQueryTokens(deferredQuery), [deferredQuery]);
  const searching = tokens.length > 0;
  const visibleEvents = useMemo(() => {
    if (!searching) return events;
    return events.filter((_, i) => haystackMatchesTokens(haystacks[i], tokens));
  }, [events, haystacks, tokens, searching]);

  const facilityEvents = useMemo(
    () => visibleEvents.filter((e) => e.category === 'restaurant_added' || e.category === 'restaurant_closed'),
    [visibleEvents]
  );
  const changeEvents = useMemo(
    () =>
      visibleEvents.filter(
        (e) => e.category === 'menu_item_added' || e.category === 'menu_item_removed' || e.category === 'price_change'
      ),
    [visibleEvents]
  );
  const menuCount = useMemo(
    () => changeEvents.filter((e) => e.category === 'menu_item_added' || e.category === 'menu_item_removed').length,
    [changeEvents]
  );
  const priceCount = useMemo(() => changeEvents.filter((e) => e.category === 'price_change').length, [changeEvents]);
  const byRestaurant = useMemo(() => groupEventsByRestaurant(changeEvents), [changeEvents]);

  const activeQuery = searching ? deferredQuery.trim() : undefined;

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
      rangeLabel,
      query: activeQuery,
    });
  };

  const floor = earliest ?? FALLBACK_EARLIEST;
  const ceiling = todayStr();

  const openCustomPicker = useCallback(() => {
    // Seed from whatever range is on screen so "Custom" starts where the
    // user already is. Clamped because a preset range can begin before the
    // feed's first published month, and SwiftUI's graphical picker wants a
    // selection inside its own range.
    setDraftFrom(clampDayStr(from, floor, ceiling));
    setDraftTo(clampDayStr(to, floor, ceiling));
    setEditingEdge('from');
    setAndroidEdge(null);
    setPickerVisible(true);
  }, [from, to, floor, ceiling]);

  const applyCustomRange = useCallback(() => {
    // The pickers are already bounded so from <= to, but a stale draft is
    // cheap to guard against and an inverted range would silently render
    // an empty list with no hint why.
    const nextFrom = draftFrom <= draftTo ? draftFrom : draftTo;
    const nextTo = draftFrom <= draftTo ? draftTo : draftFrom;
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
    setRangeMode('custom');
    setPickerVisible(false);
    setAndroidEdge(null);
  }, [draftFrom, draftTo]);

  // Each endpoint is bounded by the other, so an invalid range simply can't
  // be expressed in the UI -- no error copy, no post-hoc validation.
  const edgeBounds = (edge: RangeEdge) =>
    edge === 'from'
      ? { min: floor, max: clampDayStr(draftTo, floor, ceiling) }
      : { min: clampDayStr(draftFrom, floor, ceiling), max: ceiling };

  const setEdge = (edge: RangeEdge, value: string) => {
    const { min, max } = edgeBounds(edge);
    const clamped = clampDayStr(value, min, max);
    if (edge === 'from') setDraftFrom(clamped);
    else setDraftTo(clamped);
  };

  const pressEdge = (edge: RangeEdge) => {
    setEditingEdge(edge);
    if (Platform.OS === 'android') setAndroidEdge(edge);
  };

  const renderRangeButton = (mode: RangeMode, label: string) => (
    <Pressable
      style={[styles.rangeButton, rangeMode === mode && styles.rangeButtonActive]}
      onPress={() => (mode === 'custom' ? openCustomPicker() : setRangeMode(mode))}
      accessibilityRole="button"
      accessibilityState={{ selected: rangeMode === mode }}
      accessibilityLabel={mode === 'custom' ? 'Choose a custom date range' : label}
    >
      <Text style={[text.chip, rangeMode === mode && styles.rangeButtonTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  const emptyMessage = searching
    ? `No changes matching “${deferredQuery.trim()}” in this range.`
    : 'No changes in this range.';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>THE LATEST</Text>
            <Text style={styles.title}>What changed?</Text>
            <Text style={styles.heroBody}>New bites, price moves, openings, and goodbyes—without the scavenger hunt.</Text>
          </View>
          <IllustrationSlot tagId="changes.hero.whats-new.v1" variant="artwork" style={styles.heroArt} />
        </View>
      </View>

      <View style={styles.rangeRow}>
        {renderRangeButton('week', 'This Week')}
        {renderRangeButton('month', 'This Month')}
        {renderRangeButton('custom', 'Custom')}
      </View>

      {rangeMode === 'custom' && (
        <Pressable
          style={styles.customSummary}
          onPress={openCustomPicker}
          accessibilityRole="button"
          accessibilityLabel={`Change date range, currently ${rangeLabel}`}
        >
          <Text style={text.bodyMuted} numberOfLines={1}>
            Showing {rangeLabel}
          </Text>
          <Text style={styles.customSummaryAction}>Change</Text>
        </Pressable>
      )}

      <View style={styles.searchRow}>
        <View style={styles.searchInputShell}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search these changes"
            placeholderTextColor={DAYLIGHT.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search these changes by item or restaurant"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityLabel="Clear changes search"
              accessibilityRole="button"
              hitSlop={8}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator color={DAYLIGHT.ocean} />
        </View>
      ) : errored ? (
        <View style={styles.statePanel}>
          <Text style={text.body}>Could not load changes. Try again later.</Text>
        </View>
      ) : !facilityEvents.length && !byRestaurant.length ? (
        <View style={styles.statePanel}>
          <Text style={[text.bodyMuted, styles.emptyText]}>{emptyMessage}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardDismissMode="on-drag">
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
                          rangeLabel,
                          query: activeQuery,
                        });
                      } else {
                        navigation.navigate('ChangesRestaurant', {
                          restaurantId: r.restaurantId,
                          restaurantName: r.restaurantName,
                          events: r.events,
                          groupMode,
                          rangeLabel,
                          query: activeQuery,
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

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Pressable onPress={() => setPickerVisible(false)} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.pickerAction}>Cancel</Text>
              </Pressable>
              <Text style={styles.pickerTitle}>Custom range</Text>
              <Pressable onPress={applyCustomRange} accessibilityRole="button" accessibilityLabel="Apply date range">
                <Text style={styles.pickerAction}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.edgeRow}>
              {(
                [
                  ['from', 'Start', draftFrom],
                  ['to', 'End', draftTo],
                ] as const
              ).map(([edge, label, value]) => (
                <Pressable
                  key={edge}
                  style={[styles.edgeButton, editingEdge === edge && styles.edgeButtonActive]}
                  onPress={() => pressEdge(edge)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: editingEdge === edge }}
                  accessibilityLabel={`${label} date, ${formatRangeLabel(value, value)}`}
                >
                  <Text style={[text.bodyMuted, editingEdge === edge && styles.edgeLabelActive]}>{label}</Text>
                  <Text style={[styles.edgeValue, editingEdge === edge && styles.edgeValueActive]} numberOfLines={1}>
                    {formatRangeLabel(value, value)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {Platform.OS === 'ios' ? (
              <DateTimePicker
                style={styles.iosPicker}
                value={parseDayStr(editingEdge === 'from' ? draftFrom : draftTo)}
                mode="date"
                display="inline"
                minimumDate={parseDayStr(edgeBounds(editingEdge).min)}
                maximumDate={parseDayStr(edgeBounds(editingEdge).max)}
                accentColor={DAYLIGHT.ocean}
                onValueChange={(_event, date) => setEdge(editingEdge, dayStr(date))}
              />
            ) : (
              <>
                <Text style={[text.bodyMuted, styles.androidHint]}>
                  Tap Start or End to pick a date.
                </Text>
                {androidEdge !== null && (
                  <DateTimePicker
                    value={parseDayStr(androidEdge === 'from' ? draftFrom : draftTo)}
                    mode="date"
                    presentation="dialog"
                    minimumDate={parseDayStr(edgeBounds(androidEdge).min)}
                    maximumDate={parseDayStr(edgeBounds(androidEdge).max)}
                    accentColor={DAYLIGHT.ocean}
                    onValueChange={(_event, date) => {
                      setEdge(androidEdge, dayStr(date));
                      setAndroidEdge(null);
                    }}
                    onDismiss={() => setAndroidEdge(null)}
                  />
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DAYLIGHT.mist,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    backgroundColor: DAYLIGHT.sky,
  },
  hero: {
    minHeight: 190,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 30,
    padding: SPACING.lg,
    backgroundColor: '#F8E5B9',
  },
  heroCopy: {
    flex: 1,
    zIndex: 1,
    paddingRight: SPACING.sm,
  },
  heroEyebrow: {
    fontFamily: text.categoryHeader.fontFamily,
    fontSize: 10,
    letterSpacing: 1,
    color: DAYLIGHT.coral,
  },
  title: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 31,
    lineHeight: 33,
    color: DAYLIGHT.ink,
    marginTop: SPACING.xs,
  },
  heroBody: {
    fontFamily: text.body.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: DAYLIGHT.muted,
    marginTop: SPACING.sm,
  },
  heroArt: {
    width: 132,
    minHeight: 158,
    marginRight: -32,
    backgroundColor: '#F3D4C9',
  },
  rangeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  rangeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: '#FFFFFF',
  },
  rangeButtonActive: {
    backgroundColor: DAYLIGHT.ocean,
  },
  rangeButtonTextActive: {
    color: '#FFFFFF',
  },
  customSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  customSummaryAction: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 12,
    color: DAYLIGHT.ocean,
  },
  searchRow: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  searchInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: text.body.fontFamily,
    fontSize: 15,
    color: DAYLIGHT.ink,
    paddingVertical: SPACING.sm,
  },
  clearButton: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 18,
    color: DAYLIGHT.ink,
  },
  statePanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  emptyText: {
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  showAllRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  showAllButton: {
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: DAYLIGHT.sky,
  },
  section: {
    marginBottom: SPACING.lg,
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
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: RADII.lg,
    backgroundColor: '#FFFFFF',
    gap: SPACING.md,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  rowDate: {
    fontSize: 12,
  },
  pickerBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: 'rgba(23, 40, 45, 0.45)',
  },
  pickerCard: {
    width: '100%',
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    backgroundColor: DAYLIGHT.paper,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  pickerTitle: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 17,
    color: DAYLIGHT.ink,
  },
  pickerAction: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 13,
    color: DAYLIGHT.ocean,
  },
  edgeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  edgeButton: {
    flex: 1,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#FFFFFF',
  },
  edgeButtonActive: {
    borderColor: DAYLIGHT.ocean,
    backgroundColor: DAYLIGHT.sky,
  },
  edgeLabelActive: {
    color: DAYLIGHT.ocean,
  },
  edgeValue: {
    fontFamily: text.restaurantName.fontFamily,
    fontSize: 15,
    color: DAYLIGHT.ink,
  },
  edgeValueActive: {
    color: DAYLIGHT.ocean,
  },
  // No explicit height: the picker's SwiftUI Host is mounted with
  // matchContents vertical, so it reports its own natural height (~340 for
  // the graphical calendar) and a hard-coded one would fight it.
  iosPicker: {
    marginTop: SPACING.sm,
  },
  androidHint: {
    marginTop: SPACING.md,
  },
});
