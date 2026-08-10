import { Image, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '../../theme/tokens';

type SettingsButtonProps = {
  onPress: () => void;
  /** Icon tint. Defaults to COLORS.forest, which is correct for every
   * current call site (Find/Explore/My Rumbly all have a light header). A
   * colored hero band needs to pass a light tint explicitly -- see
   * ExploreHomeScreen for the first example. */
  tintColor?: string;
  /** Pressed-state fill. Defaults to COLORS.goldLight, tuned for a light
   * header; a colored band should pass something translucent instead. */
  pressedBackgroundColor?: string;
};

// Shared across every top-level tab screen (Find, Explore, My Rumbly) so
// account settings stay reachable from wherever a user actually is,
// instead of only from My Rumbly's own home screen.
export function SettingsButton({ onPress, tintColor = COLORS.forest, pressedBackgroundColor = COLORS.goldLight }: SettingsButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open account settings"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && { backgroundColor: pressedBackgroundColor }]}
      onPress={onPress}
    >
      <Image
        source={require('../../../assets/settings-icon.png')}
        style={styles.icon}
        resizeMode="contain"
        tintColor={tintColor}
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
  icon: { width: 26, height: 26 },
});
