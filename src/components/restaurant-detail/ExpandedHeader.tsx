import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant } from '../../data/types';
import type { HoursStatus } from '../../data/hoursStatus';
import type { CapabilityKind } from './CapabilityDetailSheet';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

function locationLine(r: Restaurant): string {
  return r.resort ?? r.area ?? r.park ?? '';
}

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

  return (
    <View style={styles.container}>
      <Text style={text.restaurantName} numberOfLines={2}>
        {restaurant.restaurant}
      </Text>
      <Text style={text.bodyMuted}>{locationLine(restaurant)}</Text>

      <Text style={[text.body, hoursStatus.kind === 'open' ? styles.openLabel : styles.closedLabel]}>
        {hoursStatus.label}
      </Text>
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
        {/* Inert until Milestone 4's local activity store wires these up. */}
        <View style={[styles.action, styles.actionInert]}>
          <Text style={[text.buttonLabel, styles.inertText]}>Favorite</Text>
        </View>
        <View style={[styles.action, styles.actionInert]}>
          <Text style={[text.buttonLabel, styles.inertText]}>Check In</Text>
        </View>
      </View>
    </View>
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
  actionInert: {
    opacity: 0.4,
  },
  inertText: {
    color: COLORS.muted,
  },
});
