import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheet,
  Button,
  Column,
  Switch,
  Text as NativeText,
} from '@expo/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeInteractionDemo } from '../components/native-ui-lab/NativeInteractionDemo';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'NativeUiLab'>;

const RAIL_CARDS = [
  { eyebrow: 'NEW BITES', title: 'Festival favorite', color: '#DCECF3' },
  { eyebrow: 'WHAT’S NEARBY', title: 'Lunch around the corner', color: '#F8E5B9' },
  { eyebrow: 'FOR YOU', title: 'A highly rated pick', color: '#E7E2F2' },
];

export function NativeUiLabScreen({ navigation }: Props) {
  const [eventMessage, setEventMessage] = useState('No native interaction yet');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="Native UI Lab" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.introEyebrow}>ISOLATED PROTOTYPE</Text>
          <Text style={styles.introTitle}>Expo UI interaction test</Text>
          <Text style={text.bodyMuted}>
            Nothing on this screen replaces the current Find or menu-row behavior. It exists
            only to compare native SwiftUI and Jetpack Compose interactions on-device.
          </Text>
        </View>

        <View style={styles.insetSection}>
          <Text style={styles.sectionTitle}>Long-press and swipe</Text>
          <Text style={[text.bodyMuted, styles.sectionSubtitle]}>
            On iOS, long-press for the preview and instant actions, swipe left for
            Love It-style actions, or tap the edge-to-edge row to open it fully.
            On Android, long-press for the native Compose menu.
          </Text>
          <View style={styles.nativeDemoBleed}>
            <NativeInteractionDemo onEvent={setEventMessage} />
          </View>
          <View style={styles.eventStatus}>
            <Text style={styles.eventStatusLabel}>LAST EVENT</Text>
            <Text style={styles.eventStatusText}>{eventMessage}</Text>
          </View>
        </View>

        <View style={styles.insetSection}>
          <Text style={styles.sectionTitle}>Native filter sheet</Text>
          <Text style={[text.bodyMuted, styles.sectionSubtitle]}>
            This tests the alternative to our embedded filter drawer: native drag physics,
            snap points, platform scrim, and swipe-down dismissal.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
            style={({ pressed }) => [styles.openSheetButton, pressed && styles.pressed]}
          >
            <Text style={styles.openSheetButtonText}>Open native filter sheet</Text>
          </Pressable>
        </View>

        <View style={styles.railSection}>
          <View style={styles.railHeading}>
            <Text style={styles.sectionTitle}>Full-bleed horizontal rail</Text>
            <Text style={[text.bodyMuted, styles.sectionSubtitle]}>
              The first card aligns with the heading, but cards scroll through the physical
              screen edge instead of clipping at a page border.
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            decelerationRate="fast"
          >
            {RAIL_CARDS.map((card) => (
              <View key={card.eyebrow} style={styles.railCard}>
                <View style={[styles.railArtwork, { backgroundColor: card.color }]}>
                  <Text style={styles.railMark}>BITE</Text>
                </View>
                <View style={styles.railCopy}>
                  <Text style={styles.railEyebrow}>{card.eyebrow}</Text>
                  <Text style={styles.railTitle}>{card.title}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <BottomSheet
        isPresented={sheetOpen}
        onDismiss={() => setSheetOpen(false)}
        snapPoints={['half', 'full']}
        showDragIndicator
      >
        <Column spacing={18} style={{ paddingBottom: 24 }}>
          <NativeText textStyle={{ fontSize: 24, fontWeight: '700', color: COLORS.ink }}>
            Filter your bites
          </NativeText>
          <NativeText textStyle={{ fontSize: 14, color: COLORS.muted, lineHeight: 20 }}>
            This is native sheet presentation. It intentionally does not replace the current
            embedded filter panel during the pilot.
          </NativeText>
          <Switch
            label="Nearby only"
            value={nearbyOnly}
            onValueChange={setNearbyOnly}
          />
          <Switch
            label="Loved restaurants only"
            value={favoritesOnly}
            onValueChange={setFavoritesOnly}
          />
          <Button
            label="Apply prototype filters"
            onPress={() => {
              setEventMessage(
                `Native sheet applied: nearby ${nearbyOnly ? 'on' : 'off'}, favorites ${favoritesOnly ? 'on' : 'off'}`
              );
              setSheetOpen(false);
            }}
          />
        </Column>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingBottom: SPACING.xxl },
  intro: {
    marginHorizontal: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.cream,
  },
  introEyebrow: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: COLORS.forest,
  },
  introTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 25,
    color: COLORS.ink,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  insetSection: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 22,
    color: COLORS.ink,
  },
  sectionSubtitle: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  nativeDemoBleed: {
    marginHorizontal: -SPACING.lg,
    marginBottom: SPACING.sm,
  },
  eventStatus: {
    padding: SPACING.md,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.goldLight,
  },
  eventStatusLabel: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: COLORS.gold,
  },
  eventStatusText: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.ink,
    marginTop: 2,
  },
  openSheetButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
    backgroundColor: COLORS.forest,
  },
  openSheetButtonText: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 15,
    color: COLORS.surface,
  },
  pressed: { opacity: 0.72 },
  railSection: { marginTop: SPACING.xl },
  railHeading: { paddingHorizontal: SPACING.lg },
  rail: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  railCard: {
    width: 210,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
  },
  railArtwork: {
    height: 118,
    justifyContent: 'flex-end',
    padding: SPACING.md,
  },
  railMark: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 27,
    color: COLORS.forest,
  },
  railCopy: { padding: SPACING.md },
  railEyebrow: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 9,
    letterSpacing: 0.7,
    color: COLORS.forest,
  },
  railTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 18,
    color: COLORS.ink,
    marginTop: SPACING.xs,
  },
});
