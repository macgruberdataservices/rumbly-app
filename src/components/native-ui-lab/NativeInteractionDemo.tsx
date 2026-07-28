import { StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

export function NativeInteractionDemo({ onEvent }: { onEvent: (message: string) => void }) {
  return (
    <View style={styles.fallback}>
      <Text style={text.body}>
        Native interaction previews are available on iOS and Android.
      </Text>
      <Text style={text.bodyMuted} onPress={() => onEvent('Web fallback tapped')}>
        Use a device or simulator to test SwiftUI and Jetpack Compose.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.cream,
  },
});
