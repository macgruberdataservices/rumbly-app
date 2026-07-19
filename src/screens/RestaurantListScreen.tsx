import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants } from '../data/groups';
import { RestaurantCard } from '../components/RestaurantCard';
import { COLORS, SPACING } from '../theme/tokens';

type Props = NativeStackScreenProps<FindStackParamList, 'RestaurantList'>;

export function RestaurantListScreen({ route }: Props) {
  const { restaurants } = useDataProvider();
  const group = groupRestaurants(restaurants).find((g) => g.key === route.params.groupKey);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={group?.restaurants ?? []}
        keyExtractor={(r) => r.restaurant_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          // Milestone 3 wires this onPress to RestaurantDetail (route
          // already exists on FindStackParamList, screen doesn't yet).
          <RestaurantCard restaurant={item} onPress={() => {}} />
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
