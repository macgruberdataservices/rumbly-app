import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
import { useWalkingDistances } from '../hooks/useWalkingDistances';
import { LoadingScreen } from '../components/LoadingScreen';
import { RestaurantCard } from '../components/RestaurantCard';
import { ItemResultRow } from '../components/search/ItemResultRow';
import { GroupedItemResultRow } from '../components/search/GroupedItemResultRow';
import { closeOpenSwipeable } from '../components/swipeableCoordinator';
import { RelatedResultRow } from '../components/search/RelatedResultRow';
import { FilterPanel, PANEL_COLLAPSED_HEIGHT } from '../components/search/FilterPanel';
import { groupResultsByLocation, type ResultRow } from '../search/resultGrouping';
import {
  applyFilters,
  collectFilterOptions,
  countActiveFilters,
  emptyFilters,
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
import {
  applyQuickLocationFilters,
  collectQuickLocationDetailGroups,
  type QuickLocationKey,
} from '../search/quickLocations';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;
const INITIAL_RESULT_LIMIT = 50;

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

function LocationContextHeader({ parkLabel, areaLabel }: { parkLabel: string; areaLabel: string | null }) {
  return (
    <View style={styles.locationHeader}>
      <View style={styles.locationHeaderBar}>
        <Text style={styles.locationHeaderText} numberOfLines={1}>
          {parkLabel.toUpperCase()}{areaLabel ? ` · ${areaLabel.toUpperCase()}` : ''}
        </Text>
      </View>
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
  const [quickLocations, setQuickLocations] = useState<Set<QuickLocationKey>>(
    () => new Set(initialState.quickLocations)
  );
  const [quickLocationDetails, setQuickLocationDetails] = useState<Set<string>>(
    () => new Set(initialState.quickLocationDetails)
  );
  const [showAllResults, setShowAllResults] = useState(initialState.showAllResults);
  const [filterPanelState, setFilterPanelState] = useState<FilterPanelState>(initialState.filterPanelState);
  const [activeFilterGroup, setActiveFilterGroup] = useState<FilterGroupKey>(initialState.activeFilterGroup);
  const [browseContext, setBrowseContext] = useState<FindBrowseContext | null>(initialState.browseContext);
  const [focusedResultKey, setFocusedResultKey] = useState<string | null>(initialState.focusedResultKey);
  const [searchInputFocused, setSearchInputFocused] = useState(initialState.searchInputFocused);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [stickyLocationVisible, setStickyLocationVisible] = useState(initialState.resultListOffset > 44);
  const [activeLocation, setActiveLocation] = useState<{ parkLabel: string; areaLabel: string | null } | null>(null);
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
  const searchInputRef = useRef<TextInput>(null);
  const focusedResultNodeRef = useRef<View | null>(null);
  const resultListOffsetRef = useRef(initialState.resultListOffset);
  const focusedResultKeyRef = useRef(initialState.focusedResultKey);
  const shouldRestoreFocusRef = useRef(initialState.focusedResultKey !== null);
  const pendingAccessibilityFocusRef = useRef(false);
  const isSearchActiveRef = useRef(initialState.query.trim().length >= 2);
  const latestRestoreStateRef = useRef<FindRestoreState>(initialState);
  const recentReveal = useRef(
    new Animated.Value(initialState.searchInputFocused && initialState.query.trim().length === 0 ? 1 : 0)
  ).current;
  const introReveal = useRef(
    new Animated.Value(initialState.searchInputFocused || initialState.query.trim().length > 0 ? 0 : 1)
  ).current;

  const locationDetailGroups = useMemo(
    () => collectQuickLocationDetailGroups(restaurants, quickLocations),
    [quickLocations, restaurants]
  );
  const filteredRestaurants = useMemo(
    () => applyFilters(
      applyQuickLocationFilters(restaurants, quickLocations, quickLocationDetails),
      filters,
      lovedIds,
      false,
      null
    ),
    [restaurants, filters, lovedIds, quickLocationDetails, quickLocations]
  );
  const filterOptions = useMemo(() => collectFilterOptions(restaurants), [restaurants]);
  const activeFilterCount = countActiveFilters(filters) + quickLocations.size + quickLocationDetails.size;

  const {
    query,
    setQuery,
    results,
    isSearchActive,
    isSearching,
    activeRelated,
    toggleRelated,
    activeCategory,
    clear,
  } = useSearch(
    filteredRestaurants,
    {
      query: initialState.query,
      activeRelated: initialState.activeRelated,
      activeCategory: initialState.activeCategory,
    },
    lastSyncedAt
  );

  isSearchActiveRef.current = isSearchActive;

  // Avoids flashing "No matches" during the debounce/index-load window --
  // only commit to that message once the search has settled empty for a
  // beat, so a quick real result isn't preceded by a misleading blip.
  const [noResultsVisible, setNoResultsVisible] = useState(false);
  useEffect(() => {
    if (isSearchActive && !isSearching && results.length === 0) {
      const timer = setTimeout(() => setNoResultsVisible(true), 400);
      return () => clearTimeout(timer);
    }
    setNoResultsVisible(false);
  }, [isSearchActive, isSearching, results.length]);

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
      quickLocations: [...quickLocations],
      quickLocationDetails: [...quickLocationDetails],
      showAllResults,
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
      quickLocationDetails,
      quickLocations,
      searchInputFocused,
      showAllResults,
    ]
  );

  const persistRestoreState = useCallback(
    (overrides?: Partial<FindRestoreState>) => {
      navigation.setParams({ state: buildRestoreState(overrides) });
    },
    [buildRestoreState, navigation]
  );

  useEffect(() => {
    latestRestoreStateRef.current = buildRestoreState();
  }, [buildRestoreState]);

  useFocusEffect(
    useCallback(
      () => () => {
        navigation.setParams({ state: latestRestoreStateRef.current });
      },
      [navigation]
    )
  );

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
  const visibleResults = useMemo(
    () => showAllResults ? results : results.slice(0, INITIAL_RESULT_LIMIT),
    [results, showAllResults]
  );
  // Milestone: walking-distance proximity (mapping side-quest). Only
  // fetches for restaurants currently on screen, and only once Near Me is
  // active -- results without a routed entry fall back to straight-line
  // inside groupResultsByLocation/distanceToRestaurant, per the mapping
  // Product Rule (Docs/MAPPING_DATA_NOTES.md).
  const visibleRestaurantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of visibleResults) {
      if (r.kind === 'restaurant' || r.kind === 'item') ids.add(r.restaurant.restaurant_id);
    }
    return Array.from(ids);
  }, [visibleResults]);
  const walkingDistances = useWalkingDistances(nearMeOrigin, visibleRestaurantIds);
  const rows = useMemo(
    () => groupResultsByLocation(visibleResults, nearMeOrigin, walkingDistances),
    [nearMeOrigin, visibleResults, walkingDistances]
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const firstLocation = rows.find((row) => row.type === 'location-header');
    if (firstLocation?.type === 'location-header') {
      setActiveLocation({ parkLabel: firstLocation.parkLabel, areaLabel: firstLocation.areaLabel });
    } else {
      setActiveLocation(null);
    }
  }, [rows]);
  const hasMoreResults = !showAllResults && results.length > INITIAL_RESULT_LIMIT;
  const showRecentSearches =
    searchInputFocused &&
    query.trim().length === 0 &&
    activeCategory === 'all' &&
    activeRelated === null &&
    recentSearches.length > 0;

  useEffect(() => {
    Animated.timing(recentReveal, {
      toValue: showRecentSearches ? 1 : 0,
      duration: showRecentSearches ? 200 : 120,
      useNativeDriver: false,
    }).start();
  }, [recentReveal, showRecentSearches]);

  // The recent-searches panel lives inside the browse-mode ScrollView
  // below, which unmounts the instant isSearchActive flips true (e.g.
  // tapping a recent search sets a real query in the same render that
  // computes showRecentSearches=false) -- the closing animation above
  // starts, but the view it's animating is already gone, so recentReveal
  // can get stranded mid-value with nothing left to finish the tween.
  // Later, clearing back to an empty query remounts that ScrollView from
  // scratch, and the Animated.View picks up whatever value recentReveal
  // was left at -- visibly "open" (partway through its opacity/height
  // range) despite pointerEvents already correctly reporting closed
  // (found 2026-07-23: looked exactly like that -- visible but
  // unresponsive until refocusing the search field). Snapping it
  // synchronously to 0 the moment search goes active sidesteps the race
  // entirely: there's no visual cost since the consuming view is being
  // torn out of the tree in this same instant anyway.
  useEffect(() => {
    if (isSearchActive) {
      recentReveal.setValue(0);
    }
  }, [isSearchActive, recentReveal]);

  useEffect(() => {
    Animated.timing(introReveal, {
      toValue: searchInputFocused || query.trim().length > 0 ? 0 : 1,
      duration: searchInputFocused || query.trim().length > 0 ? 140 : 190,
      useNativeDriver: false,
    }).start();
  }, [introReveal, query, searchInputFocused]);

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
      setShowAllResults(false);
      if (nextQuery.trim().length > 0) {
        setBrowseContext(null);
        setFilterPanelState((state) => state === 'expanded' ? state : 'peek');
      } else {
        setFilterPanelState('hidden');
      }
      setQuery(nextQuery);
    },
    [clearFocusedResult, resetListPosition, setQuery]
  );

  const handleClearSearch = useCallback(() => {
    // Keyboard.dismiss() only hides the keyboard UI -- it doesn't blur the
    // TextInput itself, so the native input can still be considered
    // focused underneath. Without an explicit .blur() here, that stale
    // native focus could silently re-fire onFocus later (e.g. after
    // switching to Explore and back), re-showing recent searches with an
    // empty query even though setSearchInputFocused(false) already ran
    // once (found 2026-07-23).
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    setSearchInputFocused(false);
    resetListPosition();
    clearFocusedResult();
    setShowAllResults(false);
    setFilterPanelState('hidden');
    clear();
  }, [clear, clearFocusedResult, resetListPosition]);

  const handleFiltersChange = useCallback(
    (nextFilters: SearchFilters) => {
      resetListPosition();
      clearFocusedResult();
      setShowAllResults(false);
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
      setShowAllResults(false);
      setBrowseContext(null);
      setFilterPanelState('peek');
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

  const handleQuickLocationToggle = useCallback(
    (location: QuickLocationKey) => {
      resetListPosition();
      clearFocusedResult();
      setShowAllResults(false);
      setQuickLocationDetails((details) =>
        new Set([...details].filter((detail) => !detail.startsWith(`${location}:`)))
      );
      setQuickLocations((current) => {
        const next = new Set(current);
        if (next.has(location)) next.delete(location);
        else next.add(location);
        return next;
      });
    },
    [clearFocusedResult, resetListPosition]
  );

  const handleQuickLocationDetailToggle = useCallback(
    (detail: string) => {
      resetListPosition();
      clearFocusedResult();
      setShowAllResults(false);
      setQuickLocationDetails((current) => {
        const next = new Set(current);
        if (next.has(detail)) next.delete(detail);
        else next.add(detail);
        return next;
      });
    },
    [clearFocusedResult, resetListPosition]
  );

  const handleClearLocationDetails = useCallback(() => {
    resetListPosition();
    clearFocusedResult();
    setShowAllResults(false);
    setQuickLocationDetails(new Set());
  }, [clearFocusedResult, resetListPosition]);

  const handleClearAllFilters = useCallback(() => {
    resetListPosition();
    clearFocusedResult();
    setShowAllResults(false);
    setFilters(emptyFilters());
    setQuickLocations(new Set());
    setQuickLocationDetails(new Set());
  }, [clearFocusedResult, resetListPosition]);

  // Full reset to the pristine home state -- search, filters, and
  // browse, not just one of them -- triggered by RootNavigator's Find
  // tab listener sending a fresh resetToken param when the Find tab is
  // pressed while already active (owner request, 2026-07-23).
  const resetToHomeState = useCallback(() => {
    handleClearSearch();
    handleClearAllFilters();
    setBrowseContext(null);
  }, [handleClearAllFilters, handleClearSearch]);

  useEffect(() => {
    if (route.params?.resetToken !== undefined) {
      resetToHomeState();
    }
    // Only ever react to resetToken actually changing -- resetToHomeState
    // itself is excluded on purpose (it's recreated most renders via its
    // own dependencies, and re-running the reset on those changes rather
    // than on a fresh token would fight the very state it just set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.resetToken]);

  const handleFilterPress = useCallback(() => {
    setFilterPanelState((state) => {
      if (state !== 'expanded') return 'expanded';
      return query.trim().length > 0 ? 'peek' : 'hidden';
    });
  }, [query]);

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
      searchInputRef.current?.blur();
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

  const handleResultScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    handleScroll(event);
    setStickyLocationVisible(event.nativeEvent.contentOffset.y > 44);
  }, [handleScroll]);

  const onSearchViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null; isViewable: boolean }> }) => {
      const firstIndex = viewableItems
        .filter((item) => item.isViewable && item.index !== null)
        .reduce((lowest, item) => Math.min(lowest, item.index as number), Number.POSITIVE_INFINITY);
      if (!Number.isFinite(firstIndex)) return;
      for (let index = firstIndex; index >= 0; index -= 1) {
        const row = rowsRef.current[index];
        if (row?.type === 'location-header') {
          setActiveLocation({ parkLabel: row.parkLabel, areaLabel: row.areaLabel });
          return;
        }
      }
    }
  ).current;
  const searchViewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 }).current;

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

  const renderRow = ({ item: row }: { item: ResultRow }) => {
    if (row.type === 'location-header') {
      return (
        <LocationContextHeader parkLabel={row.parkLabel} areaLabel={row.areaLabel} />
      );
    }

    const r = row.result;
    if (r.kind === 'restaurant') {
      return (
        <RestaurantCard
          ref={(node) => attachFocusedResultRef(row.key, node)}
          restaurant={r.restaurant}
          highlightQuery={query}
          distanceMiles={walkingDistances.get(r.restaurant.restaurant_id) ?? distanceToRestaurant(nearMeOrigin, r.restaurant)}
          onPress={() => {
            prepareResultNavigation(row.key);
            navigation.navigate('RestaurantDetail', { restaurantId: r.restaurant.restaurant_id });
          }}
        />
      );
    }
    if (r.kind === 'item') {
      const distanceMiles = walkingDistances.get(r.restaurant.restaurant_id) ?? distanceToRestaurant(nearMeOrigin, r.restaurant);

      if (row.type === 'item-group') {
        return (
          <GroupedItemResultRow
            ref={(node) => attachFocusedResultRef(row.key, node)}
            item={r.item}
            restaurant={r.restaurant}
            extras={row.extras}
            highlightQuery={query}
            distanceMiles={distanceMiles}
            getDistanceMiles={(restaurant) =>
              walkingDistances.get(restaurant.restaurant_id) ?? distanceToRestaurant(nearMeOrigin, restaurant)
            }
            onPressPrimary={() => {
              prepareResultNavigation(row.key);
              navigation.navigate('RestaurantDetail', {
                restaurantId: r.item.restaurant_id,
                itemId: r.item.item_id,
                period: r.item.dining_period,
                category: r.item.category,
              });
            }}
            onPressExtra={(extra) => {
              prepareResultNavigation(row.key);
              navigation.navigate('RestaurantDetail', {
                restaurantId: extra.item.restaurant_id,
                itemId: extra.item.item_id,
                period: extra.item.dining_period,
                category: extra.item.category,
              });
            }}
          />
        );
      }

      return (
        <ItemResultRow
          ref={(node) => attachFocusedResultRef(row.key, node)}
          item={r.item}
          restaurant={r.restaurant}
          highlightQuery={query}
          distanceMiles={distanceMiles}
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
          setShowAllResults(false);
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
      <Animated.View
        style={[
          styles.headerClip,
          {
            height: introReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 92] }),
            opacity: introReveal,
            transform: [{ translateY: introReveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.header}>
          <Image
            source={require('../../assets/parkbites-wordmark.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="Park Bites"
          />
          <View style={styles.introCopy}>
            <Text style={styles.introText}>
              Search for restaurants and menu items, filter and sort by proximity, or just explore!
            </Text>
          </View>
        </View>
      </Animated.View>

      <View style={styles.searchRow}>
        <Pressable
          onPress={handleFilterPress}
          accessibilityLabel={filterPanelState === 'expanded' ? 'Close detailed filters' : 'Show detailed filters'}
          accessibilityRole="button"
          accessibilityState={{ expanded: filterPanelState === 'expanded' }}
          style={[styles.iconButton, filterPanelState === 'expanded' && styles.iconButtonActive]}
        >
          <FilterIcon active={filterPanelState === 'expanded'} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.searchInputShell}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="find your next bite"
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
          {(searchInputFocused || query.trim().length > 0) && (
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

      {isSearchActive ? (
        results.length === 0 ? (
          <View style={styles.noResults}>
            {noResultsVisible ? (
              <>
                <Text style={text.body}>No matches for "{query}".</Text>
                <Text style={[text.bodyMuted, styles.noResultsHint]}>Check spelling or try a broader term.</Text>
              </>
            ) : (
              <Text style={text.body}>Gathering results…</Text>
            )}
          </View>
        ) : (
          <View style={styles.searchResults}>
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
              onScroll={handleResultScroll}
              onScrollBeginDrag={closeOpenSwipeable}
              onViewableItemsChanged={onSearchViewableItemsChanged}
              viewabilityConfig={searchViewabilityConfig}
              onScrollEndDrag={() => persistRestoreState()}
              onMomentumScrollEnd={() => persistRestoreState()}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={hasMoreResults ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`See all ${results.length} results`}
                  style={({ pressed }) => [styles.seeAllButton, pressed && styles.pillPressed]}
                  onPress={() => setShowAllResults(true)}
                >
                  <Text style={styles.seeAllLabel}>See all {results.length} results</Text>
                </Pressable>
              ) : null}
            />
            {stickyLocationVisible && activeLocation && (
              <View style={styles.stickyLocationOverlay} pointerEvents="none">
                <LocationContextHeader
                  parkLabel={activeLocation.parkLabel}
                  areaLabel={activeLocation.areaLabel}
                />
              </View>
            )}
          </View>
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
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            pointerEvents={showRecentSearches ? 'auto' : 'none'}
            style={[
              styles.recentReveal,
              {
                opacity: recentReveal,
                maxHeight: recentReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 286] }),
              },
            ]}
          >
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
              <View style={styles.recentList}>
                {recentSearches.map((recent) => (
                  <Pressable
                    key={`${recent.query}:${recent.usedAt}`}
                    onPress={() => handleRecentSearchPress(recent)}
                    accessibilityRole="button"
                    accessibilityLabel={`Search for ${recent.query}`}
                    style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
                  >
                    <View style={styles.recentClock} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <View style={styles.recentClockHandVertical} />
                      <View style={styles.recentClockHandHorizontal} />
                    </View>
                    <Text style={styles.recentQuery} numberOfLines={1}>{recent.query}</Text>
                    <Text style={styles.recentChevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      )}

      <FilterPanel
        filters={filters}
        options={filterOptions}
        resultCount={filteredRestaurants.length}
        visible={filterPanelState !== 'hidden'}
        expanded={filterPanelState === 'expanded'}
        activeGroup={activeFilterGroup}
        quickLocations={quickLocations}
        quickLocationDetails={quickLocationDetails}
        locationDetailGroups={locationDetailGroups}
        onActiveGroupChange={setActiveFilterGroup}
        onQuickLocationToggle={handleQuickLocationToggle}
        onQuickLocationDetailToggle={handleQuickLocationDetailToggle}
        onClearLocationDetails={handleClearLocationDetails}
        onClearAll={handleClearAllFilters}
        onCollapseToPeek={() => setFilterPanelState('peek')}
        onExpand={() => setFilterPanelState('expanded')}
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
    paddingBottom: SPACING.sm,
  },
  headerClip: { overflow: 'hidden' },
  // Source asset is 233x151 (~1.54:1). Keep that ratio so the stacked
  // wordmark does not compress to the previous logo's wider proportions.
  wordmark: {
    width: 104,
    height: 67,
  },
  introCopy: {
    flex: 1,
    marginLeft: SPACING.lg,
  },
  introText: {
    fontFamily: text.bodyMuted.fontFamily,
    fontSize: 12.5,
    lineHeight: 16,
    color: COLORS.muted,
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
  searchResults: { flex: 1 },
  stickyLocationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    padding: SPACING.lg,
    // Clears the floating filter dock's collapsed pillBar (see
    // FilterPanel's dock comment) so the last row can scroll into reach
    // instead of sitting permanently under it.
    paddingBottom: SPACING.lg + PANEL_COLLAPSED_HEIGHT,
  },
  searchContent: {
    paddingHorizontal: 0,
    paddingBottom: SPACING.lg + PANEL_COLLAPSED_HEIGHT,
  },
  seeAllButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  seeAllLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 13,
    color: COLORS.forest,
  },
  locationHeader: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  locationHeaderBar: {
    width: '100%',
    justifyContent: 'center',
    borderRadius: RADII.xl,
    backgroundColor: COLORS.gold,
    paddingHorizontal: 13,
    paddingVertical: 6.5,
  },
  locationHeaderText: {
    fontFamily: text.sectionToggle.fontFamily,
    fontSize: 12,
    color: '#FFFFFF',
  },
  recentReveal: {
    overflow: 'hidden',
  },
  recentSection: {
    marginBottom: SPACING.md,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  recentList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  recentRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.xs,
  },
  recentRowPressed: {
    backgroundColor: COLORS.goldLight,
  },
  recentClock: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.muted,
    marginRight: SPACING.md,
  },
  recentClockHandVertical: {
    position: 'absolute',
    width: 1.5,
    height: 6,
    left: 8,
    top: 3,
    backgroundColor: COLORS.muted,
  },
  recentClockHandHorizontal: {
    position: 'absolute',
    width: 5,
    height: 1.5,
    left: 8,
    top: 8,
    backgroundColor: COLORS.muted,
    transform: [{ rotate: '25deg' }],
  },
  recentQuery: {
    flex: 1,
    fontFamily: text.body.fontFamily,
    fontSize: 14,
    color: COLORS.ink,
  },
  recentChevron: {
    fontFamily: text.body.fontFamily,
    fontSize: 22,
    color: COLORS.dim,
    marginLeft: SPACING.sm,
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
