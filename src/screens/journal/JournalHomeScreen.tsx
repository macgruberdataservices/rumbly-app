import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountAuthPanel } from '../../components/settings/AccountAuthPanel';
import { JournalEntryCard } from '../../components/journal/JournalEntryCard';
import { IllustrationSlot } from '../../components/illustrations/IllustrationSlot';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { groupJournalEntriesByPlace, sortJournalEntries } from '../../data/journalReadModel';
import type { JournalEntry } from '../../data/journal';
import { listLocalJournalOutbox } from '../../data/journalStore';
import { useActivity } from '../../hooks/useActivity';
import { useAuth } from '../../hooks/useAuth';
import { useJournal } from '../../hooks/useJournal';
import { useJournalComposer } from '../../hooks/useJournalComposer';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalHome'>;
type JournalMode = 'places' | 'timeline';

const PLACE_TINTS = ['#DCEFF3', '#FFE3D8', '#FFF0BD', '#DCEFE6'] as const;

export function JournalHomeScreen({ navigation }: Props) {
  const { user, initializing } = useAuth();
  const { personalActivity } = useActivity();
  const {
    entries,
    error,
    failedSyncCount,
    isJournalEnabled,
    latestDraft,
    loading,
    photos,
    reloadJournal,
    retrySync,
  } = useJournal();
  const [retrying, setRetrying] = useState(false);
  const [mode, setMode] = useState<JournalMode>('places');
  const openJournalComposer = useJournalComposer();
  const timeline = useMemo(() => sortJournalEntries(entries), [entries]);
  const places = useMemo(() => groupJournalEntriesByPlace(entries), [entries]);
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
      if (user && isJournalEnabled) {
        reloadJournal().catch(() => {});
      }
    }, [isJournalEnabled, reloadJournal, user])
  );

  if (initializing || loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <JournalGate
        title="Your private dining Journal"
        body="Sign in to keep personal notes and dining memories tied to your account."
      >
        <AccountAuthPanel supportingText="Sign in or create an account to open your private Journal." />
      </JournalGate>
    );
  }

  if (!isJournalEnabled) {
    return (
      <JournalGate
        title="Journal is not enabled yet"
        body="This private feature is being introduced account by account. Your existing activity is unchanged."
      />
    );
  }

  const isEmpty = entries.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.heroShell}>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>YOUR PRIVATE PARK-DAY STORY</Text>
            <Text style={styles.heroTitle}>Journal</Text>
            <Text style={styles.heroBody}>Keep the meals, places, and little details worth remembering.</Text>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              onPress={() => openJournalComposer()}
              accessibilityRole="button"
              accessibilityLabel="Add Journal entry"
            >
              <Text style={styles.addButtonLabel}>Add a memory</Text>
              <Text style={styles.addButtonPlus}>＋</Text>
            </Pressable>
          </View>
          <IllustrationSlot
            tagId="journal.hero.memory-book.v1"
            variant="artwork"
            style={styles.heroArt}
          />
        </View>
        <View style={styles.heroFooter}>
          <View style={styles.heroStats}>
            <JournalStat value={entries.length} label="memories" />
            <JournalStat value={places.length} label="places" />
            <JournalStat value={photos.length} label="photos" />
          </View>
          <Pressable
            style={styles.storageButton}
            onPress={() => navigation.navigate('JournalStorageSettings')}
            accessibilityRole="button"
          >
            <Text style={styles.storageLink}>Storage ›</Text>
          </Pressable>
        </View>
      </View>

      {latestDraft && (
        <Pressable
          style={styles.draftBanner}
          onPress={() => openJournalComposer({ draftId: latestDraft.id })}
          accessibilityRole="button"
        >
          <View style={styles.draftCopy}>
            <Text style={styles.draftTitle}>Continue your draft</Text>
            <Text style={text.bodyMuted} numberOfLines={1}>
              {latestDraft.itemNameSnapshot ?? latestDraft.restaurantNameSnapshot}
            </Text>
          </View>
          <Text style={styles.smallChevron}>›</Text>
        </Pressable>
      )}

      <View style={styles.segmented} accessibilityRole="tablist">
        <ModeButton label="By Place" selected={mode === 'places'} onPress={() => setMode('places')} />
        <ModeButton label="Timeline" selected={mode === 'timeline'} onPress={() => setMode('timeline')} />
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      {failedSyncCount > 0 && (
        <Pressable
          style={styles.syncBanner}
          disabled={retrying}
          onPress={async () => {
            if (!user) return;
            const outbox = await listLocalJournalOutbox(user.id);
            const failed = outbox.filter((operation) => operation.state === 'failed');
            const detail = failed
              .map((operation) => `${operation.operationType} (${operation.entityType} ${operation.entityId}):\n${operation.lastError ?? 'unknown error'}`)
              .join('\n\n');
            Alert.alert(
              `${failed.length} Journal ${failed.length === 1 ? 'item' : 'items'} couldn't sync`,
              detail || 'No details available.',
              [
                { text: 'Dismiss', style: 'cancel' },
                {
                  text: 'Retry now',
                  onPress: () => {
                    setRetrying(true);
                    retrySync().finally(() => setRetrying(false));
                  },
                },
              ]
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Show Journal sync errors and retry"
        >
          <Text style={styles.syncBannerText}>
            {retrying
              ? 'Retrying sync…'
              : `${failedSyncCount} ${failedSyncCount === 1 ? 'entry' : 'entries'} couldn't sync — Tap for details`}
          </Text>
        </Pressable>
      )}

      {mode === 'timeline' ? (
        <FlatList
          data={timeline}
          key="timeline"
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={[styles.listContent, isEmpty && styles.emptyList]}
          ItemSeparatorComponent={ListSeparator}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('JournalEntryDetail', { entryId: item.id })
              }
              accessibilityRole="button"
              accessibilityLabel="View Journal entry"
            >
              <JournalEntryCard
                entry={item}
                rating={ratings.get(item.clientId) ?? null}
                photos={photosByEntry.get(item.id)}
              />
            </Pressable>
          )}
          ListEmptyComponent={<JournalEmptyState onAdd={() => openJournalComposer()} />}
        />
      ) : (
        <FlatList
          data={places}
          key="places"
          keyExtractor={(place) => place.restaurantId}
          contentContainerStyle={[styles.listContent, isEmpty && styles.emptyList]}
          ItemSeparatorComponent={ListSeparator}
          renderItem={({ item: place, index }) => (
            <View style={styles.placeCard}>
              <Pressable
                style={[styles.placeHeader, { backgroundColor: PLACE_TINTS[index % PLACE_TINTS.length] }]}
                onPress={() =>
                  navigation.navigate('JournalPageDetail', {
                    restaurantId: place.restaurantId,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${place.restaurantName}, ${place.entries.length} ${place.entries.length === 1 ? 'entry' : 'entries'}`}
              >
                <View style={styles.placeMark}>
                  <Text style={styles.placeMarkText}>{place.restaurantName.slice(0, 1).toLocaleUpperCase()}</Text>
                </View>
                <View style={styles.placeHeaderCopy}>
                  <Text style={styles.placeName}>{place.restaurantName}</Text>
                  <Text style={text.bodyMuted}>
                    {place.entries.length} {place.entries.length === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              {place.itemGroups.map((itemGroup) => (
                <Pressable
                  key={itemGroup.key}
                  style={({ pressed }) => [styles.itemRow, pressed && styles.rowPressed]}
                  onPress={() =>
                    navigation.navigate('JournalPageDetail', {
                      restaurantId: itemGroup.restaurantId,
                      itemId: itemGroup.itemId,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${itemGroup.itemName}, ${itemGroup.entries.length} ${itemGroup.entries.length === 1 ? 'visit' : 'visits'}`}
                >
                  <View style={styles.itemRowCopy}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {itemGroup.itemName}
                    </Text>
                    <Text style={text.bodyMuted}>
                      {itemGroup.entries.length} {itemGroup.entries.length === 1 ? 'visit' : 'visits'}
                    </Text>
                  </View>
                  <Text style={styles.smallChevron}>›</Text>
                </Pressable>
              ))}

              {place.restaurantEntries.length > 0 && (
                <View style={styles.generalVisits}>
                  <Text style={text.bodyMuted}>
                    {place.restaurantEntries.length} general{' '}
                    {place.restaurantEntries.length === 1 ? 'visit' : 'visits'}
                  </Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={<JournalEmptyState onAdd={() => openJournalComposer()} />}
        />
      )}
    </SafeAreaView>
  );
}

function JournalGate({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.gateContent}>
        <Text style={styles.eyebrow}>JOURNAL</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.gateBody}>{body}</Text>
        {children && <View style={styles.authCard}>{children}</View>}
      </View>
    </SafeAreaView>
  );
}

function ModeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.modeButton, selected && styles.modeButtonSelected]}
    >
      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function JournalEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.emptyState}>
      <IllustrationSlot
        tagId="journal.state.empty.v1"
        variant="artwork"
        style={styles.emptyArt}
      />
      <Text style={styles.emptyTitle}>Your Journal is ready</Text>
      <Text style={styles.emptyBody}>
        Start with one meal, one photo, or one detail you do not want the park day to blur past.
      </Text>
      <Pressable style={styles.emptyButton} onPress={onAdd} accessibilityRole="button">
        <Text style={styles.emptyButtonLabel}>Add your first memory</Text>
      </Pressable>
    </View>
  );
}

function JournalStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function ListSeparator() {
  return <View style={{ height: SPACING.md }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.paper },
  centered: { alignItems: 'center', justifyContent: 'center' },
  heroShell: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  hero: {
    minHeight: 210,
    overflow: 'hidden',
    flexDirection: 'row',
    borderRadius: 28,
    backgroundColor: DAYLIGHT.coral,
  },
  heroCopy: {
    zIndex: 1,
    width: '62%',
    justifyContent: 'center',
    padding: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  heroArt: {
    position: 'absolute',
    width: '43%',
    right: -4,
    top: 0,
    bottom: 0,
    minHeight: 210,
    borderRadius: 0,
  },
  heroEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.9,
    color: '#FFF4EA',
  },
  heroTitle: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 37,
    lineHeight: 42,
    color: DAYLIGHT.paper,
    marginTop: 2,
  },
  heroBody: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: '#FFF4EA',
    marginTop: SPACING.xs,
  },
  addButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 21,
    backgroundColor: DAYLIGHT.paper,
  },
  addButtonLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: DAYLIGHT.ocean,
  },
  addButtonPlus: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 19,
    lineHeight: 21,
    color: DAYLIGHT.coral,
  },
  addButtonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  heroStats: { flex: 1, flexDirection: 'row', gap: SPACING.lg },
  heroStat: { alignItems: 'flex-start' },
  heroStatValue: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 18,
    color: DAYLIGHT.ink,
  },
  heroStatLabel: {
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 9.5,
    color: DAYLIGHT.muted,
  },
  storageButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: SPACING.sm },
  storageLink: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: DAYLIGHT.ocean,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: DAYLIGHT.ocean,
    marginBottom: SPACING.xs,
  },
  title: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 34,
    lineHeight: 40,
    color: DAYLIGHT.ink,
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: 3,
    borderRadius: RADII.lg,
    backgroundColor: DAYLIGHT.sky,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: '#FFF0BD',
  },
  draftCopy: { flex: 1, gap: 2 },
  draftTitle: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 14,
    color: DAYLIGHT.ink,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.md,
  },
  modeButtonSelected: { backgroundColor: DAYLIGHT.ocean },
  modeLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: DAYLIGHT.muted,
  },
  modeLabelSelected: { color: COLORS.surface },
  listContent: { paddingHorizontal: SPACING.lg, paddingBottom: 130 },
  emptyList: { flexGrow: 1 },
  placeCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
    shadowColor: DAYLIGHT.ink,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  placeHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg },
  placeMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.76)',
    transform: [{ rotate: '-3deg' }],
  },
  placeMarkText: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 19,
    color: DAYLIGHT.ocean,
  },
  placeHeaderCopy: { flex: 1, gap: 2 },
  placeName: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 20,
    color: DAYLIGHT.ink,
  },
  chevron: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 30,
    color: DAYLIGHT.ocean,
  },
  itemRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DAYLIGHT.border,
  },
  itemRowCopy: { flex: 1, gap: 2 },
  itemName: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 15,
    color: DAYLIGHT.ink,
  },
  smallChevron: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 24,
    color: DAYLIGHT.muted,
  },
  rowPressed: { opacity: 0.65 },
  generalVisits: {
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DAYLIGHT.border,
  },
  emptyState: {
    flex: 1,
    minHeight: 410,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyArt: {
    width: '100%',
    maxWidth: 290,
    minHeight: 170,
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 24,
    color: DAYLIGHT.ink,
    marginBottom: SPACING.sm,
  },
  emptyBody: { ...text.bodyMuted, textAlign: 'center', lineHeight: 19 },
  emptyButton: {
    minHeight: 46,
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderRadius: 23,
    backgroundColor: DAYLIGHT.ocean,
  },
  emptyButtonLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12.5,
    color: COLORS.surface,
  },
  error: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: DAYLIGHT.coral,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  syncBanner: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.lg,
    backgroundColor: '#FFF0BD',
  },
  syncBannerText: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: DAYLIGHT.ink,
  },
  gateContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: 80,
  },
  gateBody: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    lineHeight: 22,
    color: DAYLIGHT.muted,
    marginTop: SPACING.sm,
    maxWidth: 420,
  },
  authCard: {
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    backgroundColor: COLORS.surface,
  },
});
