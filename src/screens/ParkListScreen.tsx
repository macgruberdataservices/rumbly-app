import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants } from '../data/groups';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<FindStackParamList, 'LocationList'>;

export function ParkListScreen({ navigation }: Props) {
  const { restaurants } = useDataProvider();
  const groups = groupRestaurants(restaurants);

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
