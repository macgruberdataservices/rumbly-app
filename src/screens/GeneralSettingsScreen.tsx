import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { useDataProvider } from '../hooks/useDataProvider';
import { useAppSettings } from '../hooks/useAppSettings';
import { useEntitlements } from '../hooks/useEntitlements';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'GeneralSettings'>;

const APP_VERSION = Constants.expoConfig?.version ?? '—';

export function GeneralSettingsScreen({ navigation }: Props) {
  const { isLoading, lastSyncedAt, forceRefresh } = useDataProvider();
  const {
    allAllergyInSearch,
    setAllAllergyInSearch,
    findFeedEnabled,
    setFindFeedEnabled,
    findFeedContentMode,
    setFindFeedContentMode,
    nativeInteractionsEnabled,
    setNativeInteractionsEnabled,
  } = useAppSettings();
  const { isEnabled: isEntitled } = useEntitlements();
  const isContentAdmin = isEntitled('content_admin');

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
            onValueChange={setAllAllergyInSearch}
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

        {isContentAdmin && (
          <View style={[styles.settingRow, styles.previewSettingRow]}>
            <View style={styles.settingRowText}>
              <Text style={text.body}>Preview Unpublished Content</Text>
              <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
                Show draft, review, inactive, scheduled, and archived cards with clear preview
                labels. Leave this off to experience the feed exactly as a normal user.
              </Text>
            </View>
            <Switch
              value={findFeedContentMode === 'preview'}
              onValueChange={(enabled) => setFindFeedContentMode(enabled ? 'preview' : 'live')}
              trackColor={{ true: COLORS.gold }}
            />
          </View>
        )}

        <Text style={[styles.sectionLabel, styles.experimentsSectionLabel]}>EXPERIMENTS</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingRowText}>
            <Text style={text.body}>Use Native Interactions</Text>
            <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
              Opt into converted Expo UI surfaces as they are staged. Turn this off at any
              time to return immediately to the preserved classic implementation.
            </Text>
          </View>
          <Switch
            value={nativeInteractionsEnabled}
            onValueChange={setNativeInteractionsEnabled}
            trackColor={{ true: COLORS.forest }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Native UI Lab"
          onPress={() => navigation.navigate('NativeUiLab')}
          style={({ pressed }) => [styles.labRow, pressed && styles.labRowPressed]}
        >
          <View style={styles.settingRowText}>
            <Text style={text.body}>Native UI Lab</Text>
            <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
              Isolated Expo UI prototypes for native preview, swipe, sheet, and
              edge-to-edge scrolling. Production interactions stay unchanged.
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Text style={styles.versionText}>App version {APP_VERSION}</Text>
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
  dietarySectionLabel: { marginTop: SPACING.xl },
  findSectionLabel: { marginTop: SPACING.xl },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  settingRowText: { flex: 1 },
  settingRowSubtitle: { marginTop: SPACING.xs },
  previewSettingRow: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  experimentsSectionLabel: { marginTop: SPACING.xl },
  labRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.cream,
    marginTop: SPACING.lg,
  },
  labRowPressed: { backgroundColor: COLORS.goldLight },
  chevron: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 27,
    color: COLORS.dim,
  },
  versionText: {
    ...text.bodyMuted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
