import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions';
import { evaluateChallenge } from '../challenges/evaluate';
import { ChallengeSummaryCard } from '../components/challenges/ChallengeSummaryCard';
import { useActivity } from '../hooks/useActivity';
import { useDataProvider } from '../hooks/useDataProvider';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { COLORS, SPACING } from '../theme/tokens';
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
          accessibilityLabel="Back to My Bites"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.heading}>Challenges</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
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
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: FONT_FAMILY.interRegular, fontSize: 34, lineHeight: 36, color: COLORS.forest },
  heading: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 22, color: COLORS.ink },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  sectionLabel: { fontFamily: FONT_FAMILY.interBold, fontSize: 11, color: COLORS.muted, marginBottom: SPACING.sm },
  earnedSection: { marginTop: SPACING.xl },
  earnedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  badge: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.goldLight, borderWidth: 1, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  badgeStar: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 18, color: COLORS.gold },
  earnedTitle: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 17, color: COLORS.ink },
  earnedMeta: { fontFamily: FONT_FAMILY.interRegular, fontSize: 12, color: COLORS.muted, marginTop: 1 },
});
