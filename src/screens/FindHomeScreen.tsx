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
import { FilterSheet } from '../components/search/FilterSheet';
import type { SearchResult } from '../search/rank';
import {
  applyFilters,
  collectFilterOptions,
  countActiveFilters,
  cuisineLabel,
  emptyFilters,
  type SearchFilters,
} from '../search/filters';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;

function resultKey(r: SearchResult): string {
  if (r.kind === 'restaurant') return `restaurant:${r.restaurant.restaurant_id}`;
  if (r.kind === 'item') return `item:${r.item.restaurant_id}:${r.item.item_id}`;
  return `related:${r.tag.kind}:${r.tag.value}`;
}

// One removable chip per active filter selection, each able to clear
// itself independently — the search spec's "chips explain why the result
// set looks the way it does" requirement.
function activeFilterChips(filters: SearchFilters): { key: string; label: string; clear: (f: SearchFilters) => SearchFilters }[] {
  const chips: { key: string; label: string; clear: (f: SearchFilters) => SearchFilters }[] = [];
  for (const park of filters.parks) {
    chips.push({ key: `park:${park}`, label: park, clear: (f) => ({ ...f, parks: new Set([...f.parks].filter((p) => p !== park)) }) });
  }
  for (const resort of filters.resorts) {
    chips.push({ key: `resort:${resort}`, label: resort, clear: (f) => ({ ...f, resorts: new Set([...f.resorts].filter((r) => r !== resort)) }) });
  }
  if (filters.accessibleWithoutAdmission) {
    chips.push({ key: 'admission', label: 'No admission required', clear: (f) => ({ ...f, accessibleWithoutAdmission: false }) });
  }
  for (const cuisine of filters.cuisines) {
    chips.push({
      key: `cuisine:${cuisine}`,
      label: cuisineLabel(cuisine),
      clear: (f) => ({ ...f, cuisines: new Set([...f.cuisines].filter((c) => c !== cuisine)) }),
    });
  }
  for (const period of filters.mealPeriods) {
    chips.push({ key: `period:${period}`, label: period, clear: (f) => ({ ...f, mealPeriods: new Set([...f.mealPeriods].filter((p) => p !== period)) }) });
  }
  for (const type of filters.serviceTypes) {
    chips.push({ key: `service:${type}`, label: type, clear: (f) => ({ ...f, serviceTypes: new Set([...f.serviceTypes].filter((t) => t !== type)) }) });
  }
  for (const tier of filters.priceTiers) {
    const label = '$'.repeat(tier);
    chips.push({ key: `price:${tier}`, label, clear: (f) => ({ ...f, priceTiers: new Set([...f.priceTiers].filter((t) => t !== tier)) }) });
  }
  if (filters.favoritesOnly) {
    chips.push({ key: 'favorites', label: 'Favorites', clear: (f) => ({ ...f, favoritesOnly: false }) });
  }
  return chips;
}

// Milestone 2 shipped this screen with search visually present but inert.
// Milestone 5 wired live search + tap-through. This is Milestone 6:
// category strip with counts, matched-term emphasis, the additive filter
// sheet, and a real Open Now quick filter. Filters/Open Now narrow both
// the search results AND the default browse-by-location groups — a
// deliberate extension beyond what the search spec spells out (it only
// discusses the active-search state), reasoned the same "quick filters
// stay visible in both Find states" way the spec already frames them.
export function FindHomeScreen({ navigation }: Props) {
  const { restaurants, hoursData, isLoading, error, lastSyncedAt, forceRefresh } = useDataProvider();
  const { favoritedIds } = useActivity();
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters());
  const [openNow, setOpenNow] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const filteredRestaurants = useMemo(
    () => applyFilters(restaurants, filters, favoritedIds, openNow, hoursData),
    [restaurants, filters, favoritedIds, openNow, hoursData]
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
  const chips = activeFilterChips(filters);

  const renderResult = ({ item: r }: { item: SearchResult }) => {
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
        <TextInput
          style={styles.searchInput}
          placeholder="Search food, drinks, or restaurants"
          placeholderTextColor={COLORS.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          accessibilityLabel="Search food, drinks, or restaurants"
          returnKeyType="search"
        />
        {isSearchActive && (
          <Pressable onPress={clear} accessibilityLabel="Clear search" style={styles.clearButton}>
            <Text style={text.chip}>×</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.quickFilterRow}>
        {/* Near Me stays visually present but inert — real proximity is
            deferred to Phase 2 per the roadmap, not something this
            milestone wires up. */}
        <View style={[styles.quickFilterChip, styles.quickFilterInert]}>
          <Text style={text.chip}>Near Me</Text>
        </View>
        <Pressable
          onPress={() => setOpenNow((v) => !v)}
          style={[styles.quickFilterChip, openNow && styles.quickFilterChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: openNow }}
        >
          <Text style={[text.chip, openNow && styles.quickFilterTextActive]}>
            Open Now{openNow ? ' ✓' : ''}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setIsFilterSheetOpen(true)}
          style={[styles.quickFilterChip, activeFilterCount > 0 && styles.quickFilterChipActive]}
          accessibilityRole="button"
        >
          <Text style={[text.chip, activeFilterCount > 0 && styles.quickFilterTextActive]}>
            Filters{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </Text>
        </Pressable>
      </View>

      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeChipScroll}
          contentContainerStyle={styles.activeChipRow}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              style={styles.activeChip}
              onPress={() => setFilters((f) => chip.clear(f))}
              accessibilityLabel={`Remove ${chip.label} filter`}
            >
              <Text style={text.chip}>{chip.label}</Text>
              <Text style={text.chip}> ×</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {isSearchActive && <CategoryStrip active={activeCategory} counts={counts} onSelect={setActiveCategory} />}

      {isSearchActive ? (
        results.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={text.body}>No matches for "{query}".</Text>
            <Text style={[text.bodyMuted, styles.noResultsHint]}>Check spelling or try a broader term.</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={resultKey}
            renderItem={renderResult}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
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

      <FilterSheet
        visible={isFilterSheetOpen}
        initialFilters={filters}
        options={filterOptions}
        restaurants={restaurants}
        favoritedIds={favoritedIds}
        openNow={openNow}
        hoursData={hoursData}
        onApply={setFilters}
        onClose={() => setIsFilterSheetOpen(false)}
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
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.cream,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontFamily: text.body.fontFamily,
    fontSize: 15,
    color: COLORS.ink,
  },
  clearButton: {
    paddingHorizontal: SPACING.xs,
  },
  quickFilterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  quickFilterChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  quickFilterInert: {
    opacity: 0.5,
  },
  quickFilterChipActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  quickFilterTextActive: {
    color: COLORS.goldLight,
  },
  // A horizontal ScrollView with only contentContainerStyle set (no
  // bounded `style`) can stretch to fill remaining vertical space in a
  // flex-column parent instead of sizing to its one-line content —
  // confirmed on-device (a single chip rendered ~230pt tall instead of
  // ~36pt). Same root cause, different shape, as FilterSheet's footer
  // bug. maxHeight on the ScrollView itself (not just its content) is
  // what actually bounds it.
  activeChipScroll: {
    maxHeight: 44,
  },
  activeChipRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  content: {
    padding: SPACING.lg,
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
    padding: SPACING.xl,
    alignItems: 'center',
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
