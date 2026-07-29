import type { ReactNode } from 'react';
import { BottomSheet, RNHostView } from '@expo/ui';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { presentationBackgroundInteraction } from '@expo/ui/swift-ui/modifiers';
import {
  countActiveFilters,
  cuisineLabel,
  DIETARY_FILTERS,
  type SearchFilters,
} from '../../search/filters';
import type { FilterGroupKey } from '../../search/findState';
import { QUICK_LOCATIONS } from '../../search/quickLocations';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';
import type { FilterPanelProps } from './FilterPanel';

const FILTER_GROUPS: FilterGroupKey[] = ['location', 'food', 'dining', 'price', 'dietary'];
const PRICE_LABELS: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
const COMPACT_SHEET_FRACTION = 0.34;

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function groupCount(filters: SearchFilters, group: FilterGroupKey, locationDetailCount = 0): number {
  if (group === 'location') return locationDetailCount;
  if (group === 'food') return filters.cuisines.size;
  if (group === 'dining') return filters.mealPeriods.size + filters.serviceTypes.size;
  if (group === 'dietary') return filters.dietary.size;
  return filters.priceTiers.size;
}

function clearGroup(filters: SearchFilters, group: FilterGroupKey): SearchFilters {
  if (group === 'location') {
    return { ...filters, parks: new Set(), resorts: new Set(), accessibleWithoutAdmission: false };
  }
  if (group === 'food') return { ...filters, cuisines: new Set() };
  if (group === 'dining') return { ...filters, mealPeriods: new Set(), serviceTypes: new Set() };
  if (group === 'dietary') return { ...filters, dietary: new Set() };
  return { ...filters, priceTiers: new Set(), lovedOnly: false };
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
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[text.chip, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function OptionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.optionBlock}>
      <Text style={[text.sectionToggle, styles.optionTitle]}>{title.toUpperCase()}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

function QuickLocationChips({
  quickLocations,
  onQuickLocationToggle,
}: Pick<FilterPanelProps, 'quickLocations' | 'onQuickLocationToggle'>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.quickContent}
    >
      {QUICK_LOCATIONS.map((location) => (
        <FilterChip
          key={location.key}
          label={location.label}
          active={quickLocations.has(location.key)}
          onPress={() => onQuickLocationToggle(location.key)}
        />
      ))}
    </ScrollView>
  );
}

