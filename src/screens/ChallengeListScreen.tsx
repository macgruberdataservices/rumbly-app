import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions';
import { evaluateChallenge } from '../challenges/evaluate';
import { ChallengeSummaryCard } from '../components/challenges/ChallengeSummaryCard';
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import { useActivity } from '../hooks/useActivity';
import { useDataProvider } from '../hooks/useDataProvider';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'ChallengeList'>;

export function ChallengeListScreen({ navigation }: Props) {
  const { restaurants } = useDataProvider();
  const { personalActivity } = useActivity();
  const progress = useMemo(
    () => evaluateChallenge(QUICK_FIVE_CHALLENGE, personalActivity.gotItHistory, restaurants),
    [personalActivity.gotItHistory, restaurants]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to My Rumbly"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.heading}>Challenges</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>A LITTLE QUEST</Text>
            <Text style={styles.heroTitle}>Taste your way to the finish.</Text>
            <Text style={styles.heroBody}>Small challenges turn a park day into a story worth collecting.</Text>
          </View>
          <IllustrationSlot tagId="explore.editorial.challenge.v1" variant="artwork" style={styles.heroArt} />
        </View>
        <Text style={styles.sectionLabel}>ACTIVE</Text>
        <ChallengeSummaryCard
          definition={QUICK_FIVE_CHALLENGE}
          progress={progress}
          onPress={() => navigation.navigate('ChallengeDetail', { challengeId: QUICK_FIVE_CHALLENGE.id })}
        />
        {progress.completions.length > 0 && (
          <View style={styles.earnedSection}>
            <Text style={styles.sectionLabel}>EARNED</Text>
            <View style={styles.earnedRow}>
              <View style={styles.badge}><Text style={styles.badgeStar}>★</Text></View>
              <View>
                <Text style={styles.earnedTitle}>Quick Five</Text>
                <Text style={styles.earnedMeta}>
                  {progress.completions.length} {progress.completions.length === 1 ? 'round' : 'rounds'} completed
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: DAYLIGHT.sky, borderBottomLeftRadius: RADII.xl, borderBottomRightRadius: RADII.xl },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  backIcon: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 34, lineHeight: 36, color: DAYLIGHT.ocean },
  heading: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 24, color: DAYLIGHT.ink, marginLeft: SPACING.sm },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 120 },
  hero: { minHeight: 196, flexDirection: 'row', overflow: 'hidden', borderRadius: 30, padding: SPACING.lg, backgroundColor: DAYLIGHT.coral, marginBottom: SPACING.xl },
  heroCopy: { flex: 1, zIndex: 1, paddingRight: SPACING.sm },
  heroEyebrow: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 10, letterSpacing: 1, color: '#FFFFFF', opacity: 0.88 },
  heroTitle: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 27, lineHeight: 29, color: '#FFFFFF', marginTop: SPACING.xs },
  heroBody: { fontFamily: FONT_FAMILY.workSansMedium, fontSize: 12, lineHeight: 17, color: '#FFFFFF', opacity: 0.9, marginTop: SPACING.sm },
  heroArt: { width: 132, minHeight: 164, marginRight: -30, marginTop: 6, backgroundColor: '#F4C969' },
  sectionLabel: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 11, letterSpacing: 0.7, color: DAYLIGHT.ocean, marginBottom: SPACING.sm },
  earnedSection: { marginTop: SPACING.xl },
  earnedRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, borderRadius: RADII.xl, backgroundColor: '#F8E5B9' },
  badge: { width: 48, height: 48, borderRadius: 16, backgroundColor: DAYLIGHT.sun, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md, transform: [{ rotate: '-5deg' }] },
  badgeStar: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 20, color: DAYLIGHT.amberInk },
  earnedTitle: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 18, color: DAYLIGHT.ink },
  earnedMeta: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 12, color: DAYLIGHT.muted, marginTop: 1 },
});
