import { useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { useActivity } from '../hooks/useActivity';
import { useSearch } from '../hooks/useSearch';
import { groupRestaurants } from '../data/groups';
import { formatRelative } from '../components/SyncStatusBar';
import { LoadingScreen } from '../components/LoadingScreen';
import { RestaurantCard } from '../components/RestaurantCard';
import { ItemResultRow } from '../components/search/ItemResultRow';
import { RelatedResultRow } from '../components/search/RelatedResultRow';
import { CategoryStrip } from '../components/search/CategoryStrip';
import { FilterPanel } from '../components/search/FilterPanel';
import { groupResultsByLocation, type ResultRow } from '../search/resultGrouping';
import {
  applyFilters,
  collectFilterOptions,
  countActiveFilters,
  emptyFilters,
  type SearchFilters,
} from '../search/filters';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;
type FilterPanelState = 'hidden' | 'peek' | 'expanded';

function FilterIcon({ active }: { active: boolean }) {
  return (
    <View style={styles.filterIcon}>
      <View style={[styles.filterIconLine, active && styles.filterIconLineActive]}>
        <View style={[styles.filterIconKnob, styles.filterIconKnobLeft, active && styles.filterIconKnobActive]} />
      </View>
      <View style={[styles.filterIconLine, active && styles.filterIconLineActive]}>
        <View style={[styles.filterIconKnob, styles.filterIconKnobRight, active && styles.filterIconKnobActive]} />
      </View>
      <View style={[styles.filterIconLine, active && styles.filterIconLineActive]}>
        <View style={[styles.filterIconKnob, styles.filterIconKnobMiddle, active && styles.filterIconKnobActive]} />
      </View>
    </View>
  );
}

function NearMeIcon() {
  return (
    <View style={styles.nearIconOuter}>
      <View style={styles.nearIconInner} />
    </View>
  );
}

// Milestone 2 shipped this screen with search visually present but inert.
// Milestone 5 wired live search + tap-through. Milestone 6 wired category
// counts, matched-term emphasis, and additive filtering. The filter UI is
// now a bottom dock instead of a modal bottom sheet so changing filters
// updates visible results immediately without covering the tab bar.
export function FindHomeScreen({ navigation }: Props) {
  const { restaurants, isLoading, error, lastSyncedAt, forceRefresh } = useDataProvider();
  const { favoritedIds } = useActivity();
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters());
  const [filterPanelState, setFilterPanelState] = useState<FilterPanelState>('hidden');

  const filteredRestaurants = useMemo(
    () => applyFilters(restaurants, filters, favoritedIds, false, null),
    [restaurants, filters, favoritedIds]
  );
  const filterOptions = useMemo(() => collectFilterOptions(restaurants), [restaurants]);
  const activeFilterCount = countActiveFilters(filters);

  const {
    query,
    setQuery,
    results,
    counts,
    isSearchActive,
    activeRelated,
    toggleRelated,
    activeCategory,
    setActiveCategory,
    clear,
  } = useSearch(filteredRestaurants);

  if (isLoading && restaurants.length === 0) {
    return <LoadingScreen label="Fetching the latest dining data…" />;
  }

  if (error && restaurants.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Text style={[text.body, styles.errorText]}>Couldn't load dining data: {error}</Text>
        <Pressable onPress={forceRefresh} style={styles.retryButton}>
          <Text style={text.buttonLabel}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const groups = groupRestaurants(filteredRestaurants);
  // Restaurants-first, then items, each grouped by park/resort/Disney
  // Springs/water-park/other then by area — owner direction, 2026-07-20.
  // Related-tag results (no location to group by) pass through ungrouped.
  const rows = groupResultsByLocation(results);

  const renderRow = ({ item: row, index }: { item: ResultRow; index: number }) => {
    if (row.type === 'group-header') {
      return (
        <View style={[styles.groupHeader, index === 0 && styles.firstGroupHeader]}>
          <Text style={text.sectionTitle}>{row.label}</Text>
        </View>
      );
    }
    if (row.type === 'area-header') {
      return <Text style={[text.bodyMuted, styles.areaHeader]}>{row.label}</Text>;
    }

    const r = row.result;
    if (r.kind === 'restaurant') {
      return (
        <RestaurantCard
          restaurant={r.restaurant}
          highlightQuery={query}
          onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: r.restaurant.restaurant_id })}
        />
      );
    }
    if (r.kind === 'item') {
      return (
        <ItemResultRow
          item={r.item}
          restaurant={r.restaurant}
          highlightQuery={query}
          onPress={() =>
            navigation.navigate('RestaurantDetail', {
              restaurantId: r.item.restaurant_id,
              itemId: r.item.item_id,
              period: r.item.dining_period,
              category: r.item.category,
            })
          }
        />
      );
    }
    return (
      <RelatedResultRow
        tag={r.tag}
        active={!!activeRelated && activeRelated.kind === r.tag.kind && activeRelated.value === r.tag.value}
        onPress={() => toggleRelated(r.tag)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {!isSearchActive && (
        <View style={styles.header}>
          <Image
            source={require('../../assets/rumbly-wordmark.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="Rumbly"
          />
          <Text style={text.bodyMuted}>Updated {formatRelative(lastSyncedAt)}</Text>
        </View>
      )}

      <View style={styles.searchRow}>
        <Pressable
          onPress={() => setFilterPanelState((state) => (state === 'hidden' ? 'peek' : 'hidden'))}
          accessibilityLabel={filterPanelState === 'hidden' ? 'Show filters' : 'Hide filters'}
          accessibilityRole="button"
          accessibilityState={{ expanded: filterPanelState !== 'hidden' }}
          style={[styles.iconButton, filterPanelState !== 'hidden' && styles.iconButtonActive]}
        >
          <FilterIcon active={filterPanelState !== 'hidden'} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.searchInputShell}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={COLORS.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            accessibilityLabel="Search food, drinks, or restaurants"
            returnKeyType="search"
          />
          {query.trim().length > 0 && (
            <Pressable onPress={clear} accessibilityLabel="Clear search" style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          disabled
          accessibilityLabel="Near Me unavailable until location sorting is added"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.iconButton, styles.iconButtonDisabled]}
        >
          <NearMeIcon />
        </Pressable>
      </View>

      {isSearchActive && <CategoryStrip active={activeCategory} counts={counts} onSelect={setActiveCategory} />}

      {isSearchActive ? (
        results.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={text.body}>No matches for "{query}".</Text>
            <Text style={[text.bodyMuted, styles.noResultsHint]}>Check spelling or try a broader term.</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            style={styles.resultList}
            contentContainerStyle={styles.searchContent}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            keyboardShouldPersistTaps="handled"
          />
        )
      ) : (
        <ScrollView style={styles.resultList} contentContainerStyle={styles.content}>
          <Text style={[text.sectionTitle, styles.sectionTitle]}>Browse by location</Text>
          {groups.length === 0 ? (
            <Text style={text.bodyMuted}>No restaurants match the current filters.</Text>
          ) : (
            <View style={styles.pillWrap}>
              {groups.map((group) => (
                <Pressable
                  key={group.key}
                  style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                  onPress={() =>
                    navigation.navigate('RestaurantList', { groupKey: group.key, groupLabel: group.label })
                  }
                >
                  <Text style={text.chip}>{group.label}</Text>
                  <Text style={text.bodyMuted}>{group.restaurants.length}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <FilterPanel
        filters={filters}
        options={filterOptions}
        resultCount={filteredRestaurants.length}
        visible={filterPanelState !== 'hidden'}
        expanded={filterPanelState === 'expanded'}
        onExpandedChange={(expanded) => setFilterPanelState(expanded ? 'expanded' : 'peek')}
        onChange={setFilters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  // Source asset is 336x137 (~2.45:1) — height-constrained, width follows
  // via resizeMode="contain" so it never distorts.
  wordmark: {
    width: 88,
    height: 36,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  iconButtonActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  filterIcon: {
    width: 22,
    gap: 4,
  },
  filterIconLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.ink,
  },
  filterIconLineActive: {
    backgroundColor: COLORS.goldLight,
  },
  filterIconKnob: {
    position: 'absolute',
    top: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.surface,
    backgroundColor: COLORS.ink,
  },
  filterIconKnobActive: {
    backgroundColor: COLORS.goldLight,
  },
  filterIconKnobLeft: {
    left: 2,
  },
  filterIconKnobMiddle: {
    left: 7,
  },
  filterIconKnobRight: {
    right: 2,
  },
  nearIconOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearIconInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.ink,
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10,
    color: COLORS.surface,
  },
  searchInputShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: text.body.fontFamily,
    fontSize: 15,
    color: COLORS.ink,
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
    color: COLORS.ink,
  },
  resultList: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
  },
  searchContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  // "Restaurants first, then items, each grouped by park then area" —
  // owner direction 2026-07-20. groupHeader is the primary divider (park/
  // resort/Disney Springs/water-park/other); areaHeader is the lighter
  // secondary heading nested under it (Fantasyland, West Side, etc.).
  groupHeader: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  firstGroupHeader: {
    marginTop: 0,
    paddingTop: SPACING.xs,
    borderTopWidth: 0,
  },
  areaHeader: {
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    marginBottom: SPACING.md,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  pillPressed: {
    opacity: 0.6,
  },
  noResults: {
    flex: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultsHint: {
    marginTop: SPACING.xs,
  },
  errorText: {
    margin: SPACING.xl,
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'center',
  },
});
