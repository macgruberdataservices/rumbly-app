import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FindStackParamList } from '../navigation/FindNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { groupRestaurants } from '../data/groups';
import { formatRelative } from '../components/SyncStatusBar';
import { LoadingScreen } from '../components/LoadingScreen';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<FindStackParamList, 'FindHome'>;

// Milestone 2: default Find state per the search behavior spec — search
// input and quick filters are visually present but inert (live search is
// Milestone 5; Near Me/Open Now/Filters are Milestone 6). Location pills
// are real now, reusing the same groupRestaurants()/RestaurantList flow
// that the old standalone "Browse by Park" button used.
export function FindHomeScreen({ navigation }: Props) {
  const { restaurants, isLoading, error, lastSyncedAt, forceRefresh } = useDataProvider();

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/rumbly-wordmark.png')}
          style={styles.wordmark}
          resizeMode="contain"
          accessibilityLabel="Rumbly"
        />
        <Text style={text.bodyMuted}>Updated {formatRelative(lastSyncedAt)}</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search food, drinks, or restaurants"
          placeholderTextColor={COLORS.muted}
          editable={false}
          // Live search lands in Milestone 5 — this input is a structural
          // placeholder so the Find layout matches the spec now.
        />
      </View>

      <View style={styles.quickFilterRow}>
        {['Near Me', 'Open Now', 'Filters'].map((label) => (
          <View key={label} style={styles.quickFilterChip}>
            <Text style={text.chip}>{label}</Text>
          </View>
        ))}
      </View>

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
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  searchInput: {
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
  errorText: {
    margin: SPACING.xl,
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'center',
  },
});
