import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

// Placeholder for Phase 3/4 (account memory + companion): favorites,
// want-to-try, ratings, check-ins, stats, badges, settings. Deliberately
// minimal per owner direction — pre-launch, no live users.
export function MyRumblyHomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={text.sectionTitle}>My Rumbly</Text>
      <Text style={[text.bodyMuted, styles.subtitle]}>
        Favorites, ratings, check-ins, and your stats are coming in a later phase.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
  },
  subtitle: {
    marginTop: SPACING.sm,
  },
});
