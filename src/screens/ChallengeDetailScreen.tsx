import { useMemo } from 'react';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getChallengeDefinition } from '../challenges/definitions';
import { eligibleRestaurants, evaluateChallenge } from '../challenges/evaluate';
import { useActivity } from '../hooks/useActivity';
import { useDataProvider } from '../hooks/useDataProvider';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type ChallengeRouteParamList = {
  ChallengeDetail: { challengeId: string };
};

export function ChallengeDetailScreen() {
  const navigation = useNavigation<NavigationProp<ChallengeRouteParamList>>();
  const route = useRoute<RouteProp<ChallengeRouteParamList, 'ChallengeDetail'>>();
  const { restaurants } = useDataProvider();
  const { personalActivity } = useActivity();
  const definition = getChallengeDefinition(route.params.challengeId);

  const progress = useMemo(
    () => definition ? evaluateChallenge(definition, personalActivity.gotItHistory, restaurants) : null,
    [definition, personalActivity.gotItHistory, restaurants]
  );
  const restaurantById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant])),
    [restaurants]
  );
  const eligibleCount = useMemo(
    () => definition ? eligibleRestaurants(definition, restaurants).length : 0,
    [definition, restaurants]
  );

  if (!definition || !progress) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={text.body}>Challenge not found.</Text>
      </SafeAreaView>
    );
  }

  const ratio = progress.requiredCount > 0 ? progress.currentCount / progress.requiredCount : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Challenge</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}><Text style={styles.badgeStar}>★</Text></View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{definition.title}</Text>
          <View style={styles.repeatPill}><Text style={styles.repeatLabel}>REPEATABLE</Text></View>
        </View>
        <Text style={styles.description}>{definition.description}</Text>

        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Current round</Text>
          <Text style={styles.progressCount}>{progress.currentCount} of {progress.requiredCount}</Text>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, ratio * 100)}%` }]} /></View>
        <Text style={styles.ruleCopy}>
          Each different Quick Service restaurant counts once per round. Restaurant and menu item Got It logs both count.
        </Text>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>This round</Text>
        {progress.currentRestaurantIds.length === 0 ? (
          <Text style={text.bodyMuted}>Your next Quick Service Got It starts this round.</Text>
        ) : (
          progress.currentRestaurantIds.map((restaurantId, index) => (
            <View key={restaurantId} style={styles.venueRow}>
              <View style={styles.venueNumber}><Text style={styles.venueNumberText}>{index + 1}</Text></View>
              <Text style={styles.venueName}>{restaurantById.get(restaurantId)?.restaurant ?? 'Restaurant'}</Text>
            </View>
          ))
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Rounds completed</Text>
        <Text style={styles.completionCount}>{progress.completions.length}</Text>
        <Text style={text.bodyMuted}>
          Completing five starts a fresh round. Your Got It history remains available for other challenges.
        </Text>

        <View style={styles.eligibleNote}>
          <Text style={styles.eligibleCount}>{eligibleCount}</Text>
          <Text style={styles.eligibleLabel}>eligible restaurants in the current dining catalog</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: FONT_FAMILY.interRegular, fontSize: 34, lineHeight: 36, color: COLORS.forest },
  headerTitle: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 17, color: COLORS.ink },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.forest, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  badgeStar: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 24, color: COLORS.goldLight },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 27, color: COLORS.ink },
  repeatPill: { borderRadius: 8, backgroundColor: COLORS.cream, paddingHorizontal: 7, paddingVertical: 3 },
  repeatLabel: { fontFamily: FONT_FAMILY.interBold, fontSize: 9, color: COLORS.forest },
  description: { fontFamily: FONT_FAMILY.interRegular, fontSize: 15, lineHeight: 21, color: COLORS.muted, marginTop: SPACING.xs },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: SPACING.xl },
  progressTitle: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 16, color: COLORS.ink },
  progressCount: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 13, color: COLORS.forest },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: COLORS.cream, marginTop: SPACING.sm },
  fill: { height: '100%', backgroundColor: COLORS.pine },
  ruleCopy: { fontFamily: FONT_FAMILY.interRegular, fontSize: 12, lineHeight: 17, color: COLORS.muted, marginTop: SPACING.sm },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xl },
  sectionTitle: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 17, color: COLORS.ink, marginBottom: SPACING.sm },
  venueRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  venueNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.goldLight, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm },
  venueNumberText: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 11, color: COLORS.forest },
  venueName: { flex: 1, fontFamily: FONT_FAMILY.interRegular, fontSize: 14, color: COLORS.ink },
  completionCount: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 30, color: COLORS.forest, marginBottom: SPACING.xs },
  eligibleNote: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm, marginTop: SPACING.xl },
  eligibleCount: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 20, color: COLORS.gold },
  eligibleLabel: { flex: 1, fontFamily: FONT_FAMILY.interRegular, fontSize: 11, color: COLORS.dim },
});
