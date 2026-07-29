import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import type { NativeMenuAction } from './RumblyNativeMenu.types';

export interface NativeSearchItemRow {
  itemId: string;
  name: string;
  restaurant: string;
  meta: string;
  price: string;
  rating: string | null;
  highlightQuery: string | null;
  isNew: boolean;
  isNeeded: boolean;
  isLoved: boolean;
  gotItCount: number;
  needItEnabled: boolean;
  gotItEnabled: boolean;
}

export interface RumblyNativeSearchItemRowViewProps extends ViewProps {
  row: NativeSearchItemRow;
  onAction?: (
    event: NativeSyntheticEvent<{
      action: NativeMenuAction;
      itemId: string;
    }>
  ) => void;
}
