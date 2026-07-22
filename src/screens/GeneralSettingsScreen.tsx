import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { useDataProvider } from '../hooks/useDataProvider';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'GeneralSettings'>;

export function GeneralSettingsScreen({ navigation }: Props) {
  const { isLoading, lastSyncedAt, forceRefresh } = useDataProvider();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="General" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>DINING DATA</Text>
        <Text style={[text.bodyMuted, styles.supportingText]}>
          Restaurant and menu data refreshes automatically once a day. Check now if something looks out of date.
        </Text>
        <View style={styles.syncWrapper}>
          <SyncStatusBar lastSyncedAt={lastSyncedAt} isLoading={isLoading} onRefresh={forceRefresh} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionLabel: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  supportingText: { marginBottom: SPACING.md },
  syncWrapper: { marginHorizontal: -SPACING.lg },
});
