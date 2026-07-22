import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../../theme/tokens';
import { FONT_FAMILY } from '../../theme/typography';

export function SettingsScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: FONT_FAMILY.interRegular, fontSize: 34, lineHeight: 36, color: COLORS.forest },
  title: { flex: 1, fontFamily: FONT_FAMILY.interSemiBold, fontSize: 22, lineHeight: 27, color: COLORS.ink },
});
