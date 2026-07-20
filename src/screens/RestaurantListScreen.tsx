import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants } from '../data/groups';
import { RestaurantCard } from '../components/RestaurantCard';
import { distanceToRestaurant } from '../location/proximity';
import { COLORS, SPACING } from '../theme/tokens';

type Props = NativeStackScreenProps<FindStackParamList, 'RestaurantList'>;

export function RestaurantListScreen({ route, navigation }: Props) {
  const { restaurants } = useDataProvider();
  const origin = route.params.nearMeOrigin ?? null;
  const group = groupRestaurants(restaurants, origin).find((g) => g.key === route.params.groupKey);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={group?.restaurants ?? []}
        keyExtractor={(r) => r.restaurant_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <RestaurantCard
            restaurant={item}
            distanceMiles={distanceToRestaurant(origin, item)}
            onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: item.restaurant_id })}
          />
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
});
