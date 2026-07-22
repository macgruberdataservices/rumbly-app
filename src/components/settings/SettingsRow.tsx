import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../../theme/tokens';
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowPressed: { backgroundColor: COLORS.goldLight },
  copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 17, color: COLORS.ink },
  destructive: { color: COLORS.gold },
  chevron: { fontFamily: FONT_FAMILY.interRegular, fontSize: 27, color: COLORS.dim, marginLeft: SPACING.md },
});
