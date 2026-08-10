import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ExploreStackParamList } from '../navigation/ExploreNavigator';
import { SettingsButton } from '../components/settings/SettingsButton';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants, WATER_PARKS_GROUP_KEY, type RestaurantGroup } from '../data/groups';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';
import { QUICK_FIVE_CHALLENGE } from '../challenges/definitions';
import { evaluateChallenge } from '../challenges/evaluate';
import { ChallengeSummaryCard } from '../components/challenges/ChallengeSummaryCard';
import { useActivity } from '../hooks/useActivity';
import { useOpenAccountSettings } from '../hooks/useOpenAccountSettings';
import { useTicketedEvents } from '../hooks/useTicketedEvents';

type Props = NativeStackScreenProps<ExploreStackParamList, 'ExploreHome'>;

const CARD_COLORS = ['#DCEFF3', '#FFE3D8', '#FFF0BD', '#DCEFE6'] as const;

export function ExploreHomeScreen({ navigation }: Props) {
  const { restaurants, isLoading, error } = useDataProvider();
  const { personalActivity } = useActivity();
  const openAccountSettings = useOpenAccountSettings();
  const activeTicketedEvents = useTicketedEvents();
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
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>WANDER THE WORLD</Text>
          <Text style={styles.heading}>Pick a place to explore</Text>
          <Text style={styles.headerDescription}>Restaurants, menus and treats by location.</Text>
        </View>
        <SettingsButton
          onPress={openAccountSettings}
          tintColor={DAYLIGHT.ocean}
          pressedBackgroundColor="rgba(30, 98, 120, 0.10)"
        />
      </View>
      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.content}>
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
                  {group.label}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardCount} allowFontScaling={false}>
                    {group.restaurants.length} restaurants
                  </Text>
                  <View style={styles.cardArrow}>
                    <Text style={styles.cardArrowText}>›</Text>
                  </View>
                </View>
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

        {restaurants.length > 0 && (
          <View style={styles.challengeSection}>
            <Text style={[text.sectionToggle, styles.sectionLabel]}>WHAT'S NEW</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See what's new: menu updates, prices, openings and closures"
              style={({ pressed }) => [styles.changesCard, pressed && styles.changesCardPressed]}
              onPress={() => navigation.navigate('ChangesHome')}
            >
              <View style={styles.changesIcon}>
                <Text style={styles.changesIconText}>🔄</Text>
              </View>
              <View style={styles.changesCopy}>
                <Text style={styles.changesTitle}>See what's new!</Text>
                <Text style={styles.changesDescription} numberOfLines={1}>
                  Menu updates, prices, openings & closures
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>
        )}

        {activeTicketedEvents.length > 0 && (
          <View style={styles.challengeSection}>
            <Text style={[text.sectionToggle, styles.sectionLabel]}>CHECK OUT EXCLUSIVE ITEMS</Text>
            {activeTicketedEvents.map((event) => (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                accessibilityLabel={`${event.title}: ${event.subtitle}`}
                style={({ pressed }) => [styles.changesCard, pressed && styles.changesCardPressed]}
                onPress={() =>
                  navigation.navigate('TicketedEvent', {
                    title: event.title,
                    subtitle: event.subtitle,
                    items: event.items,
                  })
                }
              >
                <View style={styles.changesIcon}>
                  <Text style={styles.changesIconText}>{event.icon}</Text>
                </View>
                <View style={styles.changesCopy}>
                  <Text style={styles.changesTitle}>{event.title}</Text>
                  <Text style={styles.changesDescription} numberOfLines={1}>
                    {event.subtitle}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DAYLIGHT.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    backgroundColor: DAYLIGHT.sky,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: SPACING.sm,
  },
  body: {
    flex: 1,
    backgroundColor: DAYLIGHT.paper,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  heading: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 25,
    lineHeight: 30,
    color: DAYLIGHT.ink,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.25,
    color: DAYLIGHT.ocean,
    marginBottom: 2,
  },
  headerDescription: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: DAYLIGHT.muted,
    marginTop: SPACING.xs,
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
    minHeight: 88,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(23, 40, 45, 0.08)',
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.72,
  },
  cardTitle: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: DAYLIGHT.ink,
    marginBottom: SPACING.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCount: {
    fontFamily: text.bodyMuted.fontFamily,
    fontSize: 10,
    color: DAYLIGHT.muted,
    flex: 1,
  },
  cardArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  cardArrowText: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 19,
    lineHeight: 20,
    color: DAYLIGHT.ocean,
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
  // Matches ChallengeSummaryCard's bordered-card language (this app's
  // convention for a top-level section entry point, distinct from the
  // flat divider-row convention used for peer list items within a screen).
  changesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  changesCardPressed: {
    backgroundColor: COLORS.goldLight,
  },
  changesIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.forest,
    marginRight: SPACING.sm,
  },
  changesIconText: {
    fontSize: 15,
  },
  changesCopy: {
    flex: 1,
    minWidth: 0,
  },
  changesTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 17,
    color: COLORS.ink,
  },
  changesDescription: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.muted,
    marginTop: 1,
  },
  chevron: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 25,
    color: COLORS.dim,
    marginLeft: SPACING.sm,
  },
});
