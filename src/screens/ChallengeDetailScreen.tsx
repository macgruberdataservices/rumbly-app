import { useMemo } from 'react';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getChallengeDefinition } from '../challenges/definitions';
import { eligibleRestaurants, evaluateChallenge } from '../challenges/evaluate';
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import { useActivity } from '../hooks/useActivity';
import { useDataProvider } from '../hooks/useDataProvider';
import { DAYLIGHT, RADII, SPACING } from '../theme/tokens';
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
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <View style={styles.badge}><Text style={styles.badgeStar}>★</Text></View>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{definition.title}</Text>
            </View>
            <View style={styles.repeatPill}><Text style={styles.repeatLabel}>REPEATABLE</Text></View>
          </View>
          <IllustrationSlot tagId="explore.editorial.challenge.v1" variant="artwork" style={styles.heroArt} />
        </View>
        <Text style={styles.description}>{definition.description}</Text>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Current round</Text>
            <Text style={styles.progressCount}>{progress.currentCount} of {progress.requiredCount}</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, ratio * 100)}%` }]} /></View>
          <Text style={styles.ruleCopy}>
            Each different Quick Service restaurant counts once per round. Restaurant and menu item Got It logs both count.
          </Text>
        </View>

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
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: DAYLIGHT.sky, borderBottomLeftRadius: RADII.xl, borderBottomRightRadius: RADII.xl },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  backIcon: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 34, lineHeight: 36, color: DAYLIGHT.ocean },
  headerTitle: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 18, color: DAYLIGHT.ink, marginLeft: SPACING.sm },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  hero: { minHeight: 184, flexDirection: 'row', overflow: 'hidden', borderRadius: 30, padding: SPACING.lg, backgroundColor: '#D8EEE4' },
  heroCopy: { flex: 1, zIndex: 1, justifyContent: 'center' },
  heroArt: { width: 136, minHeight: 156, marginRight: -34, backgroundColor: '#F4C969' },
  badge: { width: 54, height: 54, borderRadius: 18, backgroundColor: DAYLIGHT.ocean, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, transform: [{ rotate: '-6deg' }] },
  badgeStar: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 24, color: '#FFFFFF' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 29, lineHeight: 31, color: DAYLIGHT.ink },
  repeatPill: { alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4, marginTop: SPACING.sm },
  repeatLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 9, color: DAYLIGHT.ocean },
  description: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 16, lineHeight: 23, color: DAYLIGHT.muted, marginTop: SPACING.lg },
  progressCard: { marginTop: SPACING.xl, padding: SPACING.lg, borderRadius: RADII.xl, backgroundColor: '#FFFFFF' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressTitle: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 19, color: DAYLIGHT.ink },
  progressCount: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 13, color: DAYLIGHT.ocean },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: DAYLIGHT.sky, marginTop: SPACING.md },
  fill: { height: '100%', backgroundColor: DAYLIGHT.coral },
  ruleCopy: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 12, lineHeight: 17, color: DAYLIGHT.muted, marginTop: SPACING.md },
  divider: { height: 1, backgroundColor: DAYLIGHT.border, marginVertical: SPACING.xl },
  sectionTitle: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 20, color: DAYLIGHT.ink, marginBottom: SPACING.sm },
  venueRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm, borderRadius: RADII.md, backgroundColor: '#FFFFFF' },
  venueNumber: { width: 28, height: 28, borderRadius: 10, backgroundColor: '#F8E5B9', alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm },
  venueNumberText: { fontFamily: FONT_FAMILY.workSansSemiBold, fontSize: 11, color: DAYLIGHT.amberInk },
  venueName: { flex: 1, fontFamily: FONT_FAMILY.workSansRegular, fontSize: 14, color: DAYLIGHT.ink },
  completionCount: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 34, color: DAYLIGHT.coral, marginBottom: SPACING.xs },
  eligibleNote: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm, marginTop: SPACING.xl, padding: SPACING.lg, borderRadius: RADII.xl, backgroundColor: '#F8E5B9' },
  eligibleCount: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 24, color: DAYLIGHT.amberInk },
  eligibleLabel: { flex: 1, fontFamily: FONT_FAMILY.workSansRegular, fontSize: 11, color: DAYLIGHT.muted },
});
