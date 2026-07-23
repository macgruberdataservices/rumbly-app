import { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions';
import { evaluateChallenge } from '../challenges/evaluate';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { useActivity } from '../hooks/useActivity';
import { useAuth } from '../hooks/useAuth';
import { useDataProvider } from '../hooks/useDataProvider';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'MyRumblyHome'>;

export function MyRumblyHomeScreen({ navigation }: Props) {
  const { restaurants } = useDataProvider();
  const { user } = useAuth();
  const { personalActivity, isActivityReady, reloadActivity } = useActivity();
  const progress = useMemo(
    () => evaluateChallenge(QUICK_FIVE_CHALLENGE, personalActivity.gotItHistory, restaurants),
    [personalActivity.gotItHistory, restaurants]
  );

  useFocusEffect(
    useCallback(() => {
      reloadActivity().catch((error) => console.warn('My Rumbly refresh failed:', error));
    }, [reloadActivity])
  );

  if (!isActivityReady) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  const loveCount = personalActivity.lovedRestaurants.length + personalActivity.lovedItems.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.heading}>My Bites</Text>
            <Text style={text.bodyMuted}>{user?.email ?? 'Saved on this device'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account settings"
            hitSlop={8}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
            onPress={() => navigation.navigate('AccountSettings')}
          >
            <SettingsIcon />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>YOUR RUMBLY</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open personal activity"
          style={({ pressed }) => [styles.activityCard, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('MyActivity')}
        >
          <View style={styles.cardHeadingRow}>
            <View>
              <Text style={styles.cardTitle}>Personal Activity</Text>
              <Text style={styles.cardSubtitle}>Your saved tastes and dining history</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View style={styles.statsRow}>
            <Stat value={loveCount} label="Love It" />
            <Stat value={personalActivity.neededItems.length} label="Need It" />
            <Stat value={personalActivity.totalGotItCount} label="Got It" />
          </View>
        </Pressable>

        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionLabel}>CHALLENGES</Text>
          <Text style={styles.sectionCount}>1 active</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open challenges, Quick Five is ${progress.currentCount} of ${progress.requiredCount}`}
          style={({ pressed }) => [styles.challengeCard, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('ChallengeList')}
        >
          <View style={styles.challengeTopRow}>
            <View style={styles.challengeIcon}><Text style={styles.challengeIconText}>★</Text></View>
            <View style={styles.challengeCopy}>
              <Text style={styles.cardTitle}>Challenges</Text>
              <Text style={styles.cardSubtitle}>Quick Five</Text>
            </View>
            <Text style={styles.challengeProgress}>{progress.currentCount}/{progress.requiredCount}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, progress.currentCount / progress.requiredCount * 100)}%` }]} />
          </View>
          <Text style={styles.rounds}>{progress.completions.length} completed {progress.completions.length === 1 ? 'round' : 'rounds'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingsIcon() {
  return (
    <View style={styles.settingsIcon}>
      <View style={[styles.settingsLine, styles.settingsLineTop]} />
      <View style={[styles.settingsLine, styles.settingsLineMiddle]} />
      <View style={[styles.settingsLine, styles.settingsLineBottom]} />
      <View style={[styles.settingsKnob, styles.settingsKnobTop]} />
      <View style={[styles.settingsKnob, styles.settingsKnobMiddle]} />
      <View style={[styles.settingsKnob, styles.settingsKnobBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xxl },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl },
  headingCopy: { flex: 1 },
  heading: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 22, lineHeight: 27, color: COLORS.ink },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  settingsButtonPressed: { backgroundColor: COLORS.goldLight },
  settingsIcon: { width: 22, height: 22 },
  settingsLine: { position: 'absolute', left: 1, width: 20, height: 2, borderRadius: 1, backgroundColor: COLORS.forest },
  settingsLineTop: { top: 3 },
  settingsLineMiddle: { top: 10 },
  settingsLineBottom: { top: 17 },
  settingsKnob: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: COLORS.forest,
    backgroundColor: COLORS.surface,
  },
  settingsKnobTop: { top: 1, left: 5 },
  settingsKnobMiddle: { top: 8, left: 12 },
  settingsKnobBottom: { top: 15, left: 7 },
  sectionHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xl },
  sectionLabel: { fontFamily: FONT_FAMILY.interBold, fontSize: 11, color: COLORS.muted, marginBottom: SPACING.sm },
  sectionCount: { fontFamily: FONT_FAMILY.interRegular, fontSize: 11, color: COLORS.dim, marginBottom: SPACING.sm },
  activityCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.surface, overflow: 'hidden' },
  challengeCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.surface, padding: SPACING.md },
  cardPressed: { backgroundColor: COLORS.goldLight },
  cardHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.md },
  cardTitle: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 18, color: COLORS.ink },
  cardSubtitle: { fontFamily: FONT_FAMILY.interRegular, fontSize: 12, color: COLORS.muted, marginTop: 1 },
  chevron: { fontFamily: FONT_FAMILY.interRegular, fontSize: 25, color: COLORS.dim, marginLeft: SPACING.sm },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: SPACING.md },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 20, color: COLORS.forest },
  statLabel: { fontFamily: FONT_FAMILY.interMedium, fontSize: 10, color: COLORS.muted, marginTop: 1 },
  challengeTopRow: { flexDirection: 'row', alignItems: 'center' },
  challengeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.forest, marginRight: SPACING.sm },
  challengeIconText: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 16, color: COLORS.goldLight },
  challengeCopy: { flex: 1 },
  challengeProgress: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 13, color: COLORS.forest },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.cream, marginTop: SPACING.md },
  fill: { height: '100%', backgroundColor: COLORS.pine },
  rounds: { fontFamily: FONT_FAMILY.interRegular, fontSize: 10, color: COLORS.dim, marginTop: 5 },
});
