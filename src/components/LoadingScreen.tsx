import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

export function LoadingScreen({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <Text style={[text.greeting, styles.title]}>Rumbly</Text>
      <ActivityIndicator color={COLORS.gold} size="large" style={styles.spinner} />
      <Text style={text.bodyMuted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  title: {
    marginBottom: SPACING.lg,
  },
  spinner: {
    marginBottom: SPACING.lg,
  },
});
