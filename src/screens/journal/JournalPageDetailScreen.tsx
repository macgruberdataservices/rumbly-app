import { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JournalEntryCard } from '../../components/journal/JournalEntryCard';
import { SettingsScreenHeader } from '../../components/settings/SettingsScreenHeader';
import { entriesForJournalPage } from '../../data/journalReadModel';
import { useActivity } from '../../hooks/useActivity';
import { useJournal } from '../../hooks/useJournal';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { COLORS, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalPageDetail'>;

export function JournalPageDetailScreen({ navigation, route }: Props) {
  const { restaurantId, itemId } = route.params;
  const { personalActivity } = useActivity();
  const { entries, loading, reloadJournal } = useJournal();
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

  useFocusEffect(
    useCallback(() => {
      reloadJournal().catch(() => {});
    }, [reloadJournal])
  );

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
          <JournalEntryCard
            entry={item}
            rating={ratings.get(item.clientId) ?? null}
            showTarget={!itemId}
          />
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
  container: { flex: 1, backgroundColor: COLORS.cream },
  centered: { alignItems: 'center', justifyContent: 'center' },
  pageHeading: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  restaurantName: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  emptyList: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 21,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  emptyBody: {
    ...text.bodyMuted,
    textAlign: 'center',
  },
});
