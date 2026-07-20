import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { useSearch } from '../hooks/useSearch';
import { groupRestaurants } from '../data/groups';
import { formatRelative } from '../components/SyncStatusBar';
import { LoadingScreen } from '../components/LoadingScreen';
import { RestaurantCard } from '../components/RestaurantCard';
import { ItemResultRow } from '../components/search/ItemResultRow';
import { RelatedResultRow } from '../components/search/RelatedResultRow';
import type { SearchResult } from '../search/rank';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;

function resultKey(r: SearchResult): string {
  if (r.kind === 'restaurant') return `restaurant:${r.restaurant.restaurant_id}`;
  if (r.kind === 'item') return `item:${r.item.restaurant_id}:${r.item.item_id}`;
  return `related:${r.tag.kind}:${r.tag.value}`;
}

// Milestone 2 shipped this screen with search visually present but inert
// ("Live search is Milestone 5"). This is that wiring: a live, debounced,
// offline-only search over restaurants + the search index, tap-through
// into the Milestone 3 detail screen with correct meal-period/category
// targeting. Full visual treatment (category strip with counts,
// matched-term emphasis, quick filters, sort, state restoration) is
// Milestone 6/7 — see Docs/ROADMAP.md.
export function FindHomeScreen({ navigation }: Props) {
  const { restaurants, isLoading, error, lastSyncedAt, forceRefresh } = useDataProvider();
  const { query, setQuery, results, isSearchActive, activeRelated, toggleRelated, clear } = useSearch(restaurants);

  if (isLoading && restaurants.length === 0) {
    return <LoadingScreen label="Fetching the latest dining data…" />;
  }

  if (error && restaurants.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Text style={[text.body, styles.errorText]}>Couldn't load dining data: {error}</Text>
        <Pressable onPress={forceRefresh} style={styles.retryButton}>
          <Text style={text.buttonLabel}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const groups = groupRestaurants(restaurants);

  const renderResult = ({ item: r }: { item: SearchResult }) => {
    if (r.kind === 'restaurant') {
      return (
        <RestaurantCard
          restaurant={r.restaurant}
          onPress={() => navigation.navigate('RestaurantDetail', { restaurantId: r.restaurant.restaurant_id })}
        />
      );
    }
    if (r.kind === 'item') {
      return (
        <ItemResultRow
          item={r.item}
          restaurant={r.restaurant}
          onPress={() =>
            navigation.navigate('RestaurantDetail', {
              restaurantId: r.item.restaurant_id,
              itemId: r.item.item_id,
              period: r.item.dining_period,
              category: r.item.category,
            })
          }
        />
      );
    }
    return (
      <RelatedResultRow
        tag={r.tag}
        active={!!activeRelated && activeRelated.kind === r.tag.kind && activeRelated.value === r.tag.value}
        onPress={() => toggleRelated(r.tag)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {!isSearchActive && (
        <View style={styles.header}>
          <Image
            source={require('../../assets/rumbly-wordmark.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="Rumbly"
          />
          <Text style={text.bodyMuted}>Updated {formatRelative(lastSyncedAt)}</Text>
        </View>
      )}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search food, drinks, or restaurants"
          placeholderTextColor={COLORS.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          accessibilityLabel="Search food, drinks, or restaurants"
          returnKeyType="search"
        />
        {isSearchActive && (
          <Pressable onPress={clear} accessibilityLabel="Clear search" style={styles.clearButton}>
            <Text style={text.chip}>×</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.quickFilterRow}>
        {['Near Me', 'Open Now', 'Filters'].map((label) => (
          <View key={label} style={styles.quickFilterChip}>
            <Text style={text.chip}>{label}</Text>
          </View>
        ))}
      </View>

      {isSearchActive ? (
        results.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={text.body}>No matches for "{query}".</Text>
            <Text style={[text.bodyMuted, styles.noResultsHint]}>Check spelling or try a broader term.</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={resultKey}
            renderItem={renderResult}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[text.sectionTitle, styles.sectionTitle]}>Browse by location</Text>
          <View style={styles.pillWrap}>
            {groups.map((group) => (
              <Pressable
                key={group.key}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                onPress={() => navigation.navigate('RestaurantList', { groupKey: group.key, groupLabel: group.label })}
              >
                <Text style={text.chip}>{group.label}</Text>
                <Text style={text.bodyMuted}>{group.restaurants.length}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  // Source asset is 336x137 (~2.45:1) — height-constrained, width follows
  // via resizeMode="contain" so it never distorts.
  wordmark: {
    width: 88,
    height: 36,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.cream,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontFamily: text.body.fontFamily,
    fontSize: 15,
    color: COLORS.ink,
  },
  clearButton: {
    paddingHorizontal: SPACING.xs,
  },
  quickFilterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  quickFilterChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    opacity: 0.5,
  },
  content: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    marginBottom: SPACING.md,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  pillPressed: {
    opacity: 0.6,
  },
  noResults: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  noResultsHint: {
    marginTop: SPACING.xs,
  },
  errorText: {
    margin: SPACING.xl,
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'center',
  },
});
