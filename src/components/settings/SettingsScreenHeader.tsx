import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
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
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
    borderRadius: 22,
    backgroundColor: DAYLIGHT.paper,
  },
  backIcon: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 34, lineHeight: 36, color: DAYLIGHT.ocean },
  title: { flex: 1, fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 23, lineHeight: 28, color: DAYLIGHT.ink },
});
