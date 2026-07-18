import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

function formatRelative(timestampMs: number | null): string {
  if (timestampMs === null) return 'never synced';
  const diffMs = Date.now() - timestampMs;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function SyncStatusBar({
  lastSyncedAt,
  isLoading,
  onRefresh,
}: {
  lastSyncedAt: number | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.bar}>
      <Text style={text.bodyMuted}>Last updated {formatRelative(lastSyncedAt)}</Text>
      <Pressable onPress={onRefresh} disabled={isLoading} hitSlop={8}>
        <Text style={[text.buttonLabel, isLoading && styles.disabled]}>
          {isLoading ? 'Checking…' : 'Refresh'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.goldLight,
    borderRadius: RADII.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  disabled: {
    opacity: 0.5,
  },
});
