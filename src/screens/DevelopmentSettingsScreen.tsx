import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsFormField } from '../components/settings/SettingsFormField';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { useAppSettings } from '../hooks/useAppSettings';
import { useEntitlements } from '../hooks/useEntitlements';
import { useIsDevOwner } from '../hooks/useIsDevOwner';
import type { SettingsStackParamList } from '../navigation/settingsTypes';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Development'>;

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
  nativeInteractionsRow: { marginTop: SPACING.xl },
  coordinateFields: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  coordinateField: { marginBottom: SPACING.md },
  coordinateHint: { marginTop: -SPACING.xs },
});
