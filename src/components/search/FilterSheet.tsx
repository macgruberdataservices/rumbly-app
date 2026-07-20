// Custom Modal+Animated bottom sheet (no new dependency, matching the
// roadmap's Milestone 6 call-out) for the additive filter groups. Owns a
// draft copy of filters internally so selections can preview a live
// result count (per the search spec) without touching the real applied
// filters until "Show N results" is tapped — Clear all/dismiss-without-
// applying both discard the draft cleanly.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  applyFilters,
  cuisineLabel,
  countActiveFilters,
  emptyFilters,
  type FilterOptions,
  type SearchFilters,
} from '../../search/filters';
import type { Restaurant, HoursData } from '../../data/types';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PRICE_LABELS: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[text.chip, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={[text.sectionToggle, styles.groupTitle]}>{title.toUpperCase()}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

export function FilterSheet({
  visible,
  initialFilters,
  options,
  restaurants,
  favoritedIds,
  openNow,
  hoursData,
  onApply,
  onClose,
}: {
  visible: boolean;
  initialFilters: SearchFilters;
  options: FilterOptions;
  restaurants: Restaurant[];
  favoritedIds: Set<string>;
  openNow: boolean;
  hoursData: HoursData | null;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SearchFilters>(initialFilters);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      setDraft(initialFilters);
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }).start();
    }
    // initialFilters deliberately excluded — the draft should only reset
    // when the sheet transitions to visible, not on every parent re-render
    // while it's already open (that would clobber in-progress selections).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, translateY]);

  const previewCount = useMemo(
    () => applyFilters(restaurants, draft, favoritedIds, openNow, hoursData).length,
    [restaurants, draft, favoritedIds, openNow, hoursData]
  );

  const handleClearAll = () => setDraft(emptyFilters());
  const handleShow = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={[text.sectionTitle, styles.title]}>Filters</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <FilterGroup title="Location">
                {options.parks.map((park) => (
                  <FilterChip
                    key={park}
                    label={park}
                    active={draft.parks.has(park)}
                    onPress={() => setDraft((d) => ({ ...d, parks: toggleInSet(d.parks, park) }))}
                  />
                ))}
                {options.resorts.map((resort) => (
                  <FilterChip
                    key={resort}
                    label={resort}
                    active={draft.resorts.has(resort)}
                    onPress={() => setDraft((d) => ({ ...d, resorts: toggleInSet(d.resorts, resort) }))}
                  />
                ))}
                <FilterChip
                  label="Accessible without park admission"
                  active={draft.accessibleWithoutAdmission}
                  onPress={() =>
                    setDraft((d) => ({ ...d, accessibleWithoutAdmission: !d.accessibleWithoutAdmission }))
                  }
                />
              </FilterGroup>

              <FilterGroup title="Food">
                {options.cuisines.map((cuisine) => (
                  <FilterChip
                    key={cuisine}
                    label={cuisineLabel(cuisine)}
                    active={draft.cuisines.has(cuisine)}
                    onPress={() => setDraft((d) => ({ ...d, cuisines: toggleInSet(d.cuisines, cuisine) }))}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Dining">
                {options.mealPeriods.map((period) => (
                  <FilterChip
                    key={period}
                    label={period}
                    active={draft.mealPeriods.has(period)}
                    onPress={() => setDraft((d) => ({ ...d, mealPeriods: toggleInSet(d.mealPeriods, period) }))}
                  />
                ))}
                {options.serviceTypes.map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
                    active={draft.serviceTypes.has(type)}
                    onPress={() => setDraft((d) => ({ ...d, serviceTypes: toggleInSet(d.serviceTypes, type) }))}
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Price & Personal">
                {[1, 2, 3, 4].map((tier) => (
                  <FilterChip
                    key={tier}
                    label={PRICE_LABELS[tier]}
                    active={draft.priceTiers.has(tier)}
                    onPress={() => setDraft((d) => ({ ...d, priceTiers: toggleInSet(d.priceTiers, tier) }))}
                  />
                ))}
                <FilterChip
                  label="Favorites"
                  active={draft.favoritesOnly}
                  onPress={() => setDraft((d) => ({ ...d, favoritesOnly: !d.favoritesOnly }))}
                />
              </FilterGroup>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                onPress={handleClearAll}
                style={styles.clearButton}
                disabled={countActiveFilters(draft) === 0}
              >
                <Text
                  style={[text.buttonLabel, countActiveFilters(draft) === 0 && styles.clearButtonDisabled]}
                >
                  Clear all
                </Text>
              </Pressable>
              <Pressable onPress={handleShow} style={styles.showButton}>
                <Text style={styles.showButtonLabel}>Show {previewCount} results</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingTop: SPACING.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderMid,
    marginBottom: SPACING.md,
  },
  title: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  // Bounded independently of the outer sheet's maxHeight (not flex:1 —
  // the sheet's own height is intrinsic/content-driven, not a fixed
  // container flex:1 could measure against) so long filter-option lists
  // scroll internally instead of pushing the footer (Clear all/Show N
  // results) below the sheet's visible area. 0.6 + handle/title (~80pt)
  // + footer (~90pt) stays comfortably under the sheet's 0.85 cap.
  scroll: {
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  group: {
    marginBottom: SPACING.lg,
  },
  groupTitle: {
    marginBottom: SPACING.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  chipPressed: {
    opacity: 0.6,
  },
  chipActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  chipTextActive: {
    color: COLORS.goldLight,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  clearButton: {
    paddingVertical: SPACING.sm,
  },
  clearButtonDisabled: {
    color: COLORS.dim,
  },
  showButton: {
    backgroundColor: COLORS.forest,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  showButtonLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 15,
    color: COLORS.goldLight,
  },
});
