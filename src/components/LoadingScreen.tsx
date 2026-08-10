import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { COLORS, DAYLIGHT, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

export function LoadingScreen({ label }: { label: string }) {
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowProgress(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/myrumbly-splash-lockup.png')}
        style={styles.lockup}
        resizeMode="contain"
        accessibilityLabel="myRumbly, Unofficial Disney Food Companion"
      />
      {showProgress && (
        <View style={styles.progress}>
          <ActivityIndicator color={COLORS.gold} size="large" style={styles.spinner} />
          <Text style={text.bodyMuted}>{label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DAYLIGHT.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  lockup: {
    width: 320,
    height: 124,
  },
  progress: {
    position: 'absolute',
    top: '50%',
    marginTop: 92,
    alignItems: 'center',
  },
  spinner: {
    marginBottom: SPACING.lg,
  },
});
