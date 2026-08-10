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
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import { useActivity } from '../hooks/useActivity';
import { useOpenAccountSettings } from '../hooks/useOpenAccountSettings';
import { useTicketedEvents } from '../hooks/useTicketedEvents';
import type { IllustrationTagId } from '../illustrations/catalog';

type Props = NativeStackScreenProps<ExploreStackParamList, 'ExploreHome'>;

const CARD_COLORS = ['#DCEFF3', '#FFE3D8', '#FFF0BD', '#DCEFE6'] as const;

function ExplorePromoCard({
  eyebrow,
  title,
  description,
  actionLabel,
  artworkTag,
  tone,
  icon,
  accessibilityLabel,
  onPress,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  artworkTag: IllustrationTagId;
  tone: 'updates' | 'exclusive';
  icon?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.promoCard,
        tone === 'updates' ? styles.promoCardUpdates : styles.promoCardExclusive,
        pressed && styles.promoCardPressed,
      ]}
      onPress={onPress}
    >
      <View pointerEvents="none" style={styles.promoArtworkWrap}>
        <IllustrationSlot tagId={artworkTag} variant="artwork" style={styles.promoArtwork} />
      </View>
      <View style={styles.promoCopy}>
        <View style={styles.promoEyebrowRow}>
          {icon && (
            <View style={styles.promoIconChip}>
              <Text style={styles.promoIcon}>{icon}</Text>
            </View>
          )}
          <Text style={styles.promoEyebrow}>{eyebrow}</Text>
        </View>
        <Text style={styles.promoTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.promoDescription} numberOfLines={2}>{description}</Text>
        <View style={styles.promoAction}>
          <Text style={styles.promoActionLabel}>{actionLabel}</Text>
          <Text style={styles.promoActionArrow}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}

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
            <ExplorePromoCard
              eyebrow="THE LATEST"
              title="Fresh from the parks"
              description="Menu updates, prices, openings & closures"
              actionLabel="See updates"
              artworkTag="changes.hero.whats-new.v1"
              tone="updates"
              accessibilityLabel="See what's new: menu updates, prices, openings and closures"
              onPress={() => navigation.navigate('ChangesHome')}
            />
          </View>
        )}

        {activeTicketedEvents.length > 0 && (
          <View style={styles.challengeSection}>
            <Text style={[text.sectionToggle, styles.sectionLabel]}>LIMITED-TIME FINDS</Text>
            {activeTicketedEvents.map((event) => (
              <ExplorePromoCard
                key={event.id}
                eyebrow="SPECIAL EVENT MENU"
                title={event.title}
                description={event.subtitle}
                actionLabel={`Browse ${event.items.length} ${event.items.length === 1 ? 'item' : 'items'}`}
                artworkTag="explore.editorial.exclusive-items.v1"
                tone="exclusive"
                icon={event.icon}
                accessibilityLabel={`${event.title}: ${event.subtitle}`}
                onPress={() =>
                  navigation.navigate('TicketedEvent', {
                    title: event.title,
                    subtitle: event.subtitle,
                    items: event.items,
                  })
                }
              />
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
  promoCard: {
    position: 'relative',
    minHeight: 164,
    overflow: 'hidden',
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(23, 40, 45, 0.07)',
  },
  promoCardUpdates: {
    backgroundColor: DAYLIGHT.sky,
  },
  promoCardExclusive: {
    backgroundColor: '#F8E5B9',
  },
  promoCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  promoCopy: {
    width: '66%',
    minHeight: 130,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  promoEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  promoEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1.05,
    color: DAYLIGHT.ocean,
  },
  promoIconChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.82)',
  },
  promoIcon: {
    fontSize: 13,
  },
  promoTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 21,
    lineHeight: 24,
    color: DAYLIGHT.ink,
  },
  promoDescription: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    lineHeight: 17,
    color: DAYLIGHT.muted,
    marginTop: SPACING.xs,
  },
  promoAction: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    borderRadius: 15,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(255, 253, 248, 0.88)',
  },
  promoActionLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    color: DAYLIGHT.ocean,
  },
  promoActionArrow: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 15,
    color: DAYLIGHT.coral,
  },
  promoArtworkWrap: {
    position: 'absolute',
    width: '40%',
    right: -8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  promoArtwork: {
    minHeight: 148,
    borderRadius: RADII.xl,
  },
});
