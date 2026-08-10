import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

export function SettingsRow({
  title,
  subtitle,
  destructive = false,
  onPress,
}: {
  title: string;
  subtitle?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, destructive && styles.destructive]}>{title}</Text>
        {!!subtitle && <Text style={text.bodyMuted}>{subtitle}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  rowPressed: { backgroundColor: DAYLIGHT.sky },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 17, color: COLORS.ink },
  destructive: { color: DAYLIGHT.coral },
  chevron: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 27, color: DAYLIGHT.ocean, marginLeft: SPACING.md },
});
