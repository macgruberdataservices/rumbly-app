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
  addedLabel: string;
  periodCategoryLabel: string;
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
  // Floor under the scrollable content's own height (RN's contentContainerStyle
  // minHeight equivalent) -- a short menu can have less real scrollable content
  // than the host screen's header-collapse animation needs to reach, which
  // leaves the collapse (and the active-category sync below) stuck mid-way
  // forever since scrollY can never physically get there. A floor here, not an
  // addition: it only pads a menu that's actually this short.
  minContentHeight?: number;
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
