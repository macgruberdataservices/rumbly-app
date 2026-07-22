import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY } from '../../theme/typography';

export function SettingsSubmitButton({
  title,
  submitting,
  disabled,
  onPress,
}: {
  title: string;
  submitting: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || submitting }}
      disabled={disabled || submitting}
      style={[styles.button, (disabled || submitting) && styles.disabled]}
      onPress={onPress}
    >
      {submitting ? (
        <ActivityIndicator color={COLORS.surface} />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    backgroundColor: COLORS.pine,
    paddingHorizontal: SPACING.lg,
  },
  disabled: { opacity: 0.5 },
  label: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 14, color: COLORS.surface },
});
