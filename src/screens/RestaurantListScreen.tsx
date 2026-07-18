import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants } from '../data/groups';
import { RestaurantCard } from '../components/RestaurantCard';
import { COLORS, SPACING } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'RestaurantList'>;

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
          // Milestone 2 wires this onPress to a restaurant detail/menu
          // screen (RootStackParamList doesn't have that route yet).
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
