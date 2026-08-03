import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { AllergyAcknowledgementSheet } from '../components/AllergyAcknowledgementSheet';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { useDataProvider } from '../hooks/useDataProvider';
import { useAppSettings } from '../hooks/useAppSettings';
import type { SettingsStackParamList } from '../navigation/settingsTypes';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<SettingsStackParamList, 'GeneralSettings'>;

const APP_VERSION = Constants.expoConfig?.version ?? '—';

export function GeneralSettingsScreen({ navigation }: Props) {
  const { isLoading, lastSyncedAt, forceRefresh } = useDataProvider();
  const {
    allAllergyInSearch,
    setAllAllergyInSearch,
    allergyAcknowledgedThisSession,
    acknowledgeAllergyDisclaimer,
    findFeedEnabled,
    setFindFeedEnabled,
  } = useAppSettings();
  const [allergyAcknowledgementVisible, setAllergyAcknowledgementVisible] = useState(false);

  const handleAllAllergyChange = (value: boolean) => {
    if (!value) {
      setAllAllergyInSearch(false);
      return;
    }
    if (allergyAcknowledgedThisSession) {
      setAllAllergyInSearch(true);
      return;
    }
    setAllergyAcknowledgementVisible(true);
  };

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

        <Text style={[styles.sectionLabel, styles.dietarySectionLabel]}>DIETARY</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingRowText}>
            <Text style={text.body}>All Allergy Friendly in Search</Text>
            <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
              Off by default -- Disney's allergy-friendly menu items are hidden from unfiltered search
              results (about 1 in 5 published items) and only appear when you pick a dietary filter in
              Find. Turn this on to include them in every search instead.
            </Text>
          </View>
          <Switch
            value={allAllergyInSearch}
            onValueChange={handleAllAllergyChange}
            trackColor={{ true: COLORS.forest }}
          />
        </View>

        <Text style={[styles.sectionLabel, styles.findSectionLabel]}>FIND</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingRowText}>
            <Text style={text.body}>Personalized Find Feed</Text>
            <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
              Use your Love It and highly rated Got It activity, plus lighter search and viewing
              signals, to choose useful recommendations. Turning this off also stops passive
              recommendation-event collection.
            </Text>
          </View>
          <Switch
            value={findFeedEnabled}
            onValueChange={setFindFeedEnabled}
            trackColor={{ true: COLORS.forest }}
          />
        </View>

        <Text style={styles.versionText}>App version {APP_VERSION}</Text>
      </ScrollView>
      <AllergyAcknowledgementSheet
        visible={allergyAcknowledgementVisible}
        onAccept={() => {
          acknowledgeAllergyDisclaimer();
          setAllergyAcknowledgementVisible(false);
          setAllAllergyInSearch(true);
        }}
        onCancel={() => setAllergyAcknowledgementVisible(false)}
      />
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
  dietarySectionLabel: { marginTop: SPACING.xl },
  findSectionLabel: { marginTop: SPACING.xl },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  settingRowText: { flex: 1 },
  settingRowSubtitle: { marginTop: SPACING.xs },
  versionText: {
    ...text.bodyMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
