import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant } from '../../data/types';
import { restaurantLocationLabel } from '../../data/locationNames';
import type { HoursStatus } from '../../data/hoursStatus';
import type { CapabilityKind } from './CapabilityDetailSheet';
import { useActivity } from '../../hooks/useActivity';
import { useEntitlement } from '../../hooks/useEntitlement';
import { GotItRatingCard, type GotItCardEvent, type GotItCardOrigin } from '../GotItRatingCard';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

function priceLabel(r: Restaurant): string {
  return r.price_tier_display || (r.price_tier ? '$'.repeat(r.price_tier) : '');
}

function hasDiningPlan(r: Restaurant): boolean {
  return r.raw_facets.some((f) => f.group === 'diningPlan');
}

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

  const { lovedIds, gotItRestaurantCounts, toggleLove, addRestaurantGotIt, confirmGotIt, undoGotIt } = useActivity();
  const gotItEnabled = useEntitlement('got_it');
  const ratingsEnabled = useEntitlement('ratings');
  const isLoved = lovedIds.has(restaurant.restaurant_id);
  const gotItCount = gotItRestaurantCounts.get(restaurant.restaurant_id) ?? 0;
  const gotItButtonRef = useRef<View>(null);
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);

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
  };

  return (
    <>
      <View style={styles.container}>
        <Text style={text.restaurantName} numberOfLines={2}>
          {restaurant.restaurant}
        </Text>
        <Text style={text.bodyMuted}>{restaurantLocationLabel(restaurant)}</Text>

        {!!hoursStatus.todayLabel && (
          <Text style={[text.body, hoursStatus.kind === 'open' ? styles.openLabel : styles.closedLabel]}>
            {hoursStatus.todayLabel}
          </Text>
        )}
        {!!serviceLine && <Text style={text.bodyMuted}>{serviceLine}</Text>}

        <View style={styles.pillRow}>
          {restaurant.accepts_reservations && (
            <Pressable style={styles.pill} onPress={() => onCapabilityPress('reservations')}>
              <Text style={text.chip}>Reservations</Text>
            </Pressable>
          )}
          {restaurant.has_walkup_list && (
            <Pressable style={styles.pill} onPress={() => onCapabilityPress('walkup')}>
              <Text style={text.chip}>Walk-up List</Text>
            </Pressable>
          )}
          {hasDiningPlan(restaurant) && (
            <Pressable style={styles.pill} onPress={() => onCapabilityPress('diningPlan')}>
              <Text style={text.chip}>Dining Plan</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.actionRow}>
          {hasDirections && (
            <Pressable
              style={styles.action}
              onPress={() => {
                const url =
                  Platform.select({
                    ios: `maps://?daddr=${restaurant.lat},${restaurant.lng}`,
                    default: `geo:${restaurant.lat},${restaurant.lng}?q=${restaurant.lat},${restaurant.lng}`,
                  }) ?? '';
                Linking.openURL(url);
              }}
            >
              <Text style={text.buttonLabel}>Directions</Text>
            </Pressable>
          )}
          <Pressable style={styles.action} onPress={() => toggleLove(restaurant.restaurant_id)}>
            <Text style={[text.buttonLabel, isLoved && styles.actionActiveText]}>
              {isLoved ? 'Loved' : 'Love'}
            </Text>
          </Pressable>
          {gotItEnabled && (
            <Pressable ref={gotItButtonRef} style={styles.action} onPress={openGotItCard}>
              <Text style={[text.buttonLabel, gotItCount > 0 && styles.actionActiveText]}>
                Got It{gotItCount > 0 ? ` · ${gotItCount}` : ''}
              </Text>
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
    padding: SPACING.lg,
  },
  openLabel: {
    color: COLORS.pine,
    marginTop: SPACING.xs,
  },
  closedLabel: {
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  pill: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  action: {
    paddingVertical: SPACING.xs,
  },
  actionActiveText: {
    color: COLORS.pine,
  },
});
