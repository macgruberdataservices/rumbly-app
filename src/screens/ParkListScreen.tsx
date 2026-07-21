import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BrowseStackParamList } from '../navigation/browseTypes';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants, groupWaterParkRestaurants, WATER_PARKS_GROUP_KEY } from '../data/groups';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<BrowseStackParamList, 'LocationList'>;

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
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            onPress={() => navigation.navigate('RestaurantList', { groupKey: item.key, groupLabel: item.label })}
          >
            <Text style={text.sectionTitle}>{item.label}</Text>
            <Text style={text.bodyMuted}>{item.restaurants.length} restaurants</Text>
          </Pressable>
        )}
      />
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
    fontSize: 24,
    color: COLORS.ink,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  tile: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tilePressed: {
    opacity: 0.6,
  },
});
