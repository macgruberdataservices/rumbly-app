import { forwardRef, useImperativeHandle } from 'react';
import type { MenuItem } from '../../data/types';

export interface NativeRestaurantMenuSection {
  title: string;
  data: MenuItem[];
}

export interface NativeRestaurantMenuRef {
  scrollToCategory(category: string): Promise<void>;
  scrollToItem(itemId: string): Promise<void>;
}

export interface NativeRestaurantMenuProps {
  sections: NativeRestaurantMenuSection[];
  highlightedItemId: string | null;
  bottomInset: number;
  onActiveCategoryChange: (category: string) => void;
  onScrollOffsetChange: (offsetY: number) => void;
}

export const NativeRestaurantMenu = forwardRef<
  NativeRestaurantMenuRef,
  NativeRestaurantMenuProps
>(function NativeRestaurantMenu(_props, forwardedRef) {
  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToCategory: () => Promise.resolve(),
      scrollToItem: () => Promise.resolve(),
    }),
    []
  );
  return null;
});
