import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { useActivity } from '../hooks/useActivity';
import { useSearch } from '../hooks/useSearch';
import { useNearMe } from '../hooks/useNearMe';
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
  type SearchFilters,
} from '../search/filters';
import {
  defaultFindRestoreState,
  deserializeFilters,
  resolveFindRestoreState,
  serializeFilters,
  type FilterGroupKey,
  type FilterPanelState,
  type FindBrowseContext,
  type FindRestoreState,
  type SearchCategory,
} from '../search/findState';
import {
  clearRecentSearches,
  loadRecentSearches,
  recordRecentSearch,
  type RecentSearch,
} from '../search/recentSearches';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';
import { distanceToRestaurant } from '../location/proximity';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;

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

function NearMeIcon({ active }: { active: boolean }) {
  return (
    <View style={[styles.nearIconOuter, active && styles.nearIconOuterActive]}>
      <View style={[styles.nearIconInner, active && styles.nearIconInnerActive]} />
    </View>
  );
}

export function FindHomeScreen({ navigation, route }: Props) {
  const { restaurants, isLoading, error, lastSyncedAt, forceRefresh } = useDataProvider();
  const { lovedIds } = useActivity();
  const initialStateRef = useRef(resolveFindRestoreState(route.params?.state));
  const initialState = initialStateRef.current;
  const initialContentOffsetRef = useRef({ x: 0, y: initialState.resultListOffset });
  const [filters, setFilters] = useState<SearchFilters>(() => deserializeFilters(initialState.filters));
  const [filterPanelState, setFilterPanelState] = useState<FilterPanelState>(initialState.filterPanelState);
  const [activeFilterGroup, setActiveFilterGroup] = useState<FilterGroupKey>(initialState.activeFilterGroup);
  const [browseContext, setBrowseContext] = useState<FindBrowseContext | null>(initialState.browseContext);
  const [focusedResultKey, setFocusedResultKey] = useState<string | null>(initialState.focusedResultKey);
  const [searchInputFocused, setSearchInputFocused] = useState(initialState.searchInputFocused);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const {
    origin: nearMeOrigin,
    status: nearMeStatus,
    isActive: nearMeActive,
    getPermissionStatus: getNearMePermissionStatus,
    enable: enableNearMe,
    disable: disableNearMe,
  } = useNearMe(initialState.nearMeOrigin);
  const resultListRef = useRef<FlatList<ResultRow>>(null);
  const browseScrollRef = useRef<ScrollView>(null);
  const focusedResultNodeRef = useRef<View | null>(null);
  const resultListOffsetRef = useRef(initialState.resultListOffset);
  const focusedResultKeyRef = useRef(initialState.focusedResultKey);
  const shouldRestoreFocusRef = useRef(initialState.focusedResultKey !== null);
  const pendingAccessibilityFocusRef = useRef(false);
  const isSearchActiveRef = useRef(initialState.query.trim().length >= 2);

  const filteredRestaurants = useMemo(
    () => applyFilters(restaurants, filters, lovedIds, false, null),
    [restaurants, filters, lovedIds]
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
  } = useSearch(filteredRestaurants, {
    query: initialState.query,
    activeRelated: initialState.activeRelated,
    activeCategory: initialState.activeCategory,
  });

  isSearchActiveRef.current = isSearchActive;

  useEffect(() => {
    let cancelled = false;
    loadRecentSearches()
      .then((searches) => {
        if (!cancelled) setRecentSearches(searches);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const buildRestoreState = useCallback(
    (overrides: Partial<FindRestoreState> = {}): FindRestoreState => ({
      ...defaultFindRestoreState(),
      query,
      filters: serializeFilters(filters),
      activeCategory,
      activeRelated,
      filterPanelState,
      activeFilterGroup,
      browseContext,
      resultListOffset: resultListOffsetRef.current,
      focusedResultKey: focusedResultKeyRef.current,
      searchInputFocused,
      nearMeOrigin,
      ...overrides,
    }),
    [
      activeCategory,
      activeFilterGroup,
      activeRelated,
      browseContext,
      filterPanelState,
      filters,
      nearMeOrigin,
      query,
      searchInputFocused,
    ]
  );

  const persistRestoreState = useCallback(
    (overrides?: Partial<FindRestoreState>) => {
      navigation.setParams({ state: buildRestoreState(overrides) });
    },
    [buildRestoreState, navigation]
  );

  useEffect(() => {
    persistRestoreState();
  }, [persistRestoreState]);

  const focusRestoredResult = useCallback(() => {
    const handle = focusedResultNodeRef.current ? findNodeHandle(focusedResultNodeRef.current) : null;
    if (!handle) return false;
    AccessibilityInfo.setAccessibilityFocus(handle);
    pendingAccessibilityFocusRef.current = false;
    return true;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!shouldRestoreFocusRef.current) return undefined;
      shouldRestoreFocusRef.current = false;
      pendingAccessibilityFocusRef.current = true;
      const offset = resultListOffsetRef.current;
      const task = InteractionManager.runAfterInteractions(() => {
        if (isSearchActiveRef.current) {
          resultListRef.current?.scrollToOffset({ offset, animated: false });
        } else {
          browseScrollRef.current?.scrollTo({ y: offset, animated: false });
        }
      });
      const focusTimer = setTimeout(focusRestoredResult, 200);
      return () => {
        task.cancel();
        clearTimeout(focusTimer);
      };
    }, [focusRestoredResult])
  );

  // Restaurants-first, then items, each grouped by park/resort/Disney
  // Springs/water-park/other then by area — owner direction, 2026-07-20.
  // Related-tag results (no location to group by) pass through ungrouped.
  const rows = useMemo(() => groupResultsByLocation(results, nearMeOrigin), [nearMeOrigin, results]);
  const showRecentSearches = query.trim().length === 0 && activeCategory === 'all' && activeRelated === null;

  const resetListPosition = useCallback(() => {
    resultListOffsetRef.current = 0;
    resultListRef.current?.scrollToOffset({ offset: 0, animated: false });
    browseScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const clearFocusedResult = useCallback(() => {
    focusedResultKeyRef.current = null;
    focusedResultNodeRef.current = null;
    setFocusedResultKey(null);
  }, []);

  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      resetListPosition();
      clearFocusedResult();
      if (nextQuery.trim().length > 0) setBrowseContext(null);
      setQuery(nextQuery);
    },
    [clearFocusedResult, resetListPosition, setQuery]
  );

  const handleClearSearch = useCallback(() => {
    resetListPosition();
    clearFocusedResult();
    clear();
  }, [clear, clearFocusedResult, resetListPosition]);

  const handleCategoryChange = useCallback(
    (category: SearchCategory) => {
      resetListPosition();
      clearFocusedResult();
      setActiveCategory(category);
    },
    [clearFocusedResult, resetListPosition, setActiveCategory]
  );

  const handleFiltersChange = useCallback(
    (nextFilters: SearchFilters) => {
      resetListPosition();
      clearFocusedResult();
      setFilters(nextFilters);
    },
    [clearFocusedResult, resetListPosition]
  );

  const rememberQuery = useCallback(
    (value = query) => {
      if (value.trim().length < 2) return;
      recordRecentSearch(value).then(setRecentSearches).catch(() => {});
    },
    [query]
  );

  const handleRecentSearchPress = useCallback(
    (recent: RecentSearch) => {
      resetListPosition();
      clearFocusedResult();
      setBrowseContext(null);
      setQuery(recent.query);
      recordRecentSearch(recent.query).then(setRecentSearches).catch(() => {});
    },
    [clearFocusedResult, resetListPosition, setQuery]
  );

  const handleClearRecentSearches = useCallback(() => {
    clearRecentSearches()
      .then(() => setRecentSearches([]))
      .catch(() => {});
  }, []);

  const openLocationSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const showLocationFilters = useCallback(() => {
    setActiveFilterGroup('location');
    setFilterPanelState('expanded');
  }, []);

  const runNearMeEnable = useCallback(async () => {
    const outcome = await enableNearMe();
    if (outcome === 'active') {
      resetListPosition();
      clearFocusedResult();
      return;
    }
    if (outcome === 'denied') {
      Alert.alert(
        'Location access is off',
        'Enable foreground location in Settings to use Near Me. Rumbly never requests background location.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Choose Location', onPress: showLocationFilters },
          { text: 'Open Settings', onPress: openLocationSettings },
        ]
      );
      return;
    }
    if (outcome === 'unavailable') {
      Alert.alert(
        'Location services are off',
        'Turn on Location Services, then try Near Me again.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Choose Location', onPress: showLocationFilters },
          { text: 'Open Settings', onPress: openLocationSettings },
        ]
      );
      return;
    }
    Alert.alert('Location unavailable', 'Rumbly could not determine your location. Please try again.');
  }, [clearFocusedResult, enableNearMe, openLocationSettings, resetListPosition, showLocationFilters]);

  const handleNearMePress = useCallback(async () => {
    if (nearMeActive) {
      disableNearMe();
      resetListPosition();
      clearFocusedResult();
      return;
    }

    try {
      const permissionStatus = await getNearMePermissionStatus();
      if (permissionStatus === 'undetermined') {
        Alert.alert(
          'Show nearby dining?',
          'Rumbly uses your location only while the app is open and compares it with Disney guest entrances on your device. No paid routing service receives your location.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Continue', onPress: () => void runNearMeEnable() },
          ]
        );
        return;
      }
      await runNearMeEnable();
    } catch {
      Alert.alert('Location unavailable', 'Rumbly could not check location permission. Please try again.');
    }
  }, [
    clearFocusedResult,
    disableNearMe,
    getNearMePermissionStatus,
    nearMeActive,
    resetListPosition,
    runNearMeEnable,
  ]);

  const prepareResultNavigation = useCallback(
    (resultKey: string) => {
      Keyboard.dismiss();
      resultListOffsetRef.current = Math.max(0, resultListOffsetRef.current);
      focusedResultKeyRef.current = resultKey;
      shouldRestoreFocusRef.current = true;
      setFocusedResultKey(resultKey);
      setSearchInputFocused(false);
      navigation.setParams({
        state: buildRestoreState({ focusedResultKey: resultKey, searchInputFocused: false }),
      });
      rememberQuery();
    },
    [buildRestoreState, navigation, rememberQuery]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    resultListOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const attachFocusedResultRef = useCallback(
    (resultKey: string, node: View | null) => {
      if (resultKey !== focusedResultKeyRef.current) return;
      focusedResultNodeRef.current = node;
      if (node && pendingAccessibilityFocusRef.current) {
        requestAnimationFrame(() => focusRestoredResult());
      }
    },
    [focusRestoredResult]
  );

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
          ref={(node) => attachFocusedResultRef(row.key, node)}
          restaurant={r.restaurant}
          highlightQuery={query}
          distanceMiles={distanceToRestaurant(nearMeOrigin, r.restaurant)}
          onPress={() => {
            prepareResultNavigation(row.key);
            navigation.navigate('RestaurantDetail', { restaurantId: r.restaurant.restaurant_id });
          }}
        />
      );
    }
    if (r.kind === 'item') {
      return (
        <ItemResultRow
          ref={(node) => attachFocusedResultRef(row.key, node)}
          item={r.item}
          restaurant={r.restaurant}
          highlightQuery={query}
          distanceMiles={distanceToRestaurant(nearMeOrigin, r.restaurant)}
          onPress={() => {
            prepareResultNavigation(row.key);
            navigation.navigate('RestaurantDetail', {
              restaurantId: r.item.restaurant_id,
              itemId: r.item.item_id,
              period: r.item.dining_period,
              category: r.item.category,
            });
          }}
        />
      );
    }
    return (
      <RelatedResultRow
        tag={r.tag}
        active={!!activeRelated && activeRelated.kind === r.tag.kind && activeRelated.value === r.tag.value}
        onPress={() => {
          resetListPosition();
          clearFocusedResult();
          toggleRelated(r.tag);
        }}
      />
    );
  };

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
            onChangeText={handleSearchChange}
            onSubmitEditing={() => rememberQuery()}
            onFocus={() => setSearchInputFocused(true)}
            onBlur={() => setSearchInputFocused(false)}
            autoFocus={initialState.searchInputFocused}
            autoCorrect={false}
            accessibilityLabel="Search food, drinks, or restaurants"
            returnKeyType="search"
          />
          {query.trim().length > 0 && (
            <Pressable onPress={handleClearSearch} accessibilityLabel="Clear search" style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          disabled={nearMeStatus === 'requesting'}
          onPress={() => void handleNearMePress()}
          accessibilityLabel={nearMeActive ? 'Turn off Near Me' : 'Show dining near me'}
          accessibilityHint="Uses foreground location and Disney guest entrance coordinates"
          accessibilityRole="button"
          accessibilityState={{
            selected: nearMeActive,
            busy: nearMeStatus === 'requesting',
            disabled: nearMeStatus === 'requesting',
          }}
          style={[
            styles.iconButton,
            nearMeActive && styles.iconButtonActive,
            nearMeStatus === 'requesting' && styles.iconButtonBusy,
          ]}
        >
          {nearMeStatus === 'requesting' ? (
            <ActivityIndicator color={COLORS.forest} />
          ) : (
            <NearMeIcon active={nearMeActive} />
          )}
        </Pressable>
      </View>

      {isSearchActive && <CategoryStrip active={activeCategory} counts={counts} onSelect={handleCategoryChange} />}

      {isSearchActive ? (
        results.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={text.body}>No matches for "{query}".</Text>
            <Text style={[text.bodyMuted, styles.noResultsHint]}>Check spelling or try a broader term.</Text>
          </View>
        ) : (
          <FlatList
            ref={resultListRef}
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={renderRow}
            style={styles.resultList}
            contentContainerStyle={styles.searchContent}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            contentOffset={initialContentOffsetRef.current}
            onScroll={handleScroll}
            onScrollEndDrag={() => persistRestoreState()}
            onMomentumScrollEnd={() => persistRestoreState()}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
          />
        )
      ) : (
        <ScrollView
          ref={browseScrollRef}
          style={styles.resultList}
          contentContainerStyle={styles.content}
          contentOffset={initialContentOffsetRef.current}
          onScroll={handleScroll}
          onScrollEndDrag={() => persistRestoreState()}
          onMomentumScrollEnd={() => persistRestoreState()}
          scrollEventThrottle={16}
        >
          {showRecentSearches && recentSearches.length > 0 && (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={text.sectionToggle}>RECENT SEARCHES</Text>
                <Pressable
                  onPress={handleClearRecentSearches}
                  accessibilityRole="button"
                  accessibilityLabel="Clear recent searches"
                  hitSlop={8}
                >
                  <Text style={text.buttonLabel}>Clear</Text>
                </Pressable>
              </View>
              <View style={styles.recentWrap}>
                {recentSearches.map((recent) => (
                  <Pressable
                    key={`${recent.query}:${recent.usedAt}`}
                    onPress={() => handleRecentSearchPress(recent)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search for ${recent.query}`}
                    style={({ pressed }) => [styles.recentChip, pressed && styles.pillPressed]}
                  >
                    <Text style={text.chip}>{recent.query}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View style={styles.welcomePanel}>
            <Text style={styles.welcomeTitle}>Find your next bite</Text>
            <Text style={[text.bodyMuted, styles.welcomeText]}>
              Search restaurants, menu items, snacks, cuisines, or prices. Location browsing now lives in Explore.
            </Text>
          </View>
        </ScrollView>
      )}

      <FilterPanel
        filters={filters}
        options={filterOptions}
        resultCount={filteredRestaurants.length}
        visible={filterPanelState !== 'hidden'}
        expanded={filterPanelState === 'expanded'}
        activeGroup={activeFilterGroup}
        onExpandedChange={(expanded) => setFilterPanelState(expanded ? 'expanded' : 'peek')}
        onActiveGroupChange={setActiveFilterGroup}
        onChange={handleFiltersChange}
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
  iconButtonBusy: {
    opacity: 0.7,
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
  nearIconOuterActive: {
    borderColor: COLORS.goldLight,
  },
  nearIconInnerActive: {
    backgroundColor: COLORS.goldLight,
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
  recentSection: {
    marginBottom: SPACING.lg,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  recentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  recentChip: {
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.cream,
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
  pillPressed: {
    opacity: 0.6,
  },
  welcomePanel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: COLORS.cream,
    padding: SPACING.lg,
  },
  welcomeTitle: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 20,
    color: COLORS.ink,
    marginBottom: SPACING.xs,
  },
  welcomeText: {
    lineHeight: 19,
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
