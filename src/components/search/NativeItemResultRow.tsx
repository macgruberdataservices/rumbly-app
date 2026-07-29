import { forwardRef } from 'react';
import { View } from 'react-native';
import type { Restaurant, SearchIndexEntry } from '../../data/types';

export interface NativeItemResultRowProps {
  item: SearchIndexEntry;
  restaurant: Restaurant;
  highlightQuery?: string;
  distanceMiles?: number | null;
  onPress: () => void;
}

// Android and switch-off paths never render this component. Keeping a
// platform-neutral module lets TypeScript and Metro resolve the import while
// the existing React Native result row remains the Android implementation.
export const NativeItemResultRow = forwardRef<View, NativeItemResultRowProps>(
  function NativeItemResultRow() {
    return null;
  }
);
