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
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<SettingsStackParamList, 'GeneralSettings'>;

const APP_VERSION = Constants.expoConfig?.version ?? '—';

export function GeneralSettingsScreen({ navigation }: Props) {
  const { isLoading, lastSyncedAt, forceRefresh } = useDataProvider();
  const {
    allAllergyInSearch,
    setAllAllergyInSearch,
    showAllergyFriendlyMenuItems,
    setShowAllergyFriendlyMenuItems,
    allergyAcknowledgedThisSession,
    acknowledgeAllergyDisclaimer,
    findFeedEnabled,
    setFindFeedEnabled,
  } = useAppSettings();
  const [allergyAcknowledgementVisible, setAllergyAcknowledgementVisible] = useState(false);
  // Both allergy toggles below share one disclaimer sheet -- same hedge
  // language, same "confirm with a Cast Member" concern either way.
  // Tracks which toggle actually asked for it, so onAccept enables the
  // right one instead of always defaulting to search.
  const [pendingAllergyToggle, setPendingAllergyToggle] = useState<'search' | 'menu' | null>(null);

  const handleAllAllergyChange = (value: boolean) => {
    if (!value) {
      setAllAllergyInSearch(false);
      return;
    }
    if (allergyAcknowledgedThisSession) {
      setAllAllergyInSearch(true);
      return;
    }
    setPendingAllergyToggle('search');
    setAllergyAcknowledgementVisible(true);
  };

  const handleShowAllergyMenuItemsChange = (value: boolean) => {
    if (!value) {
      setShowAllergyFriendlyMenuItems(false);
      return;
    }
    if (allergyAcknowledgedThisSession) {
      setShowAllergyFriendlyMenuItems(true);
      return;
    }
    setPendingAllergyToggle('menu');
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

        <View style={[styles.settingRow, styles.settingRowSpaced]}>
          <View style={styles.settingRowText}>
            <Text style={text.body}>Show Allergy Friendly Menu Items</Text>
            <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
              On by default. A restaurant's own menu already shows regular items with an "allergy
              option available" note rather than a separate row, so this only ever matters for the rare
              menu made up entirely of allergy-friendly items with no regular version -- turn this off
              if you'd rather see an empty menu there instead.
            </Text>
          </View>
          <Switch
            value={showAllergyFriendlyMenuItems}
            onValueChange={handleShowAllergyMenuItemsChange}
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
          if (pendingAllergyToggle === 'menu') {
            setShowAllergyFriendlyMenuItems(true);
          } else if (pendingAllergyToggle === 'search') {
            setAllAllergyInSearch(true);
          }
          setPendingAllergyToggle(null);
        }}
        onCancel={() => {
          setAllergyAcknowledgementVisible(false);
          setPendingAllergyToggle(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
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
    padding: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: '#FFFFFF',
  },
  settingRowText: { flex: 1 },
  settingRowSubtitle: { marginTop: SPACING.xs },
  settingRowSpaced: { marginTop: SPACING.lg },
  versionText: {
    ...text.bodyMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
