import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useJournalComposer } from '../../hooks/useJournalComposer';
import { GotItRatingCard, type GotItCardEvent, type GotItCardOrigin } from '../GotItRatingCard';
import {
  registerSwipeableOpen,
  unregisterSwipeable,
} from '../swipeableCoordinator';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

// COLORS has no true green -- forest/pine both currently resolve to a pale
// blue (see theme/tokens.ts), too low-contrast for "open now," the one
// status on this screen that most benefits from an unambiguous color.
// Scoped locally rather than added to the shared token file, which is out
// of scope for a header layout pass.
const OPEN_STATUS_COLOR = '#3B6D11';

function priceLabel(r: Restaurant): string {
  if (r.price_tier) return '$'.repeat(r.price_tier);
  // price_tier_display carries a full disclaimer clause (e.g. "$$$ ($35 to
  // $59.99 per adult)") -- fine detail for a detail sheet, too dense for
  // the compact header fact line. Only the leading $ glyphs belong here.
  const match = r.price_tier_display?.match(/^\$+/);
  return match ? match[0] : '';
}

function hasDiningPlan(r: Restaurant): boolean {
  return r.raw_facets.some((f) => f.group === 'diningPlan');
}

// Hand-drawn View-shape icons matching RootNavigator.tsx's tab-bar icon
// technique exactly (fixed square frame + 1-2 border-trick children, no
// icon library) -- same scale as the tab bar (22-24px frame) since these
// now render icon-over-label like a tab, not inline-before-text like the
// old pill row.
function DirectionsIcon({ color }: { color: string }) {
  return (
    <View style={actionIconStyles.frame}>
      <View style={[actionIconStyles.pinShape, { borderColor: color }]}>
        <View style={[actionIconStyles.pinDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function JournalIcon({ color }: { color: string }) {
  return (
    <View style={actionIconStyles.frame}>
      <View style={[actionIconStyles.bookCover, { borderColor: color }]} />
      <View style={[actionIconStyles.bookSpine, { backgroundColor: color }]} />
    </View>
  );
}

function ReservationsIcon({ color }: { color: string }) {
  return (
    <View style={actionIconStyles.frame}>
      <View style={[actionIconStyles.clockFace, { borderColor: color }]} />
      <View style={[actionIconStyles.clockHand, { backgroundColor: color }]} />
    </View>
  );
}

function WalkUpIcon({ color }: { color: string }) {
  return (
    <View style={actionIconStyles.frame}>
      <View style={[actionIconStyles.listBar, { backgroundColor: color }]} />
      <View style={[actionIconStyles.listBar, { backgroundColor: color, marginTop: 3 }]} />
      <View style={[actionIconStyles.listBar, { backgroundColor: color, marginTop: 3 }]} />
    </View>
  );
}

function MobileOrderIcon({ color }: { color: string }) {
  return (
    <View style={actionIconStyles.frame}>
      <View style={[actionIconStyles.phoneOutline, { borderColor: color }]} />
      <View style={[actionIconStyles.phoneButton, { backgroundColor: color }]} />
    </View>
  );
}

function DiningPlanIcon({ color }: { color: string }) {
  return (
    <View style={actionIconStyles.frame}>
      <View style={[actionIconStyles.cardShape, { borderColor: color }]} />
      <View style={[actionIconStyles.cardStripe, { backgroundColor: color }]} />
    </View>
  );
}

const actionIconStyles = StyleSheet.create({
  frame: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinShape: {
    width: 14,
    height: 18,
    borderWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    transform: [{ rotate: '-45deg' }],
  },
  bookCover: {
    width: 14,
    height: 17,
    borderWidth: 2,
    borderRadius: 3,
  },
  bookSpine: {
    position: 'absolute',
    width: 2,
    height: 13,
  },
  clockFace: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  clockHand: {
    position: 'absolute',
    width: 2,
    height: 6,
    borderRadius: 1,
    top: 3,
  },
  listBar: {
    width: 15,
    height: 2,
    borderRadius: 1,
  },
  phoneOutline: {
    width: 12,
    height: 19,
    borderRadius: 3,
    borderWidth: 2,
  },
  phoneButton: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    bottom: 3.5,
  },
  cardShape: {
    width: 17,
    height: 13,
    borderRadius: 3,
    borderWidth: 2,
  },
  cardStripe: {
    position: 'absolute',
    width: 11,
    height: 2,
    borderRadius: 1,
    top: 9,
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
  // Service style now lives in the kicker above the name instead of here,
  // so this narrows to just price -- otherwise it'd say "Quick Service"
  // twice on the same header.
  const kicker = restaurant.experience_type || restaurant.service_style;
  const serviceLine = priceLabel(restaurant);

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
  const journalEnabled = useEntitlement('journal');
  const openJournalComposer = useJournalComposer();
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

  // One flat list so the fact line can put a "·" between whichever facts
  // actually exist, rather than hand-wiring a separator before every
  // possible combination of hours/address/service/rating.
  const factSegments: Array<{
    key: string;
    tone: 'open' | 'closed' | 'muted' | 'gold';
    label: string;
    dot?: boolean;
  }> = [];
  if (hoursStatus.todayLabel) {
    factSegments.push({
      key: 'hours',
      tone: hoursStatus.kind === 'open' ? 'open' : 'closed',
      label: hoursStatus.todayLabel,
      dot: true,
    });
  }
  factSegments.push({ key: 'address', tone: 'muted', label: restaurantLocationLabel(restaurant) });
  if (serviceLine) factSegments.push({ key: 'service', tone: 'muted', label: serviceLine });
  if (ratingAverageLabel) factSegments.push({ key: 'rating', tone: 'gold', label: ratingAverageLabel });

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
            {/* Visual-only hint that this card swipes left to reveal Love
                It / Need It / Got It -- there's otherwise zero affordance
                that the gesture exists. */}
            <View style={styles.dragHint} />
            {!!kicker && (
              <Text style={styles.kicker} numberOfLines={1}>
                {kicker.toUpperCase()}
              </Text>
            )}
            <Text style={styles.restaurantTitle} numberOfLines={2}>
              {restaurant.restaurant}
            </Text>
            <View style={styles.factLine}>
              {factSegments.map((segment, index) => (
                <View key={segment.key} style={styles.factGroup}>
                  {index > 0 && <Text style={[styles.factText, styles.factTextMuted]}>·</Text>}
                  {segment.dot && (
                    <View
                      style={[
                        styles.statusDot,
                        segment.tone === 'open' ? styles.statusDotOpen : styles.statusDotClosed,
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.factText,
                      segment.dot && styles.factTextStrong,
                      segment.tone === 'open' && styles.factTextOpen,
                      segment.tone === 'gold' && styles.factTextGold,
                      (segment.tone === 'muted' || segment.tone === 'closed') && styles.factTextMuted,
                    ]}
                  >
                    {segment.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Swipeable>

        <View style={styles.capabilityRowContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.capabilityRow}
          >
            {hasDirections && (
              <Pressable
                style={({ pressed }) => [styles.capabilityTile, pressed && styles.capabilityTilePressed]}
                onPress={openDirections}
                accessibilityRole="button"
                accessibilityLabel={`Directions to ${restaurant.restaurant}`}
              >
                <DirectionsIcon color={COLORS.ink} />
                <Text style={styles.capabilityTileLabel} numberOfLines={1}>Directions</Text>
              </Pressable>
            )}
            {journalEnabled && (
              <Pressable
                style={({ pressed }) => [styles.capabilityTile, pressed && styles.capabilityTilePressed]}
                onPress={() =>
                  openJournalComposer({
                    restaurantId: restaurant.restaurant_id,
                    restaurantNameSnapshot: restaurant.restaurant,
                  })
                }
                accessibilityRole="button"
              >
                <JournalIcon color={COLORS.ink} />
                <Text style={styles.capabilityTileLabel} numberOfLines={1}>Journal</Text>
              </Pressable>
            )}
            {restaurant.accepts_reservations && (
              <Pressable
                style={({ pressed }) => [styles.capabilityTile, pressed && styles.capabilityTilePressed]}
                onPress={() => openRestaurantInOfficialApp(restaurant)}
                accessibilityRole="button"
              >
                <ReservationsIcon color={COLORS.ink} />
                <Text style={styles.capabilityTileLabel} numberOfLines={1}>Reservations</Text>
              </Pressable>
            )}
            {restaurant.has_walkup_list && (
              <Pressable
                style={({ pressed }) => [styles.capabilityTile, pressed && styles.capabilityTilePressed]}
                onPress={() => openRestaurantInOfficialApp(restaurant)}
                accessibilityRole="button"
              >
                <WalkUpIcon color={COLORS.ink} />
                <Text style={styles.capabilityTileLabel} numberOfLines={1}>Walk-up List</Text>
              </Pressable>
            )}
            {hasMobileOrder(restaurant) && (
              <Pressable
                style={({ pressed }) => [styles.capabilityTile, pressed && styles.capabilityTilePressed]}
                onPress={() => openMobileOrderInOfficialApp(restaurant)}
                accessibilityRole="button"
              >
                <MobileOrderIcon color={COLORS.ink} />
                <Text style={styles.capabilityTileLabel} numberOfLines={1}>Mobile Ordering</Text>
              </Pressable>
            )}
            {hasDiningPlan(restaurant) && (
              <Pressable
                style={({ pressed }) => [styles.capabilityTile, pressed && styles.capabilityTilePressed]}
                onPress={() => onCapabilityPress('diningPlan')}
                accessibilityRole="button"
              >
                <DiningPlanIcon color={COLORS.ink} />
                <Text style={styles.capabilityTileLabel} numberOfLines={1}>Dining Plan</Text>
              </Pressable>
            )}
          </ScrollView>
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
  // Tinted background sets this off as one distinct "restaurant info" zone,
  // separate from the capability row below it and from the menu-nav tabs
  // further down -- see capabilityRow's borderTopColor for the boundary on
  // the other side.
  infoCard: {
    backgroundColor: COLORS.goldLight,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  dragHint: {
    position: 'absolute',
    right: 8,
    top: '50%',
    marginTop: -14,
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: COLORS.gold,
    opacity: 0.45,
  },
  infoCardSliding: {
    backgroundColor: COLORS.pineLight,
    borderTopRightRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
  },
  // Kicker (service style, e.g. "QUICK SERVICE") anchors the name with
  // something to lead into it, and the name itself steps up to ExtraBold
  // at a meaningfully bigger size than a generic sectionTitle -- both
  // needed together (owner decision, 2026-08-05): at 22px Bold, this read
  // as just another heading rather than the one name the whole page is
  // about.
  kicker: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: COLORS.forest,
  },
  restaurantTitle: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 32,
    lineHeight: 36,
    color: COLORS.ink,
    marginTop: 2,
  },
  factLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  factGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotOpen: {
    backgroundColor: OPEN_STATUS_COLOR,
  },
  statusDotClosed: {
    backgroundColor: COLORS.dim,
  },
  factText: {
    fontFamily: text.bodyMuted.fontFamily,
    fontSize: 13,
  },
  factTextStrong: {
    fontFamily: text.chip.fontFamily,
  },
  factTextOpen: {
    color: OPEN_STATUS_COLOR,
  },
  factTextMuted: {
    color: COLORS.muted,
  },
  factTextGold: {
    color: COLORS.gold,
  },
  // Border lives on this wrapper, not on the ScrollView's own
  // contentContainerStyle -- content-container width follows the content
  // (however many capability icons this restaurant actually has), so a
  // restaurant with only 3-4 icons left a divider line that stopped
  // partway across the screen instead of spanning full width. Matches
  // CategoryNavigator's own container/content split for the same reason.
  capabilityRowContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  capabilityRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  capabilityTile: {
    alignItems: 'center',
  },
  capabilityTilePressed: {
    opacity: 0.6,
  },
  capabilityTileLabel: {
    marginTop: 2,
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 10.5,
    lineHeight: 13,
    color: COLORS.ink,
    textAlign: 'center',
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
