import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BrowseStackParamList } from '../navigation/browseTypes';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants, groupWaterParkRestaurants, WATER_PARKS_GROUP_KEY } from '../data/groups';
import { DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<BrowseStackParamList, 'LocationList'>;

const PARK_TINTS = [DAYLIGHT.sky, '#F8E5B9', '#F3D4C9', '#D8EEE4'];
const PARK_MARKS = [DAYLIGHT.ocean, DAYLIGHT.sun, DAYLIGHT.coral, DAYLIGHT.sage];

export function ParkListScreen({ navigation, route }: Props) {
  const { restaurants } = useDataProvider();
  const parentGroupKey = route.params?.parentGroupKey;
  const parentGroupLabel = route.params?.parentGroupLabel;
  const groups = useMemo(
    () =>
      parentGroupKey === WATER_PARKS_GROUP_KEY
        ? groupWaterParkRestaurants(restaurants)
        : groupRestaurants(restaurants),
    [parentGroupKey, restaurants]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{parentGroupLabel ?? 'Explore by Location'}</Text>
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.key}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Pressable
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: PARK_TINTS[index % PARK_TINTS.length] },
              pressed && styles.tilePressed,
            ]}
            onPress={() => navigation.navigate('RestaurantList', { groupKey: item.key, groupLabel: item.label })}
          >
            <View style={[styles.tileMark, { backgroundColor: PARK_MARKS[index % PARK_MARKS.length] }]}>
              <Text style={styles.tileNumber}>{String(index + 1).padStart(2, '0')}</Text>
            </View>
            <View style={styles.tileCopy}>
              <Text style={[text.sectionTitle, styles.tileTitle]}>{item.label}</Text>
              <Text style={text.bodyMuted}>{item.restaurants.length} restaurants</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DAYLIGHT.mist,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    backgroundColor: DAYLIGHT.sky,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 19,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 30,
    lineHeight: 33,
    color: DAYLIGHT.ink,
  },
  // No horizontal padding here -- tile carries its own, matching
  // RestaurantListScreen's SectionList/RestaurantCard convention (row
  // owns its own horizontal inset, container doesn't double it up).
  list: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  // Flat divider row, matching RestaurantCard/MenuItemRow/ItemResultRow's
  // convention (owner decision 2026-07-21) -- this screen previously kept
  // the pre-Milestone-13 bordered/rounded card look, which stood out next
  // to every other list in the app once those flattened.
  tile: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADII.xl,
    marginBottom: SPACING.md,
  },
  tilePressed: {
    opacity: 0.6,
  },
  tileMark: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    transform: [{ rotate: '-5deg' }],
  },
  tileNumber: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  tileCopy: { flex: 1, minWidth: 0 },
  tileTitle: { fontSize: 20, lineHeight: 23, marginBottom: 2 },
  chevron: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 30, color: DAYLIGHT.ocean, marginLeft: SPACING.sm },
});
