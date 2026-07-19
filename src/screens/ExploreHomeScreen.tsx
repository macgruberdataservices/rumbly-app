import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

// Placeholder for Phase 4 (Food Companion): curated crawls, progressive
// meals, must-try lists, challenges, recommendations. Deliberately minimal
// per owner direction — pre-launch, no live users, stub destinations are
// fine until their phase lands.
export function ExploreHomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={text.sectionTitle}>Explore</Text>
      <Text style={[text.bodyMuted, styles.subtitle]}>
        Curated crawls, must-try lists, and challenges are coming in a later phase.
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
