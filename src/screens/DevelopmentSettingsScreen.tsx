import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsFormField } from '../components/settings/SettingsFormField';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { useAppSettings } from '../hooks/useAppSettings';
import { useEntitlements } from '../hooks/useEntitlements';
import { useIsDevOwner } from '../hooks/useIsDevOwner';
import type { SettingsStackParamList } from '../navigation/settingsTypes';
import {
  clearPerfSamples,
  getPerfSamples,
  subscribePerf,
  summarizePerf,
} from '../perf/perfLog';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Development'>;

function formatMs(value: number): string {
  return value >= 100 ? `${Math.round(value)}` : value.toFixed(1);
}

// Real Hermes-on-device timings for the phases that decide how launch and
// search feel. scripts/search_benchmark.ts measures the same phases on
// Node/V8 and desktop hardware, where the large-JSON.parse path looks far
// cheaper than it is -- these are the numbers to trust, and the reason to
// read them before the SQLite search port removes the JSON path entirely.
function PerformancePanel() {
  const samples = useSyncExternalStore(subscribePerf, getPerfSamples, getPerfSamples);
  const summary = summarizePerf(samples);

  return (
    <View style={[styles.settingRow, styles.perfPanel]}>
      <View style={styles.settingRowText}>
        <Text style={text.body}>Performance</Text>
        <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
          Measured on this device, in this build. Launch rows appear once per cold start
          and survive Clear, since they cannot be re-measured without relaunching; search
          and feed rows accumulate as you use the app and are what Clear resets. A release
          build is the meaningful one to read -- debug timings are not what users feel.
        </Text>

        {summary.length === 0 ? (
          <Text style={[text.bodyMuted, styles.perfEmpty]}>
            Nothing measured yet. Run a search, or relaunch to capture the launch phases.
          </Text>
        ) : (
          <View style={styles.perfTable}>
            <View style={styles.perfHeaderRow}>
              <Text style={[styles.perfCellName, styles.perfHeaderText]}>phase</Text>
              <Text style={[styles.perfCellNum, styles.perfHeaderText]}>n</Text>
              <Text style={[styles.perfCellNum, styles.perfHeaderText]}>med</Text>
              <Text style={[styles.perfCellNum, styles.perfHeaderText]}>max</Text>
            </View>
            {summary.map((row) => (
              <View key={`${row.name} ${row.lastDetail ?? ''}`} style={styles.perfRow}>
                <View style={styles.perfCellName}>
                  <Text style={styles.perfName}>{row.name}</Text>
                  {row.lastDetail ? (
                    <Text style={styles.perfDetail} numberOfLines={1}>
                      {row.lastDetail}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.perfCellNum, styles.perfValue]}>{row.count}</Text>
                <Text style={[styles.perfCellNum, styles.perfValue]}>{formatMs(row.median)}</Text>
                <Text style={[styles.perfCellNum, styles.perfValue]}>{formatMs(row.max)}</Text>
              </View>
            ))}
            <Text style={styles.perfUnits}>milliseconds</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={clearPerfSamples}
          style={styles.perfClearButton}
        >
          <Text style={styles.perfClearLabel}>Clear search + feed rows</Text>
        </Pressable>
      </View>
    </View>
  );
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function DevelopmentSettingsScreen({ navigation }: Props) {
  const {
    findFeedContentMode,
    setFindFeedContentMode,
    nativeInteractionsEnabled,
    setNativeInteractionsEnabled,
    mockLocation,
    setMockLocation,
  } = useAppSettings();
  const { isEnabled: isEntitled } = useEntitlements();
  const isContentAdmin = isEntitled('content_admin');
  const isDevOwner = useIsDevOwner();

  const [fakeLocationEnabled, setFakeLocationEnabled] = useState(mockLocation !== null);
  const [latText, setLatText] = useState(mockLocation ? String(mockLocation.latitude) : '');
  const [lngText, setLngText] = useState(mockLocation ? String(mockLocation.longitude) : '');

  useEffect(() => {
    if (!isDevOwner) navigation.goBack();
  }, [isDevOwner, navigation]);

  if (!isDevOwner) return null;

  function commitCoordinates(nextLat: string, nextLng: string) {
    const lat = Number(nextLat);
    const lng = Number(nextLng);
    if (nextLat.trim() !== '' && nextLng.trim() !== '' && isValidLatitude(lat) && isValidLongitude(lng)) {
      setMockLocation({ latitude: lat, longitude: lng });
    } else {
      setMockLocation(null);
    }
  }

  function toggleFakeLocation(enabled: boolean) {
    setFakeLocationEnabled(enabled);
    if (enabled) {
      commitCoordinates(latText, lngText);
    } else {
      setMockLocation(null);
    }
  }

  function updateLat(value: string) {
    setLatText(value);
    if (fakeLocationEnabled) commitCoordinates(value, lngText);
  }

  function updateLng(value: string) {
    setLngText(value);
    if (fakeLocationEnabled) commitCoordinates(latText, value);
  }

  const lat = Number(latText);
  const lng = Number(lngText);
  const hasIncompleteCoordinates =
    fakeLocationEnabled && (!isValidLatitude(lat) || !isValidLongitude(lng));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="Development" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PerformancePanel />

        {isContentAdmin && (
          <View style={styles.settingRow}>
            <View style={styles.settingRowText}>
              <Text style={text.body}>Preview Unpublished Content</Text>
              <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
                Show waiting, scheduled, and inactive cards with clear preview labels. Leave this
                off to experience the feed exactly as a normal user.
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

        <View style={[styles.settingRow, styles.nativeInteractionsRow]}>
          <View style={styles.settingRowText}>
            <Text style={text.body}>Fake Location</Text>
            <Text style={[text.bodyMuted, styles.settingRowSubtitle]}>
              Override GPS with a coordinate you type in, so the app thinks you're standing
              there -- Near Me, walking distances, and search sorting all use it. Leave this off
              to use your real location.
            </Text>
          </View>
          <Switch
            value={fakeLocationEnabled}
            onValueChange={toggleFakeLocation}
            trackColor={{ true: COLORS.forest }}
          />
        </View>
        {fakeLocationEnabled && (
          <View style={styles.coordinateFields}>
            <View style={styles.coordinateField}>
              <SettingsFormField
                label="Latitude"
                value={latText}
                onChangeText={updateLat}
                placeholder="28.4177"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.coordinateField}>
              <SettingsFormField
                label="Longitude"
                value={lngText}
                onChangeText={updateLng}
                placeholder="-81.5812"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {hasIncompleteCoordinates && (
              <Text style={[text.bodyMuted, styles.coordinateHint]}>
                Enter a latitude between -90 and 90, and a longitude between -180 and 180.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: '#FFFFFF',
  },
  settingRowText: { flex: 1 },
  settingRowSubtitle: { marginTop: SPACING.xs },
  perfPanel: { marginBottom: SPACING.xl },
  perfEmpty: { marginTop: SPACING.md },
  perfTable: { marginTop: SPACING.md },
  perfHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: DAYLIGHT.border,
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: DAYLIGHT.mist,
  },
  perfCellName: { flex: 1, paddingRight: SPACING.sm },
  perfCellNum: { width: 52, textAlign: 'right' },
  perfHeaderText: {
    fontSize: 11,
    color: DAYLIGHT.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  perfName: { fontSize: 13, color: DAYLIGHT.ink },
  perfDetail: { fontSize: 11, color: DAYLIGHT.muted, marginTop: 1 },
  // Tabular figures so the columns stay aligned as values change width.
  perfValue: { fontSize: 13, color: DAYLIGHT.ink, fontVariant: ['tabular-nums'] },
  perfUnits: {
    fontSize: 11,
    color: DAYLIGHT.muted,
    textAlign: 'right',
    marginTop: SPACING.xs,
  },
  perfClearButton: { marginTop: SPACING.md, alignSelf: 'flex-start' },
  perfClearLabel: { fontSize: 13, color: COLORS.pine, fontWeight: '600' },
  nativeInteractionsRow: { marginTop: SPACING.xl },
  coordinateFields: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  coordinateField: { marginBottom: SPACING.md },
  coordinateHint: { marginTop: -SPACING.xs },
});
