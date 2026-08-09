import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RestaurantDetailRouteParams } from '../navigation/browseTypes';
import { useDataProvider } from '../hooks/useDataProvider';
import { useAppSettings } from '../hooks/useAppSettings';
import { useAuth } from '../hooks/useAuth';
import { getMenuItemsByRestaurant } from '../data/db';
import { getTodayStatus } from '../data/hoursStatus';
import { dropRedundantAllDay, sortPeriods, defaultPeriod } from '../data/period';
import { itemVisibleInMenu } from '../search/filters';
import type { MenuItem } from '../data/types';
import { ExpandedHeader } from '../components/restaurant-detail/ExpandedHeader';
import { CollapsedHeader } from '../components/restaurant-detail/CollapsedHeader';
import { CategoryNavigator } from '../components/restaurant-detail/CategoryNavigator';
import { CapabilityDetailSheet, type CapabilityKind } from '../components/restaurant-detail/CapabilityDetailSheet';
import {
  NativeRestaurantMenu,
  type NativeRestaurantMenuRef,
} from '../components/restaurant-detail/NativeRestaurantMenu';
import { MenuItemRow } from '../components/MenuItemRow';
import { closeOpenSwipeable } from '../components/swipeableCoordinator';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';
import { recordRecommendationEvent } from '../recommendations/remote';

type Props = {
  route: { params: RestaurantDetailRouteParams };
  navigation: {
    goBack: () => void;
    addListener: (
      event: 'transitionEnd',
      callback: (event: { data: { closing: boolean } }) => void
    ) => () => void;
    navigate: (
      screen: 'NativeMenuPilot',
      params: {
        restaurantId: string;
        initialPeriod?: string;
        initialCategory?: string;
        initialItemId?: string;
      }
    ) => void;
  };
};

const COLLAPSED_HEADER_HEIGHT = 52;
const DEFAULT_EXPANDED_HEIGHT = 260;

interface Section {
  title: string;
  sectionIndex: number;
  data: MenuItem[];
}

