import { useMemo } from 'react';
import { requireNativeViewManager } from 'expo-modules-core';
import type {
  RumblyNativeSearchRestaurantRowViewProps,
} from './RumblyNativeSearchRestaurantRow.types';

type NativeProps = Omit<RumblyNativeSearchRestaurantRowViewProps, 'row'> & {
  rowJSON: string;
};

const NativeView =
  requireNativeViewManager<NativeProps>('RumblyNativeSearchRestaurantRow');

export function RumblyNativeSearchRestaurantRowView({
  row,
  ...props
}: RumblyNativeSearchRestaurantRowViewProps) {
  const rowJSON = useMemo(() => JSON.stringify(row), [row]);
  return <NativeView rowJSON={rowJSON} {...props} />;
}

export type {
  NativeSearchRestaurantRow,
  RumblyNativeSearchRestaurantRowViewProps,
} from './RumblyNativeSearchRestaurantRow.types';
