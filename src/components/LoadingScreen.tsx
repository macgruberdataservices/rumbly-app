import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, DAYLIGHT, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

export function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <Text style={[text.brandWordmarkDark, styles.title]}>
        myRumbly<Text style={styles.wordmarkMark}>✦</Text>
      </Text>
      <Text style={[text.bodyMuted, styles.subtitle]}>Unofficial Disney Food Companion</Text>
      <ActivityIndicator color={COLORS.gold} size="large" style={styles.spinner} />
      <Text style={text.bodyMuted}>{label}</Text>
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
  title: {
    fontSize: 38,
    lineHeight: 48,
    color: DAYLIGHT.ocean,
    marginBottom: SPACING.xs,
  },
  wordmarkMark: {
    color: DAYLIGHT.coral,
    fontSize: 19,
  },
  subtitle: {
    color: DAYLIGHT.muted,
    letterSpacing: 0.35,
    marginBottom: SPACING.xl,
  },
  spinner: {
    marginBottom: SPACING.lg,
  },
});
