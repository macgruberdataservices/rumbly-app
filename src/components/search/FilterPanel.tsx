import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import {
  countActiveFilters,
  cuisineLabel,
  type FilterOptions,
  type SearchFilters,
} from '../../search/filters';
import {
  QUICK_LOCATIONS,
  type QuickLocationDetailGroup,
  type QuickLocationKey,
} from '../../search/quickLocations';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';
import type { FilterGroupKey } from '../../search/findState';

const PRICE_LABELS: Record<number, string> = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
export const PANEL_COLLAPSED_HEIGHT = 58;
const PANEL_TAB_HEIGHT = 40;
// Own reserved strip above the pillBar for the drag handle (owner
// feedback, 2026-07-23: the handle was overlapping the pillBar's own
// horizontally-scrolling chips instead of sitting above them, which made
// it both visually confusing and hard to reliably grab). Every dock
// height below includes this on top of the pillBar/pane height it's
// otherwise built from.
const HANDLE_HEIGHT = 24;

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function groupCount(filters: SearchFilters, group: FilterGroupKey, locationDetailCount = 0): number {
  if (group === 'location') {
    return locationDetailCount;
  }
  if (group === 'food') return filters.cuisines.size;
  if (group === 'dining') return filters.mealPeriods.size + filters.serviceTypes.size;
  return filters.priceTiers.size;
}

