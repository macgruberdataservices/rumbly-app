import { forwardRef } from 'react';
import { View } from 'react-native';
import type { Restaurant } from '../../data/types';

export interface NativeRestaurantResultRowProps {
  restaurant: Restaurant;
  highlightQuery?: string;
  distanceMiles?: number | null;
  onPress: () => void;
}

// Android and switch-off paths retain the classic RestaurantCard. This
// platform-neutral stub keeps TypeScript and Metro resolution predictable.
export const NativeRestaurantResultRow = forwardRef<
  View,
  NativeRestaurantResultRowProps
>(function NativeRestaurantResultRow() {
  return null;
});
