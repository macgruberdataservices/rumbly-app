import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY } from '../../theme/typography';

export function SettingsSubmitButton({
  title,
  submitting,
  disabled,
  destructive = false,
  onPress,
}: {
  title: string;
  submitting: boolean;
  disabled: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  const indicatorColor = destructive ? COLORS.ink : COLORS.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || submitting }}
      disabled={disabled || submitting}
      style={[styles.button, destructive && styles.destructive, (disabled || submitting) && styles.disabled]}
      onPress={onPress}
    >
      {submitting ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        <Text style={[styles.label, destructive && styles.destructiveLabel]}>{title}</Text>
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
  // Matches SettingsRow's `destructive` convention -- this app's palette has
  // no red, so gold is the destructive/warning color throughout Settings.
  destructive: { backgroundColor: COLORS.gold },
  disabled: { opacity: 0.5 },
  label: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 14, color: COLORS.surface },
  destructiveLabel: { color: COLORS.ink },
});
