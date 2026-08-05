import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
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
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import type { RootTabParamList } from '../navigation/RootNavigator';
import { SettingsButton } from '../components/settings/SettingsButton';
import { useDataProvider } from '../hooks/useDataProvider';
import { useAppSettings } from '../hooks/useAppSettings';
import { useIsDevOwner } from '../hooks/useIsDevOwner';
import { useOpenAccountSettings } from '../hooks/useOpenAccountSettings';
import { useActivity } from '../hooks/useActivity';
import { useSearch } from '../hooks/useSearch';
import { useNearMe } from '../hooks/useNearMe';
import { useWalkingDistances } from '../hooks/useWalkingDistances';
import { LoadingScreen } from '../components/LoadingScreen';
import { AllergyAcknowledgementSheet } from '../components/AllergyAcknowledgementSheet';
import { FindFeed } from '../components/find/FindFeed';
import { RestaurantCard } from '../components/RestaurantCard';
import { ItemResultRow } from '../components/search/ItemResultRow';
import { GroupedItemResultRow } from '../components/search/GroupedItemResultRow';
import { closeOpenSwipeable } from '../components/swipeableCoordinator';
import { RelatedResultRow } from '../components/search/RelatedResultRow';
import { FilterPanel, PANEL_COLLAPSED_HEIGHT } from '../components/search/FilterPanel';
import { groupResultsByLocation, type ResultRow } from '../search/resultGrouping';
import {
  applyFilters,
  ALLERGEN_FILTER_KEYS,
  ALLERGEN_LABELS,
  collectFilterOptions,
  countActiveFilters,
  emptyFilters,
  hasAllergyDietarySelection,
  withoutAllergyDietarySelections,
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
import { recordRecommendationEvent } from '../recommendations/remote';
import { useAuth } from '../hooks/useAuth';
import {
  applyQuickLocationFilters,
  collectQuickLocationDetailGroups,
  QUICK_LOCATIONS,
  type QuickLocationKey,
} from '../search/quickLocations';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;
const INITIAL_RESULT_LIMIT = 50;

function FilterIcon({ active }: { active: boolean }) {
  return (
    <Image
      source={require('../../assets/filter-icon.png')}
      style={styles.filterIcon}
      resizeMode="contain"
      tintColor={active ? COLORS.surface : COLORS.forest}
    />
  );
}

function NearMeIcon({ active }: { active: boolean }) {
  return (
    <Image
      source={require('../../assets/nearby-icon.png')}
      style={styles.nearIcon}
      resizeMode="contain"
      tintColor={active ? COLORS.surface : COLORS.forest}
    />
  );
}

// Two rings pulsing outward on a stagger (each loop resets to scale 1 /
// opacity 0.45 automatically -- Animated.loop's default
// resetBeforeIteration) so a beat starts roughly every 800ms instead of
// every 1600ms. Lives in its own wrapping View, rendered as a sibling
// *before* the Near Me button rather than inside it, so the button's own
// opaque fill paints over the rings within its bounds -- only the glow
// that escapes past the button's circle is visible.
function NearMePulse({ active }: { active: boolean }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    // .stop() below freezes each value wherever the animation happened to
    // be, it doesn't rewind it -- so without this reset, reactivating
    // replays from that stale leftover value (often already at 1, i.e.
    // no visible motion at all) instead of a fresh 0 -> 1 sweep.
    ring1.setValue(0);
    ring2.setValue(0);
    const pulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    const loop1 = pulse(ring1, 0);
    const loop2 = pulse(ring2, 800);
    loop1.start();
    loop2.start();
    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, [active, ring1, ring2]);

  if (!active) return null;

  const ringStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
  });

  return (
    <View style={styles.nearPulseWrap} pointerEvents="none">
      <Animated.View style={[styles.nearPulseRing, ringStyle(ring1)]} />
      <Animated.View style={[styles.nearPulseRing, ringStyle(ring2)]} />
    </View>
  );
}

function LocationContextHeader({ parkLabel, areaLabel }: { parkLabel: string; areaLabel: string | null }) {
  return (
    <View style={styles.locationHeader}>
      <View style={styles.locationHeaderBar}>
        <View style={styles.locationHeaderDot} />
        <Text style={styles.locationHeaderText} numberOfLines={1}>
          {parkLabel.toUpperCase()}{areaLabel ? ` · ${areaLabel.toUpperCase()}` : ''}
        </Text>
      </View>
    </View>
  );
}

