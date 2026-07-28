import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import type { NativeMenuPilotRouteParams } from '../navigation/browseTypes';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

export function NativeMenuPilotContent({
  navigation,
}: {
  route: { params: NativeMenuPilotRouteParams };
  navigation: { goBack: () => void };
}) {
  return (
    <SafeAreaView style={styles.container}>
      <SettingsScreenHeader title="Native Menu Pilot" onBack={navigation.goBack} />
      <View style={styles.message}>
        <Text style={text.sectionTitle}>iOS-only pilot</Text>
        <Text style={text.bodyMuted}>
          This native menu-list prototype is currently available on iOS.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  message: { padding: SPACING.lg, gap: SPACING.sm },
});
