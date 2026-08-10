import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NearMeStatus } from '../data/nearMeProvider';
import { COLORS } from '../theme/tokens';

interface Props {
  active: boolean;
  status: NearMeStatus;
  onPress: () => void;
  accentColor?: string;
  borderColor?: string;
}

function NearMePulse({ active, color }: { active: boolean; color: string }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    ring1.setValue(0);
    ring2.setValue(0);
    const pulse = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const loop1 = pulse(ring1, 0);
    const loop2 = pulse(ring2, 800);
    loop1.start();
    loop2.start();
    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, [active, ring1, ring2]);

  if (!active) return null;

  const ringStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
  });

  return (
    <View style={styles.pulseWrap} pointerEvents="none">
      <Animated.View style={[styles.pulseRing, { backgroundColor: color }, ringStyle(ring1)]} />
      <Animated.View style={[styles.pulseRing, { backgroundColor: color }, ringStyle(ring2)]} />
    </View>
  );
}

export function NearMeButton({
  active,
  status,
  onPress,
  accentColor = COLORS.forest,
  borderColor = COLORS.border,
}: Props) {
  const requesting = status === 'requesting';
  return (
    <View style={styles.shell}>
      <NearMePulse active={active && !requesting} color={COLORS.gold} />
      <Pressable
        disabled={requesting}
        onPress={onPress}
        accessibilityLabel={active ? 'Turn off Near Me' : 'Show dining near me'}
        accessibilityHint="Uses foreground location and Disney guest entrance coordinates"
        accessibilityRole="button"
        accessibilityState={{ selected: active, busy: requesting, disabled: requesting }}
        style={[
          styles.button,
          { borderColor },
          active && { backgroundColor: accentColor, borderColor: accentColor },
          requesting && styles.buttonBusy,
        ]}
      >
        {requesting ? (
          <ActivityIndicator color={accentColor} />
        ) : (
          <Image
            source={require('../../assets/nearby-icon.png')}
            style={styles.icon}
            resizeMode="contain"
            tintColor={active ? COLORS.surface : accentColor}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { alignItems: 'center', justifyContent: 'center' },
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  buttonBusy: { opacity: 0.7 },
  icon: { width: 26, height: 26 },
  pulseWrap: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
});
