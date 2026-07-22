import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Dimensions, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BrowseStackParamList } from '../navigation/browseTypes';
import { useDataProvider } from '../hooks/useDataProvider';
import { findRestaurantGroup } from '../data/groups';
import { RestaurantCard } from '../components/RestaurantCard';
import { CategoryNavigator } from '../components/restaurant-detail/CategoryNavigator';
import { distanceToRestaurant } from '../location/proximity';
import type { Restaurant } from '../data/types';
import { areaDisplayName, isWaterPark, parkDisplayName } from '../data/locationNames';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<BrowseStackParamList, 'RestaurantList'>;

interface RestaurantSection {
  title: string;
  sectionIndex: number;
  data: Restaurant[];
}

const AREA_ORDER_BY_GROUP: Record<string, string[]> = {
  'Magic Kingdom Park': ['Adventureland', 'Frontierland', 'Liberty Square', 'Fantasyland', 'Tomorrowland', 'Main Street, U.S.A.', 'TTC'],
  EPCOT: ['Epcot Park Entrance', 'World Celebration', 'World Discovery', 'World Nature', 'World Showcase'],
  "Disney's Hollywood Studios": [
    'Hollywood Boulevard',
    'Echo Lake',
    'Grand Avenue',
    "Star Wars: Galaxy's Edge",
    'Toy Story Land',
    'Animation Courtyard',
    'Commissary Lane',
    'Sunset Boulevard',
  ],
  "Disney's Animal Kingdom Theme Park": [
    'Oasis',
    'Discovery Island',
    'Pandora - The World of Avatar',
    'Africa',
    'Asia',
    'DinoLand U.S.A.',
  ],
  'Disney Springs': ['Marketplace', 'The Landing', 'Town Center', 'West Side'],
};

function sectionTitleForRestaurant(groupKey: string, restaurant: Restaurant): string {
  if (groupKey === 'Disney Resorts') return restaurant.resort ?? 'Other Resorts';
  if (isWaterPark(groupKey)) return parkDisplayName(groupKey);
  if (restaurant.area) return areaDisplayName(restaurant.area);
  if (restaurant.resort) return restaurant.resort;
  return parkDisplayName(restaurant.park) || 'Other';
}

function sectionOrder(groupKey: string, title: string): number {
  if (groupKey === 'Disney Resorts') return Number.POSITIVE_INFINITY;
  const order = AREA_ORDER_BY_GROUP[groupKey];
  if (!order) return Number.POSITIVE_INFINITY;
  const index = order.indexOf(title);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function buildSections(groupKey: string, restaurants: Restaurant[]): RestaurantSection[] {
  const bySection = new Map<string, Restaurant[]>();
  for (const restaurant of restaurants) {
    const title = sectionTitleForRestaurant(groupKey, restaurant);
    const list = bySection.get(title);
    if (list) list.push(restaurant);
    else bySection.set(title, [restaurant]);
  }

  return Array.from(bySection.entries())
    .sort(([a], [b]) => {
      const aOrder = sectionOrder(groupKey, a);
      const bOrder = sectionOrder(groupKey, b);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.localeCompare(b);
    })
    .map(([title, sectionRestaurants], sectionIndex) => ({
      title,
      sectionIndex,
      data: sectionRestaurants.sort((a, b) => a.restaurant.localeCompare(b.restaurant)),
    }));
}

export function RestaurantListScreen({ route, navigation }: Props) {
  const { restaurants } = useDataProvider();
  const insets = useSafeAreaInsets();
  const origin = route.params.nearMeOrigin ?? null;
  const group = useMemo(
    () => findRestaurantGroup(restaurants, route.params.groupKey, origin),
    [restaurants, route.params.groupKey, origin]
  );
  const sections = useMemo(
    () => buildSections(route.params.groupKey, group?.restaurants ?? []),
    [group?.restaurants, route.params.groupKey]
  );
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isProgrammaticScrollRef = useRef(false);
  const clearProgrammaticGuardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionListRef = useRef<SectionList<Restaurant, RestaurantSection>>(null);
  const horizontalScrollRef = useRef<ScrollView>(null);
  const chipLayoutsRef = useRef<{ x: number; width: number }[]>([]);

  const scrollChipIntoView = useCallback((index: number) => {
    const chip = chipLayoutsRef.current[index];
    if (!chip) return;
    const screenWidth = Dimensions.get('window').width;
    const target = Math.max(0, chip.x - screenWidth / 2 + chip.width / 2);
    horizontalScrollRef.current?.scrollTo({ x: target, animated: true });
  }, []);

  const handleSectionPress = useCallback(
    (index: number) => {
      isProgrammaticScrollRef.current = true;
      activeIndexRef.current = index;
      setActiveSectionIndex(index);
      scrollChipIntoView(index);
      sectionListRef.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, animated: true });
      if (clearProgrammaticGuardTimeoutRef.current) {
        clearTimeout(clearProgrammaticGuardTimeoutRef.current);
      }
      clearProgrammaticGuardTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 600);
    },
    [scrollChipIntoView]
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ isViewable: boolean; section?: { sectionIndex?: number } }> }) => {
      if (isProgrammaticScrollRef.current) return;
      const firstViewable = viewableItems.find((item) => item.isViewable);
      const sectionIndex = firstViewable?.section?.sectionIndex;
      if (typeof sectionIndex === 'number' && sectionIndex !== activeIndexRef.current) {
        activeIndexRef.current = sectionIndex;
        setActiveSectionIndex(sectionIndex);
        scrollChipIntoView(sectionIndex);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 1, minimumViewTime: 50 }).current;

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveSectionIndex(0);
  }, [sections]);

  useEffect(
    () => () => {
      if (clearProgrammaticGuardTimeoutRef.current) {
        clearTimeout(clearProgrammaticGuardTimeoutRef.current);
      }
    },
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{route.params.groupLabel}</Text>
      </View>

      {sections.length > 0 && (
        <CategoryNavigator
          ref={horizontalScrollRef}
          categories={sections.map((section) => section.title)}
          activeIndex={activeSectionIndex}
          onPress={handleSectionPress}
          onChipLayout={(index, layout) => {
            chipLayoutsRef.current[index] = layout;
          }}
        />
      )}

      {sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={text.bodyMuted}>No restaurants found for this location.</Text>
        </View>
      ) : (
        <SectionList
          ref={sectionListRef}
          style={styles.sectionList}
          sections={sections}
          keyExtractor={(restaurant) => restaurant.restaurant_id}
          stickySectionHeadersEnabled={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScrollToIndexFailed={() => {
            setTimeout(() => {
              sectionListRef.current?.scrollToLocation({
                sectionIndex: activeIndexRef.current,
                itemIndex: 0,
                animated: false,
              });
            }, 100);
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={text.categoryHeader}>{section.title.toUpperCase()}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              distanceMiles={distanceToRestaurant(origin, item)}
              onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: item.restaurant_id })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  title: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 26,
    color: COLORS.ink,
  },
  sectionList: {
    flex: 1,
  },
  sectionHeader: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
});
