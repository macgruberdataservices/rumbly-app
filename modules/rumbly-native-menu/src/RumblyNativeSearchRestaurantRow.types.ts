import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import type { NativeMenuAction } from './RumblyNativeMenu.types';

export interface NativeSearchRestaurantRow {
  restaurantId: string;
  name: string;
  meta: string;
  highlightQuery: string | null;
  isNeeded: boolean;
  isLoved: boolean;
  gotItCount: number;
  needItEnabled: boolean;
  gotItEnabled: boolean;
}

export interface RumblyNativeSearchRestaurantRowViewProps extends ViewProps {
  row: NativeSearchRestaurantRow;
  onAction?: (
    event: NativeSyntheticEvent<{
      action: NativeMenuAction;
      restaurantId: string;
    }>
  ) => void;
}
