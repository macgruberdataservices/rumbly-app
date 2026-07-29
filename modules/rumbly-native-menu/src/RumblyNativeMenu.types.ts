import type {
  NativeSyntheticEvent,
  ViewProps,
} from 'react-native';

export interface NativeMenuItem {
  anchorId: string;
  itemId: string;
  name: string;
  description: string | null;
  price: string;
  isNew: boolean;
  rating: string | null;
  isNeeded: boolean;
  isLoved: boolean;
  gotItCount: number;
  needItEnabled: boolean;
  gotItEnabled: boolean;
  journalEnabled: boolean;
}

export interface NativeMenuSection {
  title: string;
  items: NativeMenuItem[];
}

export type NativeMenuAction =
  | 'open'
  | 'share'
  | 'journal'
  | 'needIt'
  | 'gotIt'
  | 'loveIt';

export interface RumblyNativeMenuViewRef {
  scrollToCategory(category: string): Promise<void>;
  scrollToItem(itemId: string, category: string): Promise<void>;
}

export interface RumblyNativeMenuViewProps extends ViewProps {
  sections: NativeMenuSection[];
  targetAnchorId?: string | null;
  highlightedItemId?: string | null;
  bottomInset?: number;
  onAction?: (
    event: NativeSyntheticEvent<{
      action: NativeMenuAction;
      itemId: string;
      anchorId?: string;
    }>
  ) => void;
  onActiveCategoryChange?: (
    event: NativeSyntheticEvent<{ category: string }>
  ) => void;
  onScrollOffsetChange?: (
    event: NativeSyntheticEvent<{ offsetY: number }>
  ) => void;
  onReady?: () => void;
}
