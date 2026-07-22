import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY } from '../../theme/typography';

export function SettingsFormField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={COLORS.muted}
        accessibilityLabel={props.accessibilityLabel ?? label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: SPACING.lg },
  label: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: SPACING.xs,
  },
  input: {
    minHeight: 46,
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 15,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
});
