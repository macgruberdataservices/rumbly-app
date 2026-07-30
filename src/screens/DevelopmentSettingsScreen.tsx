import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { useAppSettings } from '../hooks/useAppSettings';
import { useEntitlements } from '../hooks/useEntitlements';
import { useIsDevOwner } from '../hooks/useIsDevOwner';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'Development'>;

export function DevelopmentSettingsScreen({ navigation }: Props) {
  const { findFeedContentMode, setFindFeedContentMode, nativeInteractionsEnabled, setNativeInteractionsEnabled } =
    useAppSettings();
  const { isEnabled: isEntitled } = useEntitlements();
  const isContentAdmin = isEntitled('content_admin');
  const isDevOwner = useIsDevOwner();

  useEffect(() => {
    if (!isDevOwner) navigation.goBack();
  }, [isDevOwner, navigation]);

  if (!isDevOwner) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="Development" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {isContentAdmin && (
          <View style={styles.settingRow}>
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

        <View style={[styles.settingRow, styles.nativeInteractionsRow]}>
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

        <View style={styles.sectionBreak} />
        <SettingsRow
          title="Ask Rumbly"
          subtitle="Natural-language menu and restaurant search prototype"
          onPress={() => navigation.navigate('AskRumbly')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingBottom: SPACING.xxl },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  settingRowText: { flex: 1 },
  settingRowSubtitle: { marginTop: SPACING.xs },
  nativeInteractionsRow: { marginTop: SPACING.xl },
  sectionBreak: { height: 10, marginTop: SPACING.xl, marginBottom: SPACING.md, backgroundColor: COLORS.goldLight },
});
