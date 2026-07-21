import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ExploreStackParamList } from '../navigation/ExploreNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants, WATER_PARKS_GROUP_KEY, type RestaurantGroup } from '../data/groups';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';
import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions';
import { evaluateChallenge } from '../challenges/evaluate';
import { ChallengeSummaryCard } from '../components/challenges/ChallengeSummaryCard';
import { useActivity } from '../hooks/useActivity';

type Props = NativeStackScreenProps<ExploreStackParamList, 'ExploreHome'>;

const CARD_COLORS = [
  COLORS.forest,
  COLORS.gold,
  COLORS.pine,
  COLORS.barkBrown,
  COLORS.muted,
  COLORS.pineLight,
  COLORS.ink,
  COLORS.dim,
];

function cardTitle(group: RestaurantGroup): string {
  if (group.label === "Disney's Hollywood Studios") return 'Hollywood Studios';
  if (group.label === "Disney's Animal Kingdom Theme Park") return 'Animal Kingdom';
  if (group.label === 'Magic Kingdom Park') return 'Magic Kingdom';
  return group.label;
}

export function ExploreHomeScreen({ navigation }: Props) {
  const { restaurants, isLoading, error } = useDataProvider();
  const { personalActivity } = useActivity();
  const groups = groupRestaurants(restaurants);
  const quickFiveProgress = useMemo(
    () => evaluateChallenge(QUICK_FIVE_CHALLENGE, personalActivity.gotItHistory, restaurants),
    [personalActivity.gotItHistory, restaurants]
  );

  const openGroup = (group: RestaurantGroup) => {
    if (group.key === WATER_PARKS_GROUP_KEY) {
      navigation.navigate('LocationList', {
        parentGroupKey: group.key,
        parentGroupLabel: group.label,
      });
      return;
    }
    navigation.navigate('RestaurantList', { groupKey: group.key, groupLabel: group.label });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          style={styles.heading}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.84}
          allowFontScaling={false}
        >
          Explore Restaurants and Menus
        </Text>
        <Text style={[text.sectionToggle, styles.sectionLabel]}>EXPLORE BY LOCATION</Text>

        {isLoading && restaurants.length === 0 ? (
          <View style={styles.statePanel}>
            <ActivityIndicator color={COLORS.forest} />
          </View>
        ) : error && restaurants.length === 0 ? (
          <View style={styles.statePanel}>
            <Text style={text.body}>Couldn't load dining data.</Text>
            <Text style={[text.bodyMuted, styles.stateHint]}>{error}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {groups.map((group, index) => (
              <Pressable
                key={group.key}
                accessibilityRole="button"
                accessibilityLabel={`Explore ${group.label}`}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: CARD_COLORS[index % CARD_COLORS.length] },
                  pressed && styles.cardPressed,
                ]}
                onPress={() => openGroup(group)}
              >
                <Text
                  style={styles.cardTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  allowFontScaling={false}
                >
                  {cardTitle(group)}
                </Text>
                <Text style={styles.cardCount} allowFontScaling={false}>
                  {group.restaurants.length} restaurants
                </Text>
                <View style={styles.cardAccent} />
              </Pressable>
            ))}
          </View>
        )}

        {restaurants.length > 0 && (
          <View style={styles.challengeSection}>
            <Text style={[text.sectionToggle, styles.sectionLabel]}>CHALLENGES</Text>
            <ChallengeSummaryCard
              compact
              definition={QUICK_FIVE_CHALLENGE}
              progress={quickFiveProgress}
              onPress={() => navigation.navigate('ChallengeDetail', { challengeId: QUICK_FIVE_CHALLENGE.id })}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  heading: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    marginBottom: SPACING.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  card: {
    width: '48%',
    height: 55,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.72,
  },
  cardTitle: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 12,
    lineHeight: 14,
    color: COLORS.surface,
    marginBottom: 2,
  },
  cardCount: {
    fontFamily: text.bodyMuted.fontFamily,
    fontSize: 9,
    color: COLORS.goldLight,
  },
  cardAccent: {
    position: 'absolute',
    right: -13,
    bottom: -18,
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 247, 238, 0.18)',
    transform: [{ rotate: '-18deg' }],
  },
  statePanel: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateHint: {
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  challengeSection: {
    marginTop: SPACING.xl,
  },
});
