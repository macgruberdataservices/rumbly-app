import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import type { Restaurant } from '../../data/types';
import { restaurantLocationLabel } from '../../data/locationNames';
import type { HoursStatus } from '../../data/hoursStatus';
import type { CapabilityKind } from './CapabilityDetailSheet';
import { hasMobileOrder, openMobileOrderInOfficialApp, openRestaurantInOfficialApp } from '../../data/mdxDeepLink';
import { formatRatingAverage } from '../../data/ratingAverage';
import { useActivity } from '../../hooks/useActivity';
import { useEntitlement } from '../../hooks/useEntitlement';
import { GotItRatingCard, type GotItCardEvent, type GotItCardOrigin } from '../GotItRatingCard';
import {
  registerSwipeableOpen,
  unregisterSwipeable,
} from '../swipeableCoordinator';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

function priceLabel(r: Restaurant): string {
  return r.price_tier_display || (r.price_tier ? '$'.repeat(r.price_tier) : '');
}

function hasDiningPlan(r: Restaurant): boolean {
  return r.raw_facets.some((f) => f.group === 'diningPlan');
}

// Hand-drawn View-shape icons matching RootNavigator.tsx's tab-bar icon
// technique (small fixed frame + 1-2 border-trick children, no icon
// library) -- placeholder style for now, a real icon set can replace
// these later without changing the pill row's layout/behavior.
function ReservationsIcon({ color }: { color: string }) {
  return (
    <View style={pillIconStyles.frame}>
      <View style={[pillIconStyles.clockFace, { borderColor: color }]} />
      <View style={[pillIconStyles.clockHand, { backgroundColor: color }]} />
    </View>
  );
}

function WalkUpIcon({ color }: { color: string }) {
  return (
    <View style={pillIconStyles.frame}>
      <View style={[pillIconStyles.listBar, { backgroundColor: color }]} />
      <View style={[pillIconStyles.listBar, { backgroundColor: color, marginTop: 2 }]} />
      <View style={[pillIconStyles.listBar, { backgroundColor: color, marginTop: 2 }]} />
    </View>
  );
}

function MobileOrderIcon({ color }: { color: string }) {
  return (
    <View style={pillIconStyles.frame}>
      <View style={[pillIconStyles.phoneOutline, { borderColor: color }]} />
      <View style={[pillIconStyles.phoneButton, { backgroundColor: color }]} />
    </View>
  );
}

const pillIconStyles = StyleSheet.create({
  frame: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  clockFace: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  clockHand: {
    position: 'absolute',
    width: 1.5,
    height: 4,
    borderRadius: 1,
    top: 2,
  },
  listBar: {
    width: 10,
    height: 1.5,
    borderRadius: 1,
  },
  phoneOutline: {
    width: 8,
    height: 13,
    borderRadius: 2,
    borderWidth: 1.5,
  },
  phoneButton: {
    position: 'absolute',
    width: 1.5,
    height: 1.5,
    borderRadius: 1,
    bottom: 2.5,
  },
});