function InlineQuickLocationRail({
  selected,
  onToggle,
}: {
  selected: Set<QuickLocationKey>;
  onToggle: (location: QuickLocationKey) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.inlineQuickLocationContent}
    >
      {QUICK_LOCATIONS.map((location) => {
        const active = selected.has(location.key);
        return (
          <Pressable
            key={location.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(location.key)}
            style={({ pressed }) => [
              styles.inlineQuickLocationChip,
              active && styles.inlineQuickLocationChipActive,
              pressed && styles.inlineQuickLocationChipPressed,
            ]}
          >
            <Text style={[text.chip, active && styles.inlineQuickLocationLabelActive]}>
              {location.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function FindHomeScreen({ navigation, route }: Props) {
  const { restaurants, isLoading, error, lastSyncedAt, forceRefresh } = useDataProvider();
  const {
    allAllergyInSearch,
    allergyAcknowledgedThisSession,
    acknowledgeAllergyDisclaimer,
    findFeedEnabled,
    isSettingsReady,
    nativeInteractionsEnabled,
    mockLocation,
  } = useAppSettings();
  const { user } = useAuth();
  const isDevOwner = useIsDevOwner();
  const { lovedIds } = useActivity();
  const openAccountSettings = useOpenAccountSettings();
  const initialStateRef = useRef(resolveFindRestoreState(route.params?.state));
  const initialState = initialStateRef.current;
  const restoredFiltersRef = useRef(deserializeFilters(initialState.filters));
  const restoredFilters = restoredFiltersRef.current;
  const restoredAllergyFiltersNeedAcknowledgement =
    !allergyAcknowledgedThisSession && hasAllergyDietarySelection(restoredFilters.dietary);
  const initialContentOffsetRef = useRef({ x: 0, y: initialState.resultListOffset });
  const [filters, setFilters] = useState<SearchFilters>(() =>
    restoredAllergyFiltersNeedAcknowledgement
      ? { ...restoredFilters, dietary: withoutAllergyDietarySelections(restoredFilters.dietary) }
      : restoredFilters
  );
  const [pendingAllergyFilters, setPendingAllergyFilters] = useState<SearchFilters | null>(
    restoredAllergyFiltersNeedAcknowledgement ? restoredFilters : null
  );
  const [allergyAcknowledgementVisible, setAllergyAcknowledgementVisible] = useState(
    restoredAllergyFiltersNeedAcknowledgement
  );
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
  } = useNearMe(initialState.nearMeOrigin, isDevOwner ? mockLocation : null);
  const resultListRef = useRef<FlatList<ResultRow>>(null);
  const browseScrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const focusedResultNodeRef = useRef<View | null>(null);
  const resultListOffsetRef = useRef(initialState.resultListOffset);
  const focusedResultKeyRef = useRef(initialState.focusedResultKey);
  const shouldRestoreFocusRef = useRef(initialState.focusedResultKey !== null);
  const pendingAccessibilityFocusRef = useRef(false);
  const allergyPromptedForCurrentSearchRef = useRef(false);
  const isSearchActiveRef = useRef(initialState.query.trim().length >= 2);
  const latestRestoreStateRef = useRef<FindRestoreState>(initialState);
  // Keep the blur cleanup stable even if React Navigation replaces the
  // navigation object while processing a nested-stack transition.
  const navigationRef = useRef(navigation);
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);
  const recentReveal = useRef(
    new Animated.Value(initialState.searchInputFocused && initialState.query.trim().length === 0 ? 1 : 0)
  ).current;
  const introReveal = useRef(
    new Animated.Value(initialState.searchInputFocused || initialState.query.trim().length > 0 ? 0 : 1)
  ).current;
  const feedDimReveal = useRef(
    new Animated.Value(initialState.searchInputFocused ? 1 : 0)
  ).current;
  const quickLocationReveal = useRef(new Animated.Value(0)).current;

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
  const explicitAllergyFilterActive = hasAllergyDietarySelection(filters.dietary);
  const allergyResultContextActive =
    explicitAllergyFilterActive || (allAllergyInSearch && allergyAcknowledgedThisSession);
  const allergyResultTitle = useMemo(() => {
    const labels = ALLERGEN_FILTER_KEYS
      .filter((key) => filters.dietary.has(key))
      .map((key) => ALLERGEN_LABELS[key]);
    if (!explicitAllergyFilterActive) {
      return 'Disney-labeled Allergy-Friendly items are included in these results.';
    }
    return labels.length > 0
      ? `Disney lists these items as ${labels.join(' and ')} Allergy-Friendly.`
      : 'Disney lists these items as Allergy-Friendly.';
  }, [explicitAllergyFilterActive, filters.dietary]);

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
    lastSyncedAt,
    filters.dietary,
    allAllergyInSearch && allergyAcknowledgedThisSession
  );
  isSearchActiveRef.current = isSearchActive;
  const [nativeQuickLocationRailVisible, setNativeQuickLocationRailVisible] = useState(false);

  useEffect(() => {
    if (!isSearchActive) {
      allergyPromptedForCurrentSearchRef.current = false;
      return;
    }
    if (
      allAllergyInSearch &&
      !allergyAcknowledgedThisSession &&
      !allergyPromptedForCurrentSearchRef.current
    ) {
      allergyPromptedForCurrentSearchRef.current = true;
      setAllergyAcknowledgementVisible(true);
    }
  }, [allAllergyInSearch, allergyAcknowledgedThisSession, isSearchActive]);

  // Once live results have appeared, keep the location rail stable for the
  // life of that query. Filters are allowed to reduce the current result set
  // to zero without making the control needed to undo them disappear.
  useEffect(() => {
    if (!nativeInteractionsEnabled || !isSearchActive) {
      setNativeQuickLocationRailVisible(false);
      return;
    }
    if (results.length > 0) {
      setNativeQuickLocationRailVisible(true);
    }
  }, [isSearchActive, nativeInteractionsEnabled, results.length]);

  useEffect(() => {
    Animated.spring(quickLocationReveal, {
      toValue: nativeQuickLocationRailVisible ? 1 : 0,
      useNativeDriver: false,
      speed: 18,
      bounciness: nativeQuickLocationRailVisible ? 5 : 0,
    }).start();
  }, [nativeQuickLocationRailVisible, quickLocationReveal]);

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
    useCallback(() => {
      return () => {
        searchInputRef.current?.blur();
        feedDimReveal.stopAnimation();
        feedDimReveal.setValue(0);
        setSearchInputFocused(false);
        const blurredState = {
          ...latestRestoreStateRef.current,
          searchInputFocused: false,
        };
        latestRestoreStateRef.current = blurredState;
        navigationRef.current.setParams({ state: blurredState });
      };
      // Stable empty deps -- see navigationRef's comment above for why
      // this can no longer depend on `navigation` directly.
    }, [])
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

  const feedDimmed = searchInputFocused && !isSearchActive;

  useEffect(() => {
    Animated.timing(feedDimReveal, {
      toValue: feedDimmed ? 1 : 0,
      duration: feedDimmed ? 150 : 120,
      useNativeDriver: true,
    }).start();
  }, [feedDimReveal, feedDimmed]);

  // Search results replace the browse-mode tree that owns the feed overlay.
  // If that happens while the native-driver fade is still running (notably
  // after choosing a recent search), the detached view can leave this shared
  // Animated.Value between 0 and 1. Clearing the query then remounts a
  // partially blurred feed even though feedDimmed is already false, so no
  // dependency change exists to restart the fade. Snap the dormant overlay
  // fully clear before browse mode can mount it again.
  useEffect(() => {
    if (isSearchActive) {
      feedDimReveal.stopAnimation();
      feedDimReveal.setValue(0);
    }
  }, [feedDimReveal, isSearchActive]);

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
    // A populated FindFeed is expensive to reveal, so acknowledge the
    // press directly in the native field before scheduling React's
    // controlled-state update.
    feedDimReveal.stopAnimation();
    feedDimReveal.setValue(0);
    searchInputRef.current?.clear();
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    // Keyboard.dismiss() only hides the keyboard UI -- it doesn't blur the
    // TextInput itself, so the native input can still be considered
    // focused underneath. Without an explicit .blur() here, that stale
    // native focus could silently re-fire onFocus later (e.g. after
    // switching to Explore and back), re-showing recent searches with an
    // empty query even though setSearchInputFocused(false) already ran
    // once (found 2026-07-23).
    setSearchInputFocused(false);
    clear();
    resetListPosition();
    clearFocusedResult();
    setShowAllResults(false);
    setFilterPanelState('hidden');
  }, [clear, clearFocusedResult, feedDimReveal, resetListPosition]);

  const applyFiltersChange = useCallback(
    (nextFilters: SearchFilters) => {
      resetListPosition();
      clearFocusedResult();
      setShowAllResults(false);
      setFilters(nextFilters);
    },
    [clearFocusedResult, resetListPosition]
  );

  const handleFiltersChange = useCallback(
    (nextFilters: SearchFilters) => {
      if (!allergyAcknowledgedThisSession && hasAllergyDietarySelection(nextFilters.dietary)) {
        setPendingAllergyFilters(nextFilters);
        setAllergyAcknowledgementVisible(true);
        return;
      }
      applyFiltersChange(nextFilters);
    },
    [allergyAcknowledgedThisSession, applyFiltersChange]
  );

  const acceptAllergyAcknowledgement = useCallback(() => {
    acknowledgeAllergyDisclaimer();
    setAllergyAcknowledgementVisible(false);
    if (pendingAllergyFilters) applyFiltersChange(pendingAllergyFilters);
    setPendingAllergyFilters(null);
  }, [acknowledgeAllergyDisclaimer, applyFiltersChange, pendingAllergyFilters]);

  const cancelAllergyAcknowledgement = useCallback(() => {
    setAllergyAcknowledgementVisible(false);
    setPendingAllergyFilters(null);
  }, []);

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
  // browse, not just one of them.
  const resetToHomeState = useCallback(() => {
    handleClearSearch();
    handleClearAllFilters();
    setBrowseContext(null);
  }, [handleClearAllFilters, handleClearSearch]);

  // A focused tab press already pops a nested stack to its first screen.
  // Let React Navigation perform that default when RestaurantDetail is
  // showing. Only reset search state when FindHome itself is focused;
  // doing this locally avoids a competing nested navigate/reset action.
  useEffect(() => {
    const parentNavigation =
      navigation.getParent<BottomTabNavigationProp<RootTabParamList, 'Find'>>();
    if (!parentNavigation) return undefined;
    return parentNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      const homeState = defaultFindRestoreState();
      latestRestoreStateRef.current = homeState;
      navigation.setParams({ state: homeState });
      resetToHomeState();
    });
  }, [navigation, resetToHomeState]);

  const handleFilterPress = useCallback(() => {
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    setSearchInputFocused(false);
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
      feedDimReveal.stopAnimation();
      feedDimReveal.setValue(0);
      resultListOffsetRef.current = Math.max(0, resultListOffsetRef.current);
      focusedResultKeyRef.current = resultKey;
      shouldRestoreFocusRef.current = true;
      setFocusedResultKey(resultKey);
      setSearchInputFocused(false);
      const nextRestoreState = buildRestoreState({
        focusedResultKey: resultKey,
        searchInputFocused: false,
      });
      latestRestoreStateRef.current = nextRestoreState;
      navigation.setParams({ state: nextRestoreState });
      rememberQuery();
    },
    [buildRestoreState, feedDimReveal, navigation, rememberQuery]
  );

  const trackSearchOpen = useCallback(
    (restaurantId: string, itemId: string | null) => {
      if (!findFeedEnabled) return;
      void recordRecommendationEvent(user?.id ?? null, {
        eventType: 'search_open',
        targetType: itemId ? 'item' : 'restaurant',
        restaurantId,
        itemId,
        context: { source: 'find_search' },
      });
    },
    [findFeedEnabled, user?.id]
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
            trackSearchOpen(r.restaurant.restaurant_id, null);
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
              trackSearchOpen(r.item.restaurant_id, r.item.item_id);
              navigation.navigate('RestaurantDetail', {
                restaurantId: r.item.restaurant_id,
                itemId: r.item.item_id,
                period: r.item.dining_period,
                category: r.item.category,
              });
            }}
            onPressExtra={(extra) => {
              prepareResultNavigation(row.key);
              trackSearchOpen(extra.item.restaurant_id, extra.item.item_id);
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
            trackSearchOpen(r.item.restaurant_id, r.item.item_id);
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
      <View style={styles.headerRow}>
        <Animated.View
          style={[
            styles.headerClip,
            {
              height: introReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }),
              opacity: introReveal,
              transform: [{ translateY: introReveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.header}>
            <Image
              source={require('../../assets/rumbly-wordmark.png')}
              style={styles.wordmark}
              resizeMode="contain"
              accessibilityLabel="Rumbly"
            />
          </View>
        </Animated.View>
        <View style={styles.settingsOverlay}>
          <SettingsButton onPress={openAccountSettings} />
        </View>
      </View>

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
            <Pressable
              onPressIn={handleClearSearch}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              hitSlop={8}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.nearButtonShell}>
          <NearMePulse active={nearMeActive && nearMeStatus !== 'requesting'} />
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
      </View>

      <Animated.View
        pointerEvents={nativeQuickLocationRailVisible ? 'auto' : 'none'}
        style={[
          styles.inlineQuickLocationRail,
          {
            height: quickLocationReveal.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 50],
            }),
            opacity: quickLocationReveal,
            transform: [
              {
                translateY: quickLocationReveal.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <InlineQuickLocationRail
          selected={quickLocations}
          onToggle={handleQuickLocationToggle}
        />
      </Animated.View>

      <View style={[styles.searchMode, !isSearchActive && styles.hiddenMode]}>
        {isSearchActive && (
        results.length === 0 ? (
          <View style={styles.noResults}>
            {noResultsVisible ? (
              <>
                <Text style={text.body}>
                  {explicitAllergyFilterActive
                    ? `Disney does not currently list a matching Allergy-Friendly item for "${query}" in Rumbly's menu data.`
                    : `No matches for "${query}".`}
                </Text>
                <Text style={[text.bodyMuted, styles.noResultsHint]}>
                  {explicitAllergyFilterActive
                    ? 'This is not a statement about ingredients or whether the restaurant can accommodate you. Confirm with a Disney Cast Member.'
                    : 'Check spelling or try a broader term.'}
                </Text>
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
              ListHeaderComponent={allergyResultContextActive ? (
                <View style={styles.allergyResultNotice}>
                  <Text style={[text.body, styles.allergyResultTitle]}>{allergyResultTitle}</Text>
                  <Text style={text.bodyMuted}>
                    Rumbly does not evaluate ingredients or determine whether food is safe for you.
                    Menus and preparation can change — confirm with a Disney Cast Member before ordering.
                  </Text>
                </View>
              ) : null}
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
        )}
      </View>

      <ScrollView
        ref={browseScrollRef}
        style={[styles.resultList, isSearchActive && styles.hiddenMode]}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={showRecentSearches ? [0] : undefined}
        contentOffset={initialContentOffsetRef.current}
        onScroll={handleScroll}
        onScrollEndDrag={() => persistRestoreState()}
        onMomentumScrollEnd={() => persistRestoreState()}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        accessibilityElementsHidden={isSearchActive}
        importantForAccessibility={isSearchActive ? 'no-hide-descendants' : 'auto'}
      >
          <View style={styles.recentStickyShell}>
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
          </View>
          {isSettingsReady && findFeedEnabled && (
            <View style={styles.feedDimShell}>
              <FindFeed
                origin={nearMeActive ? nearMeOrigin : null}
                onOpenItem={(item) => {
                  const key = `feed:item:${item.restaurant_id}:${item.item_id}`;
                  prepareResultNavigation(key);
                  navigation.navigate('RestaurantDetail', {
                    restaurantId: item.restaurant_id,
                    itemId: item.item_id,
                    period: item.dining_period,
                    category: item.category,
                  });
                }}
                onOpenRestaurant={(restaurantId) => {
                  const key = `feed:restaurant:${restaurantId}`;
                  prepareResultNavigation(key);
                  navigation.navigate('RestaurantDetail', { restaurantId });
                }}
                onOpenChallenge={(challengeId) => {
                  navigation
                    .getParent<BottomTabNavigationProp<RootTabParamList>>()
                    ?.navigate('Explore', {
                      screen: 'ChallengeDetail',
                      params: { challengeId },
                    });
                }}
                onOpenExplore={() => {
                  navigation
                    .getParent<BottomTabNavigationProp<RootTabParamList>>()
                    ?.navigate('Explore', { screen: 'ExploreHome' });
                }}
              />
              <Animated.View
                pointerEvents={feedDimmed ? 'auto' : 'none'}
                style={[
                  styles.feedDimOverlay,
                  {
                    opacity: feedDimReveal,
                  },
                ]}
              >
                <BlurView
                  intensity={18}
                  tint="light"
                  blurMethod="dimezisBlurViewSdk31Plus"
                  style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={styles.feedDimTint} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss search"
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    searchInputRef.current?.blur();
                    Keyboard.dismiss();
                  }}
                />
              </Animated.View>
            </View>
          )}
      </ScrollView>

      <FilterPanel
        filters={filters}
        options={filterOptions}
        resultCount={isSearchActive ? results.length : filteredRestaurants.length}
        visible={filterPanelState !== 'hidden'}
        expanded={filterPanelState === 'expanded'}
        activeGroup={activeFilterGroup}
        quickLocations={quickLocations}
        quickLocationDetails={quickLocationDetails}
        locationDetailGroups={locationDetailGroups}
        quickLocationsInline={nativeQuickLocationRailVisible}
        onActiveGroupChange={setActiveFilterGroup}
        onQuickLocationToggle={handleQuickLocationToggle}
        onQuickLocationDetailToggle={handleQuickLocationDetailToggle}
        onClearLocationDetails={handleClearLocationDetails}
        onClearAll={handleClearAllFilters}
        onCollapseToPeek={() =>
          setFilterPanelState(query.trim().length > 0 ? 'peek' : 'hidden')
        }
        onExpand={() => setFilterPanelState('expanded')}
        onChange={handleFiltersChange}
      />
      <AllergyAcknowledgementSheet
        visible={allergyAcknowledgementVisible}
        onAccept={acceptAllergyAcknowledgement}
        onCancel={cancelAllergyAcknowledgement}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  allergyResultNotice: {
    backgroundColor: COLORS.goldLight,
    borderRadius: RADII.md,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  allergyResultTitle: { marginBottom: SPACING.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  headerClip: { overflow: 'hidden' },
  // Source asset (rumbly-wordmark.png, swapped again 2026-08-03 to the V2
  // script wordmark) is 480x213 (~2.25:1) -- squarer than the previous
  // artwork's ~2.57:1, so the box ratio moved with it to keep
  // resizeMode="contain" from letterboxing it. Height held at the
  // previous shrink's 44 so it isn't a fresh size decision, just the
  // width following the new ratio.
  wordmark: {
    width: 99,
    height: 44,
  },
  // Wraps headerClip and the settings button together so the button can be
  // absolutely positioned within just this small local area -- not the
  // whole screen, which has several unrelated absolutely-positioned
  // overlays further down (recentStickyShell alone is zIndex 20) that an
  // earlier, screen-wide overlay attempt collided with. Giving the button
  // its own full row instead worked but doubled up on vertical space
  // headerClip/searchRow already account for; this way it shares the
  // header's own space rather than adding a row above it.
  headerRow: {
    position: 'relative',
  },
  // Not inside headerClip itself: that Animated.View is pointerEvents="none"
  // and collapses away while searching (see introReveal), but the button
  // needs to stay tappable and visible regardless of search state. Its
  // "top" offset is measured from headerRow's own top edge, which doesn't
  // move as headerClip's height animates, so the button stays put while
  // the wordmark shrinks/fades beneath it.
  settingsOverlay: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  inlineQuickLocationRail: {
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  inlineQuickLocationContent: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  inlineQuickLocationChip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  inlineQuickLocationChipActive: {
    borderColor: COLORS.forest,
    backgroundColor: COLORS.forest,
  },
  inlineQuickLocationChipPressed: {
    opacity: 0.6,
  },
  inlineQuickLocationLabelActive: {
    color: COLORS.goldLight,
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
    width: 26,
    height: 26,
  },
  nearIcon: {
    width: 26,
    height: 26,
  },
  nearButtonShell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearPulseWrap: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearPulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
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
    backgroundColor: COLORS.cream,
  },
  searchMode: {
    flex: 1,
  },
  hiddenMode: {
    display: 'none',
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
    backgroundColor: COLORS.cream,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  locationHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  locationHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.gold,
  },
  locationHeaderText: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 12,
    color: COLORS.forest,
  },
  recentStickyShell: {
    position: 'relative',
    zIndex: 20,
    elevation: 20,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  feedDimShell: {
    position: 'relative',
    zIndex: 0,
    overflow: 'hidden',
    marginHorizontal: -SPACING.lg,
  },
  feedDimOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  feedDimTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(32, 42, 46, 0.08)',
  },
  recentReveal: {
    overflow: 'hidden',
  },
  recentSection: {
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.md,
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
