import { useMemo } from 'react';
import { requireNativeViewManager } from 'expo-modules-core';
import type {
  RumblyNativeSearchItemRowViewProps,
} from './RumblyNativeSearchItemRow.types';

type NativeProps = Omit<RumblyNativeSearchItemRowViewProps, 'row'> & {
  rowJSON: string;
};

const NativeView =
  requireNativeViewManager<NativeProps>('RumblyNativeSearchItemRow');

export function RumblyNativeSearchItemRowView({
  row,
  ...props
}: RumblyNativeSearchItemRowViewProps) {
  const rowJSON = useMemo(() => JSON.stringify(row), [row]);
  return <NativeView rowJSON={rowJSON} {...props} />;
}

export type {
  NativeSearchItemRow,
  RumblyNativeSearchItemRowViewProps,
} from './RumblyNativeSearchItemRow.types';