function clearGroup(filters: SearchFilters, group: FilterGroupKey): SearchFilters {
  if (group === 'location') {
    return { ...filters, parks: new Set(), resorts: new Set(), accessibleWithoutAdmission: false };
  }
  if (group === 'food') return { ...filters, cuisines: new Set() };
  if (group === 'dining') return { ...filters, mealPeriods: new Set(), serviceTypes: new Set() };
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
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
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

export function FilterPanel({
  filters,
  options,
  resultCount,
  visible,
  expanded,
  activeGroup,
  quickLocations,
  quickLocationDetails,
  locationDetailGroups,
  onActiveGroupChange,
  onQuickLocationToggle,
  onQuickLocationDetailToggle,
  onClearLocationDetails,
  onClearAll,
  onChange,
  onCollapseToPeek,
  onExpand,
}: {
  filters: SearchFilters;
  options: FilterOptions;
  resultCount: number;
  visible: boolean;
  expanded: boolean;
  activeGroup: FilterGroupKey;
  quickLocations: Set<QuickLocationKey>;
  quickLocationDetails: Set<string>;
  locationDetailGroups: QuickLocationDetailGroup[];
  onActiveGroupChange: (group: FilterGroupKey) => void;
  onQuickLocationToggle: (location: QuickLocationKey) => void;
  onQuickLocationDetailToggle: (detail: string) => void;
  onClearLocationDetails: () => void;
  onClearAll: () => void;
  onChange: (filters: SearchFilters) => void;
  // Drag handle pulled all the way down past the peek threshold -- tells
  // the parent to fall back to its own 'peek' state (pillBar only, no
  // detailed pane) so filterPanelState stays in sync with what's on
  // screen instead of drifting out of sync with a purely-local height.
  onCollapseToPeek: () => void;
  // Drag handle pulled up from peek past the normal threshold -- the
  // mirror image of onCollapseToPeek. Without this, dragging up from peek
  // grows the dock's height but the parent's `expanded` prop (which gates
  // expandedPane's own opacity/pointerEvents) never flips back on, so the
  // filter content stays invisible in a now-tall, empty-looking box.
  onExpand: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const expandedHeight = Math.min(220, windowHeight * 0.25);
  // Drag-handle ceiling -- twice the normal expanded height, capped so it
  // can never climb past the search bar/header up top.
  const tallHeight = Math.min(expandedHeight * 2, windowHeight * 0.6);
  const height = useRef(new Animated.Value(visible ? PANEL_COLLAPSED_HEIGHT + HANDLE_HEIGHT : 0)).current;
  const contentOpacity = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  // "Toast popping out of a toaster" (owner reference, 2026-07-21): now
  // that the pane is edge-to-edge and square-bottomed against the bar
  // (see expandedPane below), a width-changing scale would fight the
  // "flush with the bar" look -- dropped in favor of a bigger, bouncier
  // pure vertical launch. 70 (was 16) gives real travel distance; higher
  // bounciness (14, was 8) gives a real overshoot on the way up.
  const contentTranslateY = useRef(new Animated.Value(expanded ? 0 : 70)).current;
  // Bar's own slide-in, independent of the height-driven reveal below --
  // owner feedback: the 4-pill bar wanted "a little more slide" than the
  // height-clip reveal alone gave it.
  const pillBarTranslateY = useRef(new Animated.Value(visible ? 0 : PANEL_COLLAPSED_HEIGHT)).current;
  const activeCount = countActiveFilters(filters) + quickLocationDetails.size;
  const activeGroupCount = groupCount(filters, activeGroup, quickLocationDetails.size);

  // Drag-to-resize (owner request, 2026-07-23): the handle lets the pane
  // grow to `tallHeight`, settle back at the normal `expandedHeight`, or
  // collapse to just the pillBar -- three snap points, nearest-wins on
  // release. `isTall` is local UI state (not parent-tracked, unlike
  // collapsing to peek) since "tall" is just a bigger version of the same
  // 'expanded' state the parent already knows about.
  const [isTall, setIsTall] = useState(false);
  const isDraggingRef = useRef(false);
  const currentHeightRef = useRef(visible ? PANEL_COLLAPSED_HEIGHT + HANDLE_HEIGHT : 0);
  const dragStartHeightRef = useRef(0);

  // PanResponder.create() below only runs once (see the useRef(...).current
  // pattern) -- its callbacks are created on that first render and would
  // otherwise close over stale values of everything they reference. This
  // ref is reassigned every render so the (stable) callbacks can always
  // read the current props/values instead.
  const latestRef = useRef({ expanded, expandedHeight, tallHeight, onExpand, onCollapseToPeek });
  latestRef.current = { expanded, expandedHeight, tallHeight, onExpand, onCollapseToPeek };

  useEffect(() => {
    const id = height.addListener(({ value }) => {
      currentHeightRef.current = value;
    });
    return () => height.removeListener(id);
  }, [height]);

  // Reopening (or hiding) always starts back at the normal size -- "tall"
  // doesn't persist across a close/reopen cycle.
  useEffect(() => {
    if (!expanded) setIsTall(false);
  }, [expanded]);

  // react-native-gesture-handler instead of RN core's PanResponder
  // (owner feedback, 2026-07-23: PanResponder had a noticeable hold delay
  // before the drag responded) -- RNGH recognizes the gesture natively,
  // so it starts tracking on touch-down instead of waiting on a JS-thread
  // negotiation round-trip. Swipeable elsewhere in this app already pulls
  // in RNGH, so this adds no new dependency.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          isDraggingRef.current = true;
          dragStartHeightRef.current = currentHeightRef.current;
          height.stopAnimation();
        })
        .onUpdate((event) => {
          const { tallHeight: maxHeight } = latestRef.current;
          const next = Math.min(
            maxHeight + HANDLE_HEIGHT,
            Math.max(PANEL_COLLAPSED_HEIGHT + HANDLE_HEIGHT, dragStartHeightRef.current - event.translationY)
          );
          height.setValue(next);
        })
        .onEnd((event) => {
          isDraggingRef.current = false;
          const {
            expanded: wasExpanded,
            expandedHeight: normalHeight,
            tallHeight: maxHeight,
            onExpand: expand,
            onCollapseToPeek: collapseToPeek,
          } = latestRef.current;
          const released = Math.min(
            maxHeight + HANDLE_HEIGHT,
            Math.max(PANEL_COLLAPSED_HEIGHT + HANDLE_HEIGHT, dragStartHeightRef.current - event.translationY)
          );
          const candidates: Array<{ target: 'peek' | 'normal' | 'tall'; value: number }> = [
            { target: 'peek', value: PANEL_COLLAPSED_HEIGHT + HANDLE_HEIGHT },
            { target: 'normal', value: normalHeight + HANDLE_HEIGHT },
            { target: 'tall', value: maxHeight + HANDLE_HEIGHT },
          ];
          const nearest = candidates.reduce((best, candidate) =>
            Math.abs(candidate.value - released) < Math.abs(best.value - released) ? candidate : best
          );
          Animated.timing(height, {
            toValue: nearest.value,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();
          if (nearest.target === 'peek') {
            setIsTall(false);
            collapseToPeek();
          } else {
            setIsTall(nearest.target === 'tall');
            if (!wasExpanded) expand();
          }
        })
        .onFinalize(() => {
          isDraggingRef.current = false;
        }),
    [height]
  );

  useEffect(() => {
    if (isDraggingRef.current) return;
    const targetHeight = !visible
      ? 0
      : expanded
        ? (isTall ? tallHeight : expandedHeight) + HANDLE_HEIGHT
        : PANEL_COLLAPSED_HEIGHT + HANDLE_HEIGHT;
    Animated.timing(height, {
      toValue: targetHeight,
      duration: expanded ? 300 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.spring(pillBarTranslateY, {
      toValue: visible ? 0 : PANEL_COLLAPSED_HEIGHT,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();

    const showingContent = visible && expanded;
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: showingContent ? 1 : 0,
        duration: showingContent ? 120 : 100,
        useNativeDriver: true,
      }),
      // Bouncy launch on the way in, quick and settled on the way out --
      // matches how iOS sheets typically feel: playful open, brisk close.
      showingContent
        ? Animated.spring(contentTranslateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 14 })
        : Animated.timing(contentTranslateY, { toValue: 70, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [contentOpacity, contentTranslateY, expanded, expandedHeight, height, isTall, pillBarTranslateY, tallHeight, visible]);

  const renderOptions = () => {
    if (activeGroup === 'location') {
      return (
        <>
          {locationDetailGroups.length === 0 ? (
            <Text style={[text.bodyMuted, styles.emptyGroupHint]}>
              Pick a park or area below to narrow by location.
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
                onPress={() => onChange({ ...filters, mealPeriods: toggleInSet(filters.mealPeriods, period) })}
              />
            ))}
          </OptionBlock>
          <OptionBlock title="Service">
            {options.serviceTypes.map((type) => (
              <FilterChip
                key={type}
                label={type}
                active={filters.serviceTypes.has(type)}
                onPress={() => onChange({ ...filters, serviceTypes: toggleInSet(filters.serviceTypes, type) })}
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
            onPress={() => onChange({ ...filters, priceTiers: toggleInSet(filters.priceTiers, tier) })}
          />
        ))}
      </OptionBlock>
    );
  };

  return (
    <Animated.View style={[styles.dock, { height }]} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View
        style={[
          styles.expandedPaneShadow,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <View style={styles.expandedPane}>
          <BlurView intensity={45} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.expandedPaneTint} pointerEvents="none" />
          <View style={styles.groupActions}>
            <Text style={text.buttonLabel}>{resultCount} results</Text>
            <View style={styles.actionButtons}>
              <Pressable
                onPress={() => {
                  if (activeGroup === 'location') onClearLocationDetails();
                  else onChange(clearGroup(filters, activeGroup));
                }}
                disabled={activeGroupCount === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: activeGroupCount === 0 }}
              >
                <Text style={[text.buttonLabel, activeGroupCount === 0 && styles.disabledText]}>Clear group</Text>
              </Pressable>
              <Pressable
                onPress={onClearAll}
                disabled={activeCount === 0 && quickLocations.size === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: activeCount === 0 && quickLocations.size === 0 }}
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

          <View style={styles.detailGroups} accessibilityRole="tablist">
            {(['location', 'food', 'dining', 'price'] as const).map((group) => {
              const selected = activeGroup === group;
              const count = groupCount(filters, group, quickLocationDetails.size);
              const label = group === 'price' ? 'Price' : group.charAt(0).toUpperCase() + group.slice(1);
              return (
                <Pressable
                  key={group}
                  onPress={() => onActiveGroupChange(group)}
                  style={[styles.detailGroup, selected && styles.detailGroupActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.detailGroupLabel, selected && styles.detailGroupLabelActive]}>
                    {label}{count ? ` ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent}>
            {renderOptions()}
          </ScrollView>
        </View>
      </Animated.View>

      {/* Search-time coarse location filters stay available while the
          detailed pane above expands independently from the filter icon. */}
      <Animated.View style={[styles.pillBar, { transform: [{ translateY: pillBarTranslateY }] }]}>
        <ScrollView
          horizontal
          style={styles.quickScroll}
          contentContainerStyle={styles.quickContent}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_LOCATIONS.map((location) => {
            const selected = quickLocations.has(location.key);
            return (
              <Pressable
                key={location.key}
                onPress={() => onQuickLocationToggle(location.key)}
                style={[styles.quickTab, selected && styles.quickTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[text.chip, selected && styles.quickTabLabelActive]}>{location.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* Pinned to dock's own top edge (clipped by dock's animated height,
          not expandedPane's) so it's reachable in every state -- including
          'peek', where expandedPane itself is invisible/non-interactive.
          That's what makes swiping back up from peek possible at all. */}
      <View style={styles.dragHandleRow} pointerEvents={visible ? 'box-none' : 'none'}>
        <GestureDetector gesture={panGesture}>
          <View style={styles.dragHandleTouchArea}>
            <View style={styles.dragHandle} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Floats over the results/browse content below it (owner experiment,
  // 2026-07-23) instead of pushing it up in normal flow -- required for
  // expandedPane's translucent background to actually show scrolled
  // content bleeding through rather than just the plain screen behind it.
  // Pinned to the parent SafeAreaView's own bottom-edge padding, so it
  // naturally clears the home indicator without a manual insets hack.
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Hidden, not visible -- needed so the dock visually shrinks to
    // nothing when collapsing/hiding rather than the pillBar/expandedPane
    // poking out past its animated height mid-transition. Trade-off: a
    // few pixels of the expanded pane's shadow blur get clipped at rest
    // (unlike Swipeable's containerStyle override elsewhere, there's no
    // safe way to relax this one without breaking the collapse animation).
    overflow: 'hidden',
  },
  disabledText: {
    color: COLORS.dim,
  },
  // Full-width, edge-to-edge -- deliberately flat/unrounded (owner
  // decision 2026-07-20) so the expanded pane above visibly "springs out
  // of" this wider bar rather than the two reading as one continuous
  // rounded panel, which was the previous look.
  pillBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PANEL_COLLAPSED_HEIGHT,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  quickScroll: {
    flex: 1,
  },
  quickContent: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  quickTab: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    height: PANEL_TAB_HEIGHT,
  },
  quickTabActive: {
    backgroundColor: COLORS.forest,
    borderColor: COLORS.forest,
  },
  quickTabLabelActive: {
    color: COLORS.goldLight,
  },
  // box-none on this outer row lets touches pass through to whatever's
  // underneath (the pillBar's quick-location chips, in peek state) except
  // where dragHandleTouchArea itself sits -- otherwise this full-width
  // strip would swallow taps on every chip along its top edge.
  // Opaque cap, not transparent -- reads as attached to whatever's
  // directly below it (pillBar in peek, expandedPane otherwise) rather
  // than a pill floating loose over scrolled content behind the dock.
  dragHandleRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
  },
  // Generous hit area (the visible pill is much thinner) so the drag
  // gesture is easy to grab without needing pixel-perfect precision.
  dragHandleTouchArea: {
    width: 140,
    height: HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 56,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.muted,
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  detailGroups: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  detailGroup: {
    flex: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  detailGroupActive: {
    borderBottomColor: COLORS.forest,
  },
  detailGroupLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10,
    color: COLORS.muted,
  },
  detailGroupLabelActive: {
    color: COLORS.forest,
  },
  // The rounded pane that springs out of the flat pillBar below it --
  // owns its own border/radius/background/shadow now that it's no longer
  // sharing a single panel container with the bar.
  // "Toast popping out of a toaster" (owner reference, 2026-07-21):
  // edge-to-edge and flush against pillBar's top edge (bottom:
  // PANEL_COLLAPSED_HEIGHT, no gap), square where it meets the bar,
  // rounded only at the top -- reads as one continuous slot the pane
  // rises out of rather than a separate floating card. No bottom border
  // either, so pillBar's own top border is the only seam between them.
  // Shadow lives on this unclipped host (shadows render outside their
  // view's own box, so they'd get cut off by expandedPane's overflow:
  // 'hidden' below -- same split used for MenuItemRow's shadowWrapper).
  expandedPaneShadow: {
    position: 'absolute',
    // Starts below the reserved handle strip (see HANDLE_HEIGHT) instead
    // of dock's own top -- otherwise this pane's content would sit right
    // under the handle with no gap.
    top: HANDLE_HEIGHT,
    right: 0,
    bottom: PANEL_COLLAPSED_HEIGHT,
    left: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.15,
    elevation: 6,
  },
  // Actual glass: BlurView blurs whatever's scrolling underneath (owner
  // feedback, 2026-07-23 -- flat translucent color alone just read as a
  // washed-out, distracting overlay with legible text bleeding through)
  // and expandedPaneTint lays a light blue hue on top of the blur.
  // overflow: 'hidden' clips both to the rounded top corners.
  // Square top, not rounded -- dragHandleRow now owns the rounded cap
  // that used to live here, since it sits flush above this pane.
  expandedPane: {
    flex: 1,
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  expandedPaneTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(138, 199, 225, 0.28)',
  },
  optionsScroll: {
    flex: 1,
  },
  optionsContent: {
    paddingBottom: SPACING.xs,
  },
  optionBlock: {
    marginBottom: SPACING.md,
  },
  emptyGroupHint: {
    paddingVertical: SPACING.sm,
  },
  optionTitle: {
    marginBottom: SPACING.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    // Own translucent backing (independent of expandedPane's glass tint)
    // so chip labels stay legible over whatever's scrolling behind the
    // pane, not just whatever happened to be there when it opened.
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
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
