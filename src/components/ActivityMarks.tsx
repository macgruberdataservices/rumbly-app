import { StyleSheet, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { DAYLIGHT } from '../theme/tokens';

export type ActivityMarkKind = 'needIt' | 'gotIt' | 'loveIt';

const ACTIVE_NAMES: Record<ActivityMarkKind, SymbolViewProps['name']> = {
  needIt: { ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' },
  gotIt: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  loveIt: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
};

const INACTIVE_NAMES: Record<ActivityMarkKind, SymbolViewProps['name']> = {
  needIt: { ios: 'bookmark', android: 'bookmark_border', web: 'bookmark_border' },
  gotIt: { ios: 'checkmark.circle', android: 'check_circle_outline', web: 'check_circle_outline' },
  loveIt: { ios: 'heart', android: 'favorite_border', web: 'favorite_border' },
};

const MARK_COLORS: Record<ActivityMarkKind, string> = {
  needIt: DAYLIGHT.ocean,
  gotIt: DAYLIGHT.amberInk,
  loveIt: DAYLIGHT.coral,
};

export function ActivitySymbol({
  kind,
  active = true,
  size = 12,
  tintColor = MARK_COLORS[kind],
}: {
  kind: ActivityMarkKind;
  active?: boolean;
  size?: number;
  tintColor?: string;
}) {
  return (
    <SymbolView
      name={(active ? ACTIVE_NAMES : INACTIVE_NAMES)[kind]}
      size={size}
      tintColor={tintColor}
      weight="semibold"
      style={{ width: size, height: size }}
    />
  );
}

export function ActivityMarks({
  isNeeded,
  hasGotIt,
  isLoved,
}: {
  isNeeded: boolean;
  hasGotIt: boolean;
  isLoved: boolean;
}) {
  const labels = [isNeeded && 'Need It', hasGotIt && 'Got It', isLoved && 'Love It'].filter(Boolean);
  if (labels.length === 0) return null;

  return (
    <View
      style={styles.row}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {isNeeded && <ActivitySymbol kind="needIt" />}
      {hasGotIt && <ActivitySymbol kind="gotIt" />}
      {isLoved && <ActivitySymbol kind="loveIt" />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 14,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