export function NativeFilterPanel({
  filters,
  options,
  resultCount,
  visible,
  expanded,
  activeGroup,
  quickLocations,
  quickLocationDetails,
  locationDetailGroups,
  quickLocationsInline,
  onActiveGroupChange,
  onQuickLocationToggle,
  onQuickLocationDetailToggle,
  onClearLocationDetails,
  onClearAll,
  onChange,
  onCollapseToPeek,
}: FilterPanelProps) {
  const activeCount = countActiveFilters(filters) + quickLocationDetails.size;
  const activeGroupCount = groupCount(filters, activeGroup, quickLocationDetails.size);

  const renderOptions = () => {
    if (activeGroup === 'location') {
      return (
        <>
          {!quickLocationsInline && (
            <View style={styles.optionBlock}>
              <Text style={[text.sectionToggle, styles.optionTitle]}>DESTINATIONS</Text>
              <View style={styles.sheetQuickRail}>
                <QuickLocationChips
                  quickLocations={quickLocations}
                  onQuickLocationToggle={onQuickLocationToggle}
                />
              </View>
            </View>
          )}
          {locationDetailGroups.length === 0 ? (
            <Text style={[text.bodyMuted, styles.emptyGroupHint]}>
              {quickLocationsInline
                ? 'Pick a park under the search bar to narrow by location.'
                : 'Pick a park or area above to narrow by location.'}
            </Text>
          ) : (
            locationDetailGroups.map((group) => (
              <OptionBlock key={group.key} title={group.label}>
                {group.options.map((option) => (
                  <FilterChip
                    key={option.key}
                    label={option.label}
                    active={quickLocationDetails.has(option.key)}
                    onPress={() => onQuickLocationDetailToggle(option.key)}
                  />
                ))}
              </OptionBlock>
            ))
          )}
        </>
      );
    }

    if (activeGroup === 'food') {
      return (
        <OptionBlock title="Cuisine">
          {options.cuisines.map((cuisine) => (
            <FilterChip
              key={cuisine}
              label={cuisineLabel(cuisine)}
              active={filters.cuisines.has(cuisine)}
              onPress={() => onChange({ ...filters, cuisines: toggleInSet(filters.cuisines, cuisine) })}
            />
          ))}
        </OptionBlock>
      );
    }

    if (activeGroup === 'dining') {
      return (
        <>
          <OptionBlock title="Meal Period">
            {options.mealPeriods.map((period) => (
              <FilterChip
                key={period}
                label={period}
                active={filters.mealPeriods.has(period)}
                onPress={() =>
                  onChange({ ...filters, mealPeriods: toggleInSet(filters.mealPeriods, period) })
                }
              />
            ))}
          </OptionBlock>
          <OptionBlock title="Service">
            {options.serviceTypes.map((serviceType) => (
              <FilterChip
                key={serviceType}
                label={serviceType}
                active={filters.serviceTypes.has(serviceType)}
                onPress={() =>
                  onChange({
                    ...filters,
                    serviceTypes: toggleInSet(filters.serviceTypes, serviceType),
                  })
                }
              />
            ))}
          </OptionBlock>
        </>
      );
    }

    if (activeGroup === 'dietary') {
      return (
        <>
          <Text style={[text.bodyMuted, styles.emptyGroupHint]}>
            Allergy-friendly items stay hidden from unfiltered search unless you select a dietary
            filter or enable them in General settings.
          </Text>
          <OptionBlock title="Dietary">
            {DIETARY_FILTERS.map((option) => (
              <FilterChip
                key={option.key}
                label={option.label}
                active={filters.dietary.has(option.key)}
                onPress={() =>
                  onChange({ ...filters, dietary: toggleInSet(filters.dietary, option.key) })
                }
              />
            ))}
          </OptionBlock>
        </>
      );
    }

    return (
      <OptionBlock title="Price">
        {[1, 2, 3, 4].map((tier) => (
          <FilterChip
            key={tier}
            label={PRICE_LABELS[tier]}
            active={filters.priceTiers.has(tier)}
            onPress={() =>
              onChange({ ...filters, priceTiers: toggleInSet(filters.priceTiers, tier) })
            }
          />
        ))}
      </OptionBlock>
    );
  };

  return (
    <BottomSheet
      isPresented={visible && expanded}
      onDismiss={onCollapseToPeek}
      showDragIndicator
      snapPoints={[{ fraction: COMPACT_SHEET_FRACTION }, 'full']}
      testID="native-filter-sheet"
      modifiers={[
        presentationBackgroundInteraction({
          type: 'enabledUpThrough',
          detent: { fraction: COMPACT_SHEET_FRACTION },
        }),
      ]}
    >
      <RNHostView>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={text.sectionTitle}>Filters</Text>
              <Text style={text.bodyMuted}>{resultCount} results</Text>
            </View>
            <View style={styles.actionButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: activeGroupCount === 0 }}
                disabled={activeGroupCount === 0}
                onPress={() => {
                  if (activeGroup === 'location') onClearLocationDetails();
                  else onChange(clearGroup(filters, activeGroup));
                }}
              >
                <Text style={[text.buttonLabel, activeGroupCount === 0 && styles.disabledText]}>
                  Clear group
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  disabled: activeCount === 0 && quickLocations.size === 0,
                }}
                disabled={activeCount === 0 && quickLocations.size === 0}
                onPress={onClearAll}
              >
                <Text
                  style={[
                    text.buttonLabel,
                    activeCount === 0 && quickLocations.size === 0 && styles.disabledText,
                  ]}
                >
                  Clear all
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.groupTabs} accessibilityRole="tablist">
            {FILTER_GROUPS.map((group) => {
              const selected = activeGroup === group;
              const count = groupCount(filters, group, quickLocationDetails.size);
              const label = group.charAt(0).toUpperCase() + group.slice(1);
              return (
                <Pressable
                  key={group}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => onActiveGroupChange(group)}
                  style={[styles.groupTab, selected && styles.groupTabActive]}
                >
                  <Text style={[styles.groupLabel, selected && styles.groupLabelActive]}>
                    {label}
                    {count ? ` ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={styles.optionsContent}
            keyboardShouldPersistTaps="handled"
          >
            {renderOptions()}
          </ScrollView>
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quickContent: {
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  sheetQuickRail: {
    marginHorizontal: -SPACING.md,
  },
  sheet: {
    flex: 1,
    minWidth: '100%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  disabledText: {
    color: COLORS.dim,
  },
  groupTabs: {
    flexDirection: 'row',
    gap: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupTab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  groupTabActive: {
    borderBottomColor: COLORS.forest,
  },
  groupLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10,
    color: COLORS.muted,
  },
  groupLabelActive: {
    color: COLORS.forest,
  },
  optionsScroll: {
    flex: 1,
  },
  optionsContent: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  optionBlock: {
    marginBottom: SPACING.md,
  },
  optionTitle: {
    marginBottom: SPACING.xs,
  },
  emptyGroupHint: {
    paddingBottom: SPACING.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
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
});
