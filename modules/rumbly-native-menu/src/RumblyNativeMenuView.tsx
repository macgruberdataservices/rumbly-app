import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from 'react';
import { requireNativeViewManager } from 'expo-modules-core';
import type {
  RumblyNativeMenuViewProps,
  RumblyNativeMenuViewRef,
} from './RumblyNativeMenu.types';

type NativeProps = Omit<RumblyNativeMenuViewProps, 'sections'> & {
  menuJSON: string;
  ref?: Ref<NativeRef>;
};

interface NativeRef {
  scrollToCategory(category: string): Promise<void>;
  scrollToItem(itemId: string): Promise<void>;
}

const NativeView = requireNativeViewManager<NativeProps>('RumblyNativeMenu');

export const RumblyNativeMenuView = forwardRef<
  RumblyNativeMenuViewRef,
  RumblyNativeMenuViewProps
>(function RumblyNativeMenuView({ sections, ...props }, forwardedRef) {
  const nativeRef = useRef<NativeRef>(null);
  const menuJSON = useMemo(() => JSON.stringify(sections), [sections]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToCategory: (category) =>
        nativeRef.current?.scrollToCategory(category) ?? Promise.resolve(),
      scrollToItem: (itemId) =>
        nativeRef.current?.scrollToItem(itemId) ?? Promise.resolve(),
    }),
    []
  );

  return <NativeView ref={nativeRef} menuJSON={menuJSON} {...props} />;
});

export type {
  NativeMenuAction,
  NativeMenuItem,
  NativeMenuSection,
  RumblyNativeMenuViewProps,
  RumblyNativeMenuViewRef,
} from './RumblyNativeMenu.types';
