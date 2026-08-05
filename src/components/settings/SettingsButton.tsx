import { Image, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '../../theme/tokens';

// Shared across every top-level tab screen (Find, Explore, My Rumbly) so
// account settings stay reachable from wherever a user actually is,
// instead of only from My Rumbly's own home screen.
export function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open account settings"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={onPress}
    >
      <Image
        source={require('../../../assets/settings-icon.png')}
        style={styles.icon}
        resizeMode="contain"
        tintColor={COLORS.forest}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  buttonPressed: { backgroundColor: COLORS.goldLight },
  icon: { width: 26, height: 26 },
});
