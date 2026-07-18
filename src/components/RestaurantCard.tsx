import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Restaurant } from '../data/types';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

function priceDots(tier: number | null): string {
  if (!tier) return '';
  return '$'.repeat(tier);
}

function locationLabel(r: Restaurant): string {
  if (r.resort) return r.resort;
  if (r.area) return r.area;
  return r.park ?? '';
}

export function RestaurantCard({ restaurant, onPress }: { restaurant: Restaurant; onPress: () => void }) {
  const metaParts = [locationLabel(restaurant), priceDots(restaurant.price_tier), restaurant.experience_type].filter(
    Boolean
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={text.restaurantName}>{restaurant.restaurant}</Text>
      {metaParts.length > 0 && (
        <Text style={[text.bodyMuted, styles.meta]}>{metaParts.join(' · ')}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  cardPressed: {
    opacity: 0.6,
  },
  meta: {
    marginTop: 2,
  },
});
