import { useLayoutEffect, useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
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

  useLayoutEffect(() => {
    navigation.setOptions({ title: parentGroupLabel ?? 'Explore by Location' });
  }, [navigation, parentGroupLabel]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
  list: {
    padding: SPACING.lg,
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