export function ExpandedHeader({
  restaurant,
  hoursStatus,
  onCapabilityPress,
}: {
  restaurant: Restaurant;
  hoursStatus: HoursStatus;
  onCapabilityPress: (kind: CapabilityKind) => void;
}) {
  const serviceLine = [restaurant.experience_type || restaurant.service_style, priceLabel(restaurant)]
    .filter(Boolean)
    .join(' · ');

  const hasDirections = restaurant.lat !== null && restaurant.lng !== null;

  const {
    lovedIds,
    needItRestaurantIds,
    gotItRestaurantCounts,
    restaurantRatingAverages,
    toggleLove,
    toggleRestaurantNeedIt,
    addRestaurantGotIt,
    confirmGotIt,
    undoGotIt,
  } = useActivity();
  const needItEnabled = useEntitlement('need_it');
  const gotItEnabled = useEntitlement('got_it');
  const ratingsEnabled = useEntitlement('ratings');
  // Independent of the 'ratings' entitlement above (which gates whether a
  // user can *capture* a star rating on Got It) -- this gates whether the
  // computed average gets *displayed* anywhere, so either can be toggled
  // per user without touching the other (owner request, 2026-07-27).
  const ratingAveragesEnabled = useEntitlement('rating_averages');
  const isLoved = lovedIds.has(restaurant.restaurant_id);
  const isNeeded = needItRestaurantIds.has(restaurant.restaurant_id);
  const gotItCount = gotItRestaurantCounts.get(restaurant.restaurant_id) ?? 0;
  const ratingAverageLabel = ratingAveragesEnabled
    ? formatRatingAverage(restaurantRatingAverages.get(restaurant.restaurant_id))
    : null;
  const gotItButtonRef = useRef<View>(null);
  const swipeableRef = useRef<Swipeable>(null);
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);
  const [slideActive, setSlideActive] = useState(false);

  useEffect(
    () => () => {
      if (swipeableRef.current) unregisterSwipeable(swipeableRef.current);
    },
    []
  );

  const confirmThenClose = async (toggle: () => Promise<void>) => {
    await toggle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
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
    const clientId = await addRestaurantGotIt(restaurant.restaurant_id);
    setGotItEvent({ clientId, targetName: restaurant.restaurant, count: gotItCount + 1, origin });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    swipeableRef.current?.close();
  };

  const openDirections = () => {
    if (!hasDirections) return;
    const url =
      Platform.select({
        ios: `maps://?daddr=${restaurant.lat},${restaurant.lng}`,
        default: `geo:${restaurant.lat},${restaurant.lng}?q=${restaurant.lat},${restaurant.lng}`,
      }) ?? '';
    Linking.openURL(url);
  };

  const renderRightActions = () => (
    <View style={styles.actionsRow}>
      {needItEnabled && (
        <Pressable
          style={styles.actionButton}
          onPress={() => confirmThenClose(() => toggleRestaurantNeedIt(restaurant.restaurant_id))}
          accessibilityRole="button"
          accessibilityLabel={isNeeded ? 'Remove restaurant from Need It' : 'Add restaurant to Need It'}
          accessibilityState={{ selected: isNeeded }}
        >
          <View style={[styles.actionCircle, styles.actionCircleNeed]}>
            <Text style={[styles.actionGlyph, styles.actionGlyphActive]}>{isNeeded ? '★' : '☆'}</Text>
          </View>
          <Text style={[styles.actionLabel, styles.actionLabelNeed]}>Need It</Text>
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
          <View style={[styles.actionCircle, styles.actionCircleGot]}>
            <Text style={[styles.actionGlyph, styles.actionGlyphActive]}>✓</Text>
            {gotItCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeLabel}>{gotItCount > 99 ? '99+' : gotItCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.actionLabel, styles.actionLabelGot]}>Got It</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.actionButton}
        onPress={() => confirmThenClose(() => toggleLove(restaurant.restaurant_id))}
        accessibilityRole="button"
        accessibilityLabel={isLoved ? 'Remove restaurant from Love It' : 'Add restaurant to Love It'}
        accessibilityState={{ selected: isLoved }}
      >
        <View style={[styles.actionCircle, styles.actionCircleLove]}>
          <Text style={[styles.actionGlyph, styles.actionGlyphActive]}>{isLoved ? '♥' : '♡'}</Text>
        </View>
        <Text style={[styles.actionLabel, styles.actionLabelLove]}>Love It</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <View style={styles.container}>
        <Swipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          overshootRight={false}
          onSwipeableOpenStartDrag={() => setSlideActive(true)}
          onSwipeableWillOpen={() => {
            setSlideActive(true);
            if (swipeableRef.current) registerSwipeableOpen(swipeableRef.current);
          }}
          onSwipeableClose={() => {
            setSlideActive(false);
            if (swipeableRef.current) unregisterSwipeable(swipeableRef.current);
          }}
          containerStyle={styles.swipeableContainer}
        >
          <View style={[styles.infoCard, slideActive && styles.infoCardSliding]}>
            <View style={styles.restaurantTitleRow}>
              <Text style={[text.restaurantName, styles.restaurantTitle]} numberOfLines={2}>
                {restaurant.restaurant}
              </Text>
              {hasDirections && (
                <Pressable
                  style={styles.mapPinButton}
                  onPress={openDirections}
                  accessibilityRole="button"
                  accessibilityLabel={`Directions to ${restaurant.restaurant}`}
                  hitSlop={8}
                >
                  <View style={styles.mapPin}>
                    <View style={styles.mapPinDot} />
                  </View>
                </Pressable>
              )}
            </View>
            <Text style={text.bodyMuted}>{restaurantLocationLabel(restaurant)}</Text>

            {!!hoursStatus.todayLabel && (
              <Text style={[text.body, hoursStatus.kind === 'open' ? styles.openLabel : styles.closedLabel]}>
                {hoursStatus.todayLabel}
              </Text>
            )}
            {!!serviceLine && <Text style={text.bodyMuted}>{serviceLine}</Text>}
            {!!ratingAverageLabel && (
              <Text style={[text.body, styles.ratingAverage]}>{ratingAverageLabel}</Text>
            )}
          </View>
        </Swipeable>

        <View style={styles.pillRow}>
          {restaurant.accepts_reservations && (
            <Pressable style={styles.pill} onPress={() => openRestaurantInOfficialApp(restaurant)}>
              <ReservationsIcon color={COLORS.ink} />
              <Text style={text.chip}>Reservations</Text>
            </Pressable>
          )}
          {restaurant.has_walkup_list && (
            <Pressable style={styles.pill} onPress={() => openRestaurantInOfficialApp(restaurant)}>
              <WalkUpIcon color={COLORS.ink} />
              <Text style={text.chip}>Walk-up List</Text>
            </Pressable>
          )}
          {hasMobileOrder(restaurant) && (
            <Pressable style={styles.pill} onPress={() => openMobileOrderInOfficialApp(restaurant)}>
              <MobileOrderIcon color={COLORS.ink} />
              <Text style={text.chip}>Mobile Ordering</Text>
            </Pressable>
          )}
          {hasDiningPlan(restaurant) && (
            <Pressable style={styles.pill} onPress={() => onCapabilityPress('diningPlan')}>
              <Text style={text.chip}>Dining Plan</Text>
            </Pressable>
          )}
        </View>
      </View>
      {gotItEvent && (
        <GotItRatingCard
          event={gotItEvent}
          ratingsEnabled={ratingsEnabled}
          onConfirm={async (rating) => {
            await confirmGotIt(gotItEvent.clientId, rating);
            setGotItEvent(null);
          }}
          onUndo={async () => {
            await undoGotIt(gotItEvent.clientId, restaurant.restaurant_id, null);
            setGotItEvent(null);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    paddingBottom: SPACING.lg,
  },
  swipeableContainer: {
    overflow: 'visible',
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  infoCardSliding: {
    backgroundColor: COLORS.goldLight,
    borderTopRightRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
  },
  restaurantTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  restaurantTitle: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: 27,
  },
  mapPinButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPin: {
    width: 19,
    height: 24,
    borderWidth: 2,
    borderColor: COLORS.pine,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.pine,
    transform: [{ rotate: '-45deg' }],
  },
  openLabel: {
    color: COLORS.pine,
    marginTop: SPACING.xs,
  },
  closedLabel: {
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  ratingAverage: {
    color: COLORS.gold,
    marginTop: SPACING.xs,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  actionButton: {
    width: 50,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.border,
  },
  actionCircleLove: {
    backgroundColor: '#D128D6',
  },
  actionCircleNeed: {
    backgroundColor: '#596BEF',
  },
  actionCircleGot: {
    backgroundColor: '#C78514',
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
  actionLabelNeed: {
    color: '#596BEF',
  },
  actionLabelGot: {
    color: '#C78514',
  },
  actionLabelLove: {
    color: '#D128D6',
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
