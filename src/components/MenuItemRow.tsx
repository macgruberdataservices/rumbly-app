import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { MenuItem } from '../data/types';
import { useActivity } from '../hooks/useActivity';
import { useEntitlement } from '../hooks/useEntitlement';
import { MenuItemPreviewCard } from './MenuItemPreviewCard';
import { GotItRatingCard, type GotItCardEvent, type GotItCardOrigin } from './GotItRatingCard';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

// Fixed so every row lays out identically regardless of description
// length -- name and description each get one line with ellipsis
// truncation instead of the row growing to fit. Full text (and badges,
// which don't fit this budget) lives in the long-press preview instead.
// Tune this on-device if 68 reads too tight/loose for real content.
const ROW_HEIGHT = 68;

// General-purpose (not nested under restaurant-detail/) — Milestone 5
// ended up building a dedicated ItemResultRow for search results instead
// (different fields need to be visible there: restaurant/location, not
// description/badges), but this row gained the `highlighted` prop for
// Milestone 5's search-to-menu "brief, accessible visual emphasis" on the
// exact item the user tapped through to.
//
// Interaction model (owner decision 2026-07-20, modeled on Apple Mail):
// swipe-left reveals labeled Need It / Got It / Love It circular actions
// buttons; long-press shows a purely visual preview with the full
// description and badges the fixed row can't fit; there's no navigation
// target for a plain tap (items don't have their own screen), so the row
// itself doesn't need an onPress.
//
// A real native peek/pop (Zeego, wrapping UIContextMenuInteraction) was
// tried and reverted same session -- its iOS dependency chain
// (react-native-ios-context-menu -> react-native-ios-utilities) hardcodes
// a dependency on an old, no-longer-resolvable RCT-Folly pod version, a
// genuine unfixed upstream gap on this project's RN 0.86, not something
// fixable by reinstalling or rebuilding. Expo Router's <Link.Preview>
// would be the "real" first-party native answer but requires migrating
// this project's entire React Navigation-based navigation system, wildly
// disproportionate to this one feature. Revisit either once
// react-native-ios-utilities is fixed upstream, or via a small
// custom-written Expo Modules API native module (Swift, no dependency on
// the broken chain) if this is worth real native-code investment later.
export function MenuItemRow({ item, highlighted = false }: { item: MenuItem; highlighted?: boolean }) {
  const badges = [
    item.is_kids && 'Kids',
    item.is_allergy_friendly && 'Allergy-friendly',
    item.has_allergy_option && 'Allergy option available',
    item.is_alcoholic && '21+',
  ].filter(Boolean) as string[];

  const {
    lovedItemKeys,
    needItItemKeys,
    gotItItemCounts,
    toggleItemLove,
    toggleItemNeedIt,
    addItemGotIt,
    confirmGotIt,
    undoGotIt,
  } = useActivity();
  const needItEnabled = useEntitlement('need_it');
  const gotItEnabled = useEntitlement('got_it');
  const ratingsEnabled = useEntitlement('ratings');
  const key = `${item.restaurant_id}:${item.item_id}`;
  const isLoved = lovedItemKeys.has(key);
  const isNeeded = needItItemKeys.has(key);
  const gotItCount = gotItItemCounts.get(key) ?? 0;

  const swipeableRef = useRef<Swipeable>(null);
  const rowRef = useRef<View>(null);
  const gotItButtonRef = useRef<View>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);
  const [previewOrigin, setPreviewOrigin] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  );

  // Shared by both interactions this row supports: lifts in on swipe-drag-
  // start and on press-in (settling back out on swipe-close / press-out),
  // modeled on Mail's "row lifts before the actions pop" feel -- caught
  // mid-transition in an owner screenshot during a long-press specifically.
  // Press-in fires immediately at touch-down while onLongPress only fires
  // after RN's ~500ms hold threshold, so the lift is already fully settled
  // by the time the preview pops, without any extra delay logic needed.
  // Driven by RN's own Animated (not reanimated, matching this project's
  // existing choice to skip that dependency for the collapsing header).
  const shadowAnim = useRef(new Animated.Value(0)).current;
  const animateShadow = (toValue: number) => {
    Animated.timing(shadowAnim, { toValue, duration: 150, useNativeDriver: false }).start();
  };

  // Toggle, then let the button's own color change register (plus a
  // haptic) before sliding shut -- closing immediately on press hid the
  // state change entirely, since the slide-away animation started before
  // the user could see anything happen.
  const confirmThenClose = async (toggle: () => Promise<void>) => {
    await toggle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn('haptics failed (native module may need a fresh build):', err)
    );
    setTimeout(() => swipeableRef.current?.close(), 350);
  };

  const measureGotItOrigin = (): Promise<GotItCardOrigin | null> =>
    new Promise((resolve) => {
      if (!gotItButtonRef.current) {
        resolve(null);
        return;
      }
      gotItButtonRef.current.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    });

  const openGotItCard = async () => {
    const origin = await measureGotItOrigin();
    const clientId = await addItemGotIt(item.restaurant_id, item.item_id);
    setGotItEvent({ clientId, targetName: item.item, count: gotItCount + 1, origin });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
      console.warn('haptics failed (native module may need a fresh build):', err)
    );
    swipeableRef.current?.close();
  };

  const renderRightActions = () => (
    <View style={styles.actionsRow}>
      {needItEnabled && (
        <Pressable
          style={styles.actionButton}
          onPress={() => confirmThenClose(() => toggleItemNeedIt(item.restaurant_id, item.item_id))}
          accessibilityRole="button"
          accessibilityLabel={isNeeded ? 'Remove from Need It' : 'Add to Need It'}
          accessibilityState={{ selected: isNeeded }}
        >
          <View style={[styles.actionCircle, isNeeded && styles.actionCircleNeed]}>
            <Text style={[styles.actionGlyph, isNeeded && styles.actionGlyphActive]}>★</Text>
          </View>
          <Text style={styles.actionLabel}>Need It</Text>
        </Pressable>
      )}
      {gotItEnabled && (
        <Pressable
          ref={gotItButtonRef}
          style={styles.actionButton}
          onPress={openGotItCard}
          accessibilityRole="button"
          accessibilityLabel={gotItCount > 0 ? `Log Got It again, logged ${gotItCount} times` : 'Log Got It'}
        >
          <View style={[styles.actionCircle, gotItCount > 0 && styles.actionCircleGot]}>
            <Text style={[styles.actionGlyph, gotItCount > 0 && styles.actionGlyphActive]}>✓</Text>
            {gotItCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeLabel}>{gotItCount > 99 ? '99+' : gotItCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.actionLabel}>Got It</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.actionButton}
        onPress={() => confirmThenClose(() => toggleItemLove(item.restaurant_id, item.item_id))}
        accessibilityRole="button"
        accessibilityLabel={isLoved ? 'Remove from Love It' : 'Add to Love It'}
        accessibilityState={{ selected: isLoved }}
      >
        <View style={[styles.actionCircle, isLoved && styles.actionCircleLove]}>
          <Text style={[styles.actionGlyph, isLoved && styles.actionGlyphActive]}>♥</Text>
        </View>
        <Text style={styles.actionLabel}>Love It</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        onSwipeableOpenStartDrag={() => animateShadow(1)}
        onSwipeableClose={() => animateShadow(0)}
        // Swipeable's own container defaults to overflow: 'hidden' (to
        // clip the reveal panel pre-swipe) -- that also clips any shadow
        // on our row, since shadows render outside the element's own box.
        // This overrides just that one property; the clip behavior for
        // the reveal panel itself is unaffected.
        containerStyle={styles.swipeableContainer}
      >
        <Animated.View
          style={[
            styles.shadowWrapper,
            {
              shadowOpacity: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] }),
              elevation: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }),
              transform: [{ scale: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
            },
          ]}
        >
          <AnimatedPressable
            ref={rowRef}
            onPressIn={() => animateShadow(1)}
            onPressOut={() => animateShadow(0)}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((err) =>
                console.warn('haptics failed (native module may need a fresh build):', err)
              );
              // Measure before showing the preview so it can grow from the
              // row's actual on-screen position instead of just fading in
              // centered -- see MenuItemPreviewCard's growAnim.
              rowRef.current?.measureInWindow((x, y, width, height) => {
                setPreviewOrigin({ x, y, width, height });
                setPreviewVisible(true);
              });
            }}
            accessible
            accessibilityLabel={[item.item, item.price_display, item.description, ...badges].filter(Boolean).join(', ')}
            accessibilityState={{ selected: highlighted }}
            style={[
              styles.row,
              highlighted && styles.rowHighlighted,
              // Short highlight confirming the touch registered, tied to
              // the same press lifecycle as the shadow/scale above so
              // everything animates together from one gesture.
              { backgroundColor: shadowAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.surface, COLORS.goldLight] }) },
            ]}
          >
            <View style={styles.titleRow}>
              <Text style={[text.restaurantName, styles.name]} numberOfLines={1}>
                {item.item}
              </Text>
              <Text style={[text.body, styles.price]}>{item.price_display}</Text>
            </View>
            {!!item.description && (
              <Text style={[text.bodyMuted, styles.description]} numberOfLines={1}>
                {item.description}
              </Text>
            )}
          </AnimatedPressable>
        </Animated.View>
      </Swipeable>
      <MenuItemPreviewCard
        item={previewVisible ? item : null}
        badges={badges}
        origin={previewOrigin}
        onClose={() => {
          setPreviewVisible(false);
          animateShadow(0);
        }}
      />
      <GotItRatingCard
        event={gotItEvent}
        ratingsEnabled={ratingsEnabled}
        onConfirm={async (rating) => {
          if (!gotItEvent) return;
          await confirmGotIt(gotItEvent.clientId, rating);
          setGotItEvent(null);
        }}
        onUndo={async () => {
          if (!gotItEvent) return;
          await undoGotIt(gotItEvent.clientId, item.restaurant_id, item.item_id);
          setGotItEvent(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Opaque background required here (not just on `row`) for the shadow to
  // render correctly -- RN computes shadows from the casting view's own
  // opaque shape.
  // No directional offset -- a non-zero height biases the shadow toward
  // one edge (e.g. height: 2 makes the bottom band strong and the top
  // band weak). Zero offset + radius alone gives an even band on all
  // four sides, matching the symmetric top/bottom lift in the reference
  // screenshot.
  shadowWrapper: {
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
  },
  swipeableContainer: {
    overflow: 'visible',
  },
  row: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  // Static, not animated — reduced-motion-safe by construction, no fade
  // logic needed. Cleared on a timeout by the caller (RestaurantDetailScreen).
  rowHighlighted: {
    backgroundColor: COLORS.goldLight,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  name: {
    flex: 1,
    fontSize: 15,
  },
  price: {
    fontSize: 14,
  },
  description: {
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  actionButton: {
    width: 50,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.border,
  },
  actionCircleLove: {
    backgroundColor: COLORS.pine,
  },
  actionCircleNeed: {
    backgroundColor: COLORS.gold,
  },
  actionCircleGot: {
    backgroundColor: COLORS.barkBrown,
  },
  actionGlyph: {
    fontSize: 16,
    color: COLORS.ink,
  },
  actionGlyphActive: {
    color: COLORS.surface,
  },
  actionLabel: {
    marginTop: 2,
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10,
    lineHeight: 12,
    color: COLORS.muted,
  },
  countBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pine,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
  countBadgeLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 9,
    lineHeight: 11,
    color: COLORS.surface,
  },
});
