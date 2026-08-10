import { useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions';
import { evaluateChallenge } from '../challenges/evaluate';
import { SettingsButton } from '../components/settings/SettingsButton';
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { scheduleAfterNavigation } from '../navigation/scheduleAfterNavigation';
import { useActivity } from '../hooks/useActivity';
import { useAuth } from '../hooks/useAuth';
import { useDataProvider } from '../hooks/useDataProvider';
import { useJournal } from '../hooks/useJournal';
import { useOpenAccountSettings } from '../hooks/useOpenAccountSettings';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'MyRumblyHome'>;

export function MyRumblyHomeScreen({ navigation }: Props) {
  const { restaurants } = useDataProvider();
  const { user } = useAuth();
  const { personalActivity, isActivityReady, reloadActivity } = useActivity();
  const { entries: journalEntries } = useJournal();
  const openAccountSettings = useOpenAccountSettings();
  const activityRefreshScheduledAt = useRef(0);
  const progress = useMemo(
    () => evaluateChallenge(QUICK_FIVE_CHALLENGE, personalActivity.gotItHistory, restaurants),
    [personalActivity.gotItHistory, restaurants]
  );

  useFocusEffect(
    useCallback(() => {
      // The activity read model fans out to several SQLite reads and updates
      // a context consumed throughout the app. Starting that work inside the
      // tab-focus callback competes with the native tab transition and can
      // make leaving this tab feel sluggish. Refresh only when the current
      // value is stale, and schedule the read after navigation interactions
      // have settled. The provider's write paths already update local state
      // immediately, so a short freshness window does not hide user actions.
      const now = Date.now();
      if (now - activityRefreshScheduledAt.current < 5_000) return;
      activityRefreshScheduledAt.current = now;

      return scheduleAfterNavigation(() => {
        reloadActivity().catch((error) => console.warn('My Rumbly refresh failed:', error));
      });
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
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>YOUR PARK-DAY STORY</Text>
          <Text style={styles.heading}>My Rumbly</Text>
          <Text style={text.bodyMuted}>{user?.email ?? 'Saved on this device'}</Text>
        </View>
        <SettingsButton
          onPress={openAccountSettings}
          tintColor={DAYLIGHT.ocean}
          pressedBackgroundColor="rgba(30, 98, 120, 0.10)"
        />
      </View>
      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open personal activity"
          style={({ pressed }) => [styles.activityCard, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('MyActivity')}
        >
          <View style={styles.storyCopy}>
            <Text style={styles.storyEyebrow}>YOUR TASTE TRAIL</Text>
            <Text style={styles.storyTitle}>Everything you loved, needed, and tried.</Text>
            <Text style={styles.storyLink}>Open personal activity →</Text>
          </View>
          <IllustrationSlot
            tagId="my-rumbly.hero.collection.v1"
            variant="artwork"
            style={styles.storyArt}
          />
          <View style={styles.statsRow}>
            <Stat value={loveCount} label="Love It" />
            <Stat
              value={personalActivity.neededRestaurants.length + personalActivity.neededItems.length}
              label="Need It"
            />
            <Stat value={personalActivity.totalGotItCount} label="Got It" />
          </View>
        </Pressable>

        <Text style={[styles.sectionLabel, styles.journalLabel]}>KEEP THE STORY GOING</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open Journal, ${journalEntries.length} ${journalEntries.length === 1 ? 'entry' : 'entries'}`}
          style={({ pressed }) => [styles.journalCard, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('Journal')}
        >
          <View style={styles.journalCopy}>
            <Text style={styles.journalEyebrow}>PRIVATE JOURNAL</Text>
            <Text style={styles.cardTitle}>Save the part you’ll want back later.</Text>
            <Text style={styles.cardSubtitle}>Photos, notes, ratings, and visits—kept together.</Text>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {journalEntries.length} {journalEntries.length === 1 ? 'memory' : 'memories'} saved
              </Text>
            </View>
          </View>
          <IllustrationSlot
            tagId="journal.hero.memory-book.v1"
            variant="artwork"
            style={styles.journalArt}
          />
        </Pressable>

        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionLabel}>A LITTLE NUDGE</Text>
          <Text style={styles.sectionCount}>1 active</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open challenges, Quick Five is ${progress.currentCount} of ${progress.requiredCount}`}
          style={({ pressed }) => [styles.challengeCard, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('ChallengeList')}
        >
          <View style={styles.challengeTopRow}>
            <IllustrationSlot
              tagId="explore.editorial.challenge.v1"
              variant="artwork"
              showTag={false}
              style={styles.challengeArt}
            />
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
      </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.paper },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
  },
  body: { flex: 1, backgroundColor: DAYLIGHT.paper },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 130 },
  headingCopy: { flex: 1 },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 1.05,
    color: DAYLIGHT.ocean,
  },
  heading: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 29,
    lineHeight: 34,
    color: DAYLIGHT.ink,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: DAYLIGHT.ocean,
    marginBottom: SPACING.sm,
  },
  journalLabel: { marginTop: SPACING.xl },
  sectionCount: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 11,
    color: DAYLIGHT.muted,
    marginBottom: SPACING.sm,
  },
  activityCard: {
    minHeight: 260,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: DAYLIGHT.coral,
  },
  storyCopy: {
    zIndex: 1,
    width: '62%',
    minHeight: 188,
    justifyContent: 'center',
    padding: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  storyEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: '#FFF4EA',
  },
  storyTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 23,
    lineHeight: 27,
    color: DAYLIGHT.paper,
    marginTop: SPACING.xs,
  },
  storyLink: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11.5,
    color: DAYLIGHT.paper,
    marginTop: SPACING.md,
  },
  storyArt: {
    position: 'absolute',
    width: '43%',
    right: 0,
    top: 0,
    minHeight: 188,
    borderRadius: 0,
  },
  statsRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(121,43,25,0.11)',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 21,
    color: DAYLIGHT.paper,
  },
  statLabel: {
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 10,
    color: '#FFF4EA',
    marginTop: 1,
  },
  journalCard: {
    minHeight: 192,
    overflow: 'hidden',
    flexDirection: 'row',
    borderRadius: RADII.xl,
    backgroundColor: '#FFF0BD',
  },
  journalCopy: {
    zIndex: 1,
    width: '62%',
    justifyContent: 'center',
    padding: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  journalEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: DAYLIGHT.amberInk,
    marginBottom: SPACING.xs,
  },
  journalArt: {
    position: 'absolute',
    width: '42%',
    right: 0,
    top: 0,
    bottom: 0,
    minHeight: 192,
    borderRadius: 0,
  },
  countPill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: 14,
    backgroundColor: DAYLIGHT.paper,
  },
  countPillText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    color: DAYLIGHT.ocean,
  },
  challengeCard: {
    borderRadius: RADII.xl,
    backgroundColor: '#DCEFE6',
    padding: SPACING.lg,
  },
  cardPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  cardTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 19,
    lineHeight: 23,
    color: DAYLIGHT.ink,
  },
  cardSubtitle: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    lineHeight: 17,
    color: DAYLIGHT.muted,
    marginTop: 2,
  },
  chevron: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 25,
    color: DAYLIGHT.ocean,
    marginLeft: SPACING.sm,
  },
  challengeTopRow: { flexDirection: 'row', alignItems: 'center' },
  challengeArt: { width: 56, minHeight: 56, marginRight: SPACING.md, borderRadius: 18 },
  challengeCopy: { flex: 1 },
  challengeProgress: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 13,
    color: DAYLIGHT.ocean,
  },
  track: {
    height: 7,
    overflow: 'hidden',
    marginTop: SPACING.md,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  fill: { height: '100%', backgroundColor: DAYLIGHT.ocean },
  rounds: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 10,
    color: DAYLIGHT.muted,
    marginTop: 6,
  },
});
