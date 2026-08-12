import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ExploreStackParamList } from '../navigation/ExploreNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import type { MenuItem } from '../data/types';
import { DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<ExploreStackParamList, 'TicketedEvent'>;

// title/subtitle/items travel through route params fully formed, same
// pattern ChangesCategoryScreen already uses -- the list of items is
// small (registry-scoped, not the whole catalog) and this way there's no
// second query here at all, just grouping what Explore already fetched.
export function TicketedEventScreen({ navigation, route }: Props) {
  const { title, subtitle, items } = route.params;
  const { restaurants } = useDataProvider();

  const rows = useMemo(() => {
    const byRestaurant = new Map<string, MenuItem[]>();
    for (const item of items) {
      const list = byRestaurant.get(item.restaurant_id);
      if (list) list.push(item);
      else byRestaurant.set(item.restaurant_id, [item]);
    }
    return [...byRestaurant.entries()]
      .map(([restaurantId, restaurantItems]) => ({
        restaurantId,
        restaurantName:
          restaurants.find((r) => r.restaurant_id === restaurantId)?.restaurant ?? restaurantId,
        items: restaurantItems,
      }))
      .sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
  }, [items, restaurants]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Text style={text.bodyMuted}>{subtitle}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {rows.map(({ restaurantId, restaurantName, items: restaurantItems }) => (
          <Pressable
            key={restaurantId}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${restaurantName}, ${restaurantItems.length} ${restaurantItems.length === 1 ? 'item' : 'items'}`}
            onPress={() =>
              navigation.navigate('RestaurantDetail', {
                restaurantId,
                itemId: restaurantItems[0].item_id,
                period: restaurantItems[0].dining_period,
                category: restaurantItems[0].category,
              })
            }
          >
            <View style={styles.rowLeft}>
              <Text style={text.restaurantName} numberOfLines={1}>
                {restaurantName}
              </Text>
              <Text style={text.bodyMuted}>
                {restaurantItems.length} {restaurantItems.length === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
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
    backgroundColor: '#F8E5B9',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
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
    fontSize: 31,
    lineHeight: 34,
    color: DAYLIGHT.ink,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: '#FFFFFF',
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  chevron: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 25,
    color: DAYLIGHT.ocean,
  },
});