export function RestaurantDetailScreen({ route, navigation }: Props) {
  const { restaurantId, itemId: targetItemId, period: targetPeriod, category: targetCategory } = route.params;
  const { restaurants, hoursData } = useDataProvider();
  const { findFeedEnabled, nativeInteractionsEnabled, showAllergyFriendlyMenuItems } = useAppSettings();
  const useNativeMenu = nativeInteractionsEnabled && Platform.OS === 'ios';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const restaurant = useMemo(
    () => restaurants.find((r) => r.restaurant_id === restaurantId),
    [restaurants, restaurantId]
  );

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [expandedHeaderHeight, setExpandedHeaderHeight] = useState(DEFAULT_EXPANDED_HEIGHT);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [capabilitySheet, setCapabilitySheet] = useState<CapabilityKind | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [nativeMenuReady, setNativeMenuReady] = useState(false);
  const [screenTransitionComplete, setScreenTransitionComplete] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const sectionListRef = useRef<SectionList<MenuItem, Section>>(null);
  const nativeMenuRef = useRef<NativeRestaurantMenuRef>(null);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const categoryChipLayoutsRef = useRef<{ x: number; width: number }[]>([]);
  const isProgrammaticScrollRef = useRef(false);
  const clearProgrammaticGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);
  const reducedMotionRef = useRef(false);
  // Search-driven targeting (itemId/period/category route params) should
  // only ever fire the scroll-and-highlight once per screen instance —
  // not re-fire if the user manually switches periods afterward.
  const searchTargetConsumedRef = useRef(false);
  // Remembers the last scrollToLocation() target so onScrollToIndexFailed
  // (below) can retry it — RN's own documented fix for exactly this error,
  // needed because search tap-through can request a mid-list item before
  // SectionList has completed any layout pass at all (a fresh navigation,
  // not a user tap on an already-settled list like onCategoryPress below).
  const lastScrollTargetRef = useRef<{ sectionIndex: number; itemIndex: number } | null>(null);
  const recordedViewRef = useRef<string | null>(null);

  useEffect(
    () =>
      navigation.addListener('transitionEnd', ({ data }) => {
        if (!data.closing) setScreenTransitionComplete(true);
      }),
    [navigation]
  );

  useEffect(() => {
    if (!findFeedEnabled || !user) return;
    const viewKey = `${user.id}:${restaurantId}:${targetItemId ?? ''}`;
    if (recordedViewRef.current === viewKey) return;
    recordedViewRef.current = viewKey;
    void recordRecommendationEvent(user.id, {
      eventType: 'view',
      targetType: targetItemId ? 'item' : 'restaurant',
      restaurantId,
      itemId: targetItemId ?? null,
      context: { source: 'restaurant_detail' },
    });
  }, [findFeedEnabled, restaurantId, targetItemId, user]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingItems(true);
    getMenuItemsByRestaurant(restaurantId).then((items) => {
      if (!cancelled) {
        setMenuItems(items);
        setIsLoadingItems(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reducedMotionRef.current = enabled;
      setReducedMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reducedMotionRef.current = enabled;
      setReducedMotion(enabled);
    });
    return () => sub.remove();
  }, []);

  const periods = useMemo(() => {
    const set = new Set(
      menuItems
        .filter((i) => itemVisibleInMenu(i, showAllergyFriendlyMenuItems))
        .map((i) => i.dining_period)
    );
    return sortPeriods(dropRedundantAllDay(Array.from(set)));
  }, [menuItems, showAllergyFriendlyMenuItems]);

  useEffect(() => {
    if (!selectedPeriod && periods.length > 0) {
      // Search tap-through requests a specific period (the item's own
      // dining_period) — honor it over the time-of-day default when it's
      // actually one of this restaurant's real periods.
      const preferred = targetPeriod && periods.includes(targetPeriod) ? targetPeriod : undefined;
      setSelectedPeriod(preferred ?? defaultPeriod(periods) ?? periods[0]);
    }
  }, [periods, selectedPeriod, targetPeriod]);

  const sections: Section[] = useMemo(() => {
    if (!selectedPeriod) return [];
    const filtered = menuItems.filter(
      (i) => itemVisibleInMenu(i, showAllergyFriendlyMenuItems) && i.dining_period === selectedPeriod
    );
    const byCategory = new Map<string, { order: number; items: MenuItem[] }>();
    for (const item of filtered) {
      const existing = byCategory.get(item.category);
      if (existing) {
        existing.items.push(item);
      } else {
        byCategory.set(item.category, { order: item.group_display_order, items: [item] });
      }
    }
    return Array.from(byCategory.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([category, { items }], sectionIndex) => ({ title: category, sectionIndex, data: items }));
  }, [menuItems, selectedPeriod, showAllergyFriendlyMenuItems]);

  const nativeTargetAnchorId = useMemo(() => {
    if (!targetItemId || !targetCategory) return null;
    const sectionIndex = sections.findIndex((section) => section.title === targetCategory);
    if (sectionIndex === -1) return null;
    const itemIndex = sections[sectionIndex].data.findIndex(
      (item) => item.item_id === targetItemId
    );
    if (itemIndex === -1) return null;
    return `${sectionIndex}:${itemIndex}:${targetItemId}`;
  }, [sections, targetCategory, targetItemId]);

  // Reset the active-category index whenever the section set itself
  // changes (period switch) so a stale active index from the old period
  // doesn't leak into the new one. Deliberately does NOT clear
  // categoryChipLayoutsRef — each new period's chips overwrite the
  // indices they cover via onLayout as they mount (confirmed: onLayout
  // fires reliably for all chips right at mount), and any stale trailing
  // entries from a longer previous period are never read, since callers
  // only ever pass indices bounded by the current sections length.
  // (An earlier version reset this ref here too, which raced against
  // the chips' own onLayout firing and could wipe out real layout data
  // depending on timing — that race is why the horizontal auto-scroll
  // silently did nothing despite the active-index logic itself being
  // correct.)
  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveCategoryIndex(0);
  }, [selectedPeriod]);

  const hoursStatus = useMemo(() => getTodayStatus(hoursData, restaurantId), [hoursData, restaurantId]);

  const scrollChipIntoView = useCallback(
    (index: number) => {
      const chip = categoryChipLayoutsRef.current[index];
      if (!chip) return;
      const screenWidth = Dimensions.get('window').width;
      const target = Math.max(0, chip.x - screenWidth / 2 + chip.width / 2);
      horizontalScrollRef.current?.scrollTo({ x: target, animated: !reducedMotionRef.current });
    },
    []
  );

  // Drives the header-collapse animation — section-sync otherwise uses
  // onViewableItemsChanged below, not scroll position math. (An earlier
  // version tried computing the active section from each section
  // header's onLayout `y`, but SectionList/VirtualizedList wraps every
  // section in its own internal cell, so that `y` is relative to that
  // cell — always ~0 — not the scrollable content. onViewableItemsChanged
  // is RN's actual built-in mechanism for "what's currently visible.")
  //
  // The listener below is the one exception: onViewableItemsChanged only
  // flips to a new section once one of ITS items is "viewable" at all
  // (itemVisiblePercentThreshold: 1 — a single visible pixel counts), so a
  // last section shorter than the screen can leave a sliver of the
  // second-to-last section's last item still technically viewable at the
  // very top of the viewport even once you've scrolled to the true
  // bottom — "viewable" picks whichever section is first in list order,
  // so the chip strip gets stuck one section behind forever, since
  // there's no section after the last one to force it forward. Confirmed
  // against a real long menu, 2026-08-05 (Hollywood Brown Derby's final
  // wine section never took over from the one before it). Once scroll
  // has actually reached the real end of the content, the last section
  // unambiguously IS what's being looked at, so that takes priority.
  const scrollHandler = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (isProgrammaticScrollRef.current) return;
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          const isAtRealEnd =
            contentSize.height > 0
            && contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
          const lastIndex = sections.length - 1;
          if (isAtRealEnd && lastIndex >= 0 && lastIndex !== activeIndexRef.current) {
            activeIndexRef.current = lastIndex;
            setActiveCategoryIndex(lastIndex);
            scrollChipIntoView(lastIndex);
          }
        },
      }),
    [scrollY, sections.length, scrollChipIntoView]
  );

  // Stable refs (not useCallback) so identity never changes across
  // renders — RN warns/resets viewability tracking if these change.
  // Reads activeIndexRef/isProgrammaticScrollRef live, and
  // setActiveCategoryIndex/scrollChipIntoView are themselves stable, so
  // there's no stale-closure risk despite the ref-once pattern.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ isViewable: boolean; section?: { sectionIndex?: number } }> }) => {
      if (isProgrammaticScrollRef.current) return;
      const firstViewable = viewableItems.find((v) => v.isViewable);
      const sectionIndex = firstViewable?.section?.sectionIndex;
      if (typeof sectionIndex === 'number' && sectionIndex !== activeIndexRef.current) {
        activeIndexRef.current = sectionIndex;
        setActiveCategoryIndex(sectionIndex);
        scrollChipIntoView(sectionIndex);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1, minimumViewTime: 50 }).current;

  // Shared by onCategoryPress and the search-tap-through effect below —
  // one call site for scrollToLocation so both share the same
  // onScrollToIndexFailed retry path via lastScrollTargetRef.
  const scrollToSectionItem = useCallback((sectionIndex: number, itemIndex: number, animated: boolean) => {
    lastScrollTargetRef.current = { sectionIndex, itemIndex };
    sectionListRef.current?.scrollToLocation({
      sectionIndex,
      itemIndex,
      viewOffset: COLLAPSED_HEADER_HEIGHT,
      animated,
    });
  }, []);

  const onCategoryPress = useCallback(
    (index: number) => {
      isProgrammaticScrollRef.current = true;
      activeIndexRef.current = index;
      setActiveCategoryIndex(index);
      scrollChipIntoView(index);
      if (useNativeMenu) {
        const category = sections[index]?.title;
        if (category) {
          void nativeMenuRef.current?.scrollToCategory(category);
        }
      } else {
        scrollToSectionItem(index, 0, !reducedMotionRef.current);
      }
      // scrollToLocation's animated scroll doesn't reliably fire
      // onMomentumScrollEnd at the right moment — confirmed: jumping to
      // an earlier section (scrolling back "up") can visibly overshoot
      // and correct while SectionList measures not-yet-rendered content,
      // firing a momentum-end event before that correction settles. A
      // stale onViewableItemsChanged update from mid-correction was
      // sneaking through and overwriting the just-selected index with
      // whatever section briefly scrolled past. A fixed delay is the
      // robust guard here; clear any previous pending one first so rapid
      // taps don't let an earlier timeout unblock a still-in-flight scroll.
      if (clearProgrammaticGuardTimeoutRef.current) {
        clearTimeout(clearProgrammaticGuardTimeoutRef.current);
      }
      clearProgrammaticGuardTimeoutRef.current = setTimeout(
        () => {
          isProgrammaticScrollRef.current = false;
        },
        reducedMotionRef.current ? 0 : 600
      );
    },
    [scrollChipIntoView, scrollToSectionItem, sections, useNativeMenu]
  );

  const onNativeActiveCategoryChange = useCallback(
    (category: string) => {
      if (isProgrammaticScrollRef.current) return;
      const index = sections.findIndex((section) => section.title === category);
      if (index === -1 || index === activeIndexRef.current) return;
      activeIndexRef.current = index;
      setActiveCategoryIndex(index);
      scrollChipIntoView(index);
    },
    [scrollChipIntoView, sections]
  );

  useEffect(() => {
    if (!useNativeMenu || sections.length === 0) return;
    scrollY.setValue(0);
    // The persistent targetAnchorId owns initial positioning for a search
    // result. Do not race it with the normal period-change initialization
    // that returns an untargeted menu to its first section.
    if (nativeTargetAnchorId) return;
    const frame = requestAnimationFrame(() => {
      void nativeMenuRef.current?.scrollToCategory(sections[0].title);
    });
    return () => cancelAnimationFrame(frame);
  }, [nativeTargetAnchorId, scrollY, sections, selectedPeriod, useNativeMenu]);

  // Milestone 5 search tap-through: once this restaurant's sections are
  // built for the (possibly search-requested) period, find the exact
  // section/item the search result pointed at and scroll+highlight it —
  // same guard pattern as onCategoryPress above (isProgrammaticScrollRef +
  // a fixed-delay clear, not onMomentumScrollEnd, for the same reason
  // documented there). Runs at most once per screen instance; if the
  // target period/category/item isn't found (stale data, edge case), it
  // just never fires rather than throwing.
  useEffect(() => {
    if (searchTargetConsumedRef.current) return;
    if (!targetItemId || !targetCategory) return;
    if (sections.length === 0) return;
    if (useNativeMenu && !nativeMenuReady) return;
    if (!screenTransitionComplete) return;

    const sectionIndex = sections.findIndex((s) => s.title === targetCategory);
    if (sectionIndex === -1) return;
    const itemIndex = sections[sectionIndex].data.findIndex((i) => i.item_id === targetItemId);
    if (itemIndex === -1) return;
    const targetItem = sections[sectionIndex].data[itemIndex];

    searchTargetConsumedRef.current = true;
    isProgrammaticScrollRef.current = true;
    activeIndexRef.current = sectionIndex;
    setActiveCategoryIndex(sectionIndex);
    // Chip layouts land asynchronously via onLayout as CategoryNavigator
    // mounts — deferred a tick so this doesn't race them the same way
    // onCategoryPress's own comment above describes.
    requestAnimationFrame(() => scrollChipIntoView(sectionIndex));
    // The retained native target gets the destination across the bridge, but
    // SwiftUI can discard that initial positioning while the navigation
    // transition is still establishing the hosted view. Once both the native
    // list and the screen transition explicitly report ready, issue the same
    // fresh request used by a working category-pill tap. Native rows are
    // eagerly laid out, so this is lifecycle-gated rather than delay-based.
    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
    if (useNativeMenu) {
      void nativeMenuRef.current?.scrollToItem(targetItemId, targetCategory);
    } else {
      scrollTimeout = setTimeout(() => {
        scrollToSectionItem(sectionIndex, itemIndex, !reducedMotionRef.current);
      }, 150);
    }
    setHighlightedItemId(targetItemId);
    AccessibilityInfo.announceForAccessibility(`${targetItem.item}, selected search result`);
    const highlightTimeout = setTimeout(() => setHighlightedItemId(null), 2000);

    if (clearProgrammaticGuardTimeoutRef.current) {
      clearTimeout(clearProgrammaticGuardTimeoutRef.current);
    }
    clearProgrammaticGuardTimeoutRef.current = setTimeout(
      () => {
        isProgrammaticScrollRef.current = false;
      },
      reducedMotionRef.current ? 0 : 600
    );

    return () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      clearTimeout(highlightTimeout);
    };
  }, [
    sections,
    targetItemId,
    targetCategory,
    scrollChipIntoView,
    scrollToSectionItem,
    nativeMenuReady,
    screenTransitionComplete,
    useNativeMenu,
  ]);

  useEffect(() => {
    scrollY.setValue(0);
  }, [scrollY, useNativeMenu]);

  // headerClip only holds ExpandedHeader now — the collapsed name/status
  // content lives in the always-rendered CollapsedHeader bar above it, so
  // this clip collapses all the way to 0 (not COLLAPSED_HEADER_HEIGHT,
  // which would leave a redundant empty gap under the persistent bar).
  const collapseRange = Math.max(expandedHeaderHeight - COLLAPSED_HEADER_HEIGHT, 1);
  // A short menu (few items, few categories) can have less real scrollable
  // content than collapseRange -- scrollY then physically can't reach the
  // value the collapse animation needs, so it gets stuck mid-transition
  // forever, and CategoryNavigator's scroll-driven active-chip sync never
  // gets far enough to reach later categories either (same root cause:
  // both are driven by scroll position, neither checks there's enough
  // scrollable distance to reach it). minHeight is a floor, not an
  // addition -- it only pads a menu that's actually this short; a normal
  // menu already taller than a screen is untouched.
  const minScrollableContentHeight = Dimensions.get('window').height + collapseRange;
  const headerHeightAnim = scrollY.interpolate({
    inputRange: [0, collapseRange],
    outputRange: [expandedHeaderHeight, 0],
    extrapolate: 'clamp',
  });
  const collapseProgress = scrollY.interpolate({
    inputRange: [0, collapseRange],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const expandedOpacity = collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  if (!restaurant) {
    return (
      <View style={styles.centered}>
        <Text style={text.body}>Restaurant not found offline.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Always rendered — Back must work even when the restaurant's menu
          is short enough that the screen never scrolls far enough to
          reach the collapsed state. Only the center name/status content
          fades in on collapse (titleOpacity). */}
      <CollapsedHeader
        restaurantName={restaurant.restaurant}
        hoursStatus={hoursStatus}
        titleOpacity={collapseProgress}
        onBack={() => navigation.goBack()}
      />

      <Animated.View style={[styles.headerClip, { height: headerHeightAnim }]}>
        <Animated.View style={[styles.headerLayer, { opacity: expandedOpacity }]}>
          <View onLayout={(e) => setExpandedHeaderHeight(e.nativeEvent.layout.height)}>
            <ExpandedHeader
              restaurant={restaurant}
              hoursStatus={hoursStatus}
              onCapabilityPress={setCapabilitySheet}
            />
          </View>
        </Animated.View>
      </Animated.View>

      {periods.length > 1 ? (
        <View style={styles.periodRow}>
          {periods.map((period) => (
            <Text
              key={period}
              onPress={() => setSelectedPeriod(period)}
              style={[styles.periodChip, period === selectedPeriod && styles.periodChipActive]}
            >
              {period.toUpperCase()}
            </Text>
          ))}
        </View>
      ) : periods.length === 1 ? (
        <View style={styles.periodRow}>
          <Text style={[styles.periodChip, styles.periodChipActive]}>{periods[0].toUpperCase()}</Text>
        </View>
      ) : null}

      {sections.length > 0 && (
        <CategoryNavigator
          ref={horizontalScrollRef}
          categories={sections.map((s) => s.title)}
          activeIndex={activeCategoryIndex}
          onPress={onCategoryPress}
          onChipLayout={(index, layout) => {
            categoryChipLayoutsRef.current[index] = layout;
          }}
        />
      )}

      {isLoadingItems ? (
        <View style={styles.centered}>
          <Text style={text.bodyMuted}>Loading menu…</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centered}>
          <Text style={text.bodyMuted}>No menu available for this location.</Text>
        </View>
      ) : useNativeMenu ? (
        <NativeRestaurantMenu
          ref={nativeMenuRef}
          sections={sections}
          targetAnchorId={nativeTargetAnchorId}
          highlightedItemId={highlightedItemId}
          bottomInset={insets.bottom}
          minContentHeight={minScrollableContentHeight}
          onReady={() => setNativeMenuReady(true)}
          onActiveCategoryChange={onNativeActiveCategoryChange}
          onScrollOffsetChange={(offsetY) => {
            scrollY.setValue(offsetY);
          }}
        />
      ) : (
        <SectionList
          ref={sectionListRef}
          style={styles.sectionList}
          sections={sections}
          keyExtractor={(item) => item.item_id}
          stickySectionHeadersEnabled={false}
          onScroll={scrollHandler}
          onScrollBeginDrag={closeOpenSwipeable}
          scrollEventThrottle={16}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          // RN's own documented fix for "scrollToIndex should be used in
          // conjunction with getItemLayout or onScrollToIndexFailed" —
          // retry the last-requested target once layout has caught up.
          // Belt-and-suspenders alongside scrollToSectionItem's deferred
          // call above, not a replacement for it.
          onScrollToIndexFailed={() => {
            const target = lastScrollTargetRef.current;
            if (!target) return;
            setTimeout(() => {
              sectionListRef.current?.scrollToLocation({
                sectionIndex: target.sectionIndex,
                itemIndex: target.itemIndex,
                viewOffset: COLLAPSED_HEADER_HEIGHT,
                animated: false,
              });
            }, 100);
          }}
          contentContainerStyle={{
            paddingBottom: insets.bottom,
            minHeight: minScrollableContentHeight,
          }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={text.categoryHeader}>{section.title.toUpperCase()}</Text>
            </View>
          )}
          renderItem={({ item }) => <MenuItemRow item={item} highlighted={item.item_id === highlightedItemId} />}
        />
      )}

      <CapabilityDetailSheet
        kind={capabilitySheet}
        officialUrl={restaurant.disney_url}
        onClose={() => setCapabilitySheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerClip: {
    overflow: 'hidden',
  },
  headerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // Underline tabs, deliberately not the same filled-pill shape as
  // CategoryNavigator directly below -- these are two different kinds of
  // control (which meal period vs. jump to a menu section) and looking
  // identical was making the header read as one undifferentiated stack of
  // pills.
  periodRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  periodChip: {
    fontFamily: text.chip.fontFamily,
    fontSize: 13,
    letterSpacing: 0.4,
    color: COLORS.dim,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  periodChipActive: {
    color: COLORS.ink,
    borderBottomColor: COLORS.ink,
  },
  sectionList: {
    flex: 1,
  },
  sectionHeader: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
});
