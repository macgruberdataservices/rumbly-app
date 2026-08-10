import { useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JournalEntryCard } from '../../components/journal/JournalEntryCard';
import { SettingsScreenHeader } from '../../components/settings/SettingsScreenHeader';
import { entriesForJournalPage } from '../../data/journalReadModel';
import { useActivity } from '../../hooks/useActivity';
import { useJournal } from '../../hooks/useJournal';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalPageDetail'>;

export function JournalPageDetailScreen({ navigation, route }: Props) {
  const { restaurantId, itemId } = route.params;
  const { personalActivity } = useActivity();
  const { entries, loading, photos, reloadJournal } = useJournal();
  const isFocused = useIsFocused();
  const pageEntries = useMemo(
    () => entriesForJournalPage(entries, restaurantId, itemId),
    [entries, itemId, restaurantId]
  );
  const ratings = useMemo(
    () =>
      new Map(
        personalActivity.gotItHistory.map((event) => [event.clientId, event.rating] as const)
      ),
    [personalActivity.gotItHistory]
  );
  const photosByEntry = useMemo(() => {
    const result = new Map<string, typeof photos>();
    for (const photo of photos) {
      const entryPhotos = result.get(photo.entryId) ?? [];
      entryPhotos.push(photo);
      result.set(photo.entryId, entryPhotos);
    }
    return result;
  }, [photos]);

  useFocusEffect(
    useCallback(() => {
      reloadJournal().catch(() => {});
    }, [reloadJournal])
  );

  // Every real navigation into this page comes from a By Place / item
  // grouping that only exists because it has entries -- there's no
  // legitimate way to land here with zero entries except deleting the
  // last one for this restaurant/item while already here (most often
  // cascading back from JournalEntryDetail's own same fix, after deleting
  // from the composer). Rather than showing the genuinely pointless empty
  // state in that case, navigate away same as that screen does. Gated on
  // isFocused for the same reason: entries can update while this screen
  // is mounted but hidden underneath EntryDetail/the composer, and an
  // unguarded goBack() here would race their own dismissal.
  useEffect(() => {
    if (isFocused && !loading && pageEntries.length === 0) {
      navigation.goBack();
    }
  }, [isFocused, loading, navigation, pageEntries.length]);

  const latest = pageEntries[0];
  const title = itemId
    ? latest?.itemNameSnapshot ?? 'Menu item'
    : latest?.restaurantNameSnapshot ?? 'Restaurant';
  const subtitle = itemId ? latest?.restaurantNameSnapshot : undefined;

  if (loading && pageEntries.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title={title} onBack={() => navigation.goBack()} />
      <View style={styles.pageHeading}>
        {!!subtitle && <Text style={styles.restaurantName}>{subtitle}</Text>}
        <Text style={text.bodyMuted}>
          {pageEntries.length} {pageEntries.length === 1 ? 'Journal entry' : 'Journal entries'}
          {itemId ? ' across every menu and meal period' : ' at this place'}
        </Text>
      </View>
      <FlatList
        data={pageEntries}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={[
          styles.listContent,
          pageEntries.length === 0 && styles.emptyList,
        ]}
        ItemSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('JournalEntryDetail', { entryId: item.id })}
            accessibilityRole="button"
            accessibilityLabel="View Journal entry"
          >
            <JournalEntryCard
              entry={item}
              rating={ratings.get(item.clientId) ?? null}
              showTarget={!itemId}
              photos={photosByEntry.get(item.id)}
            />
            <Text style={styles.viewLabel}>View entry</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Journal entries here yet</Text>
            <Text style={styles.emptyBody}>Your saved dining history will appear on this page.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  centered: { alignItems: 'center', justifyContent: 'center' },
  pageHeading: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
    gap: SPACING.xs,
  },
  restaurantName: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 120,
  },
  emptyList: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 21,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  emptyBody: {
    ...text.bodyMuted,
    textAlign: 'center',
  },
  viewLabel: {
    marginTop: SPACING.xs,
    marginRight: SPACING.sm,
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: DAYLIGHT.ocean,
    textAlign: 'right',
  },
});
