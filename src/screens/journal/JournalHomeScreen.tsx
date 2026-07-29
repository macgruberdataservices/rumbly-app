import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountAuthPanel } from '../../components/settings/AccountAuthPanel';
import { JournalEntryCard } from '../../components/journal/JournalEntryCard';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { groupJournalEntriesByPlace, sortJournalEntries } from '../../data/journalReadModel';
import type { JournalEntry } from '../../data/journal';
import { useActivity } from '../../hooks/useActivity';
import { useAuth } from '../../hooks/useAuth';
import { useJournal } from '../../hooks/useJournal';
import { useJournalComposer } from '../../hooks/useJournalComposer';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalHome'>;
type JournalMode = 'places' | 'timeline';

export function JournalHomeScreen({ navigation }: Props) {
  const { user, initializing } = useAuth();
  const { personalActivity } = useActivity();
  const { entries, error, isJournalEnabled, latestDraft, loading, reloadJournal } = useJournal();
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
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.eyebrow}>PRIVATE TO YOUR ACCOUNT</Text>
            <Text style={styles.title}>Journal</Text>
          </View>
          <Pressable
            style={styles.addButton}
            onPress={() => openJournalComposer()}
            accessibilityRole="button"
            accessibilityLabel="Add Journal entry"
          >
            <Text style={styles.addButtonLabel}>＋</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>The meals, places, and details you want to remember.</Text>
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
                navigation.navigate('JournalPageDetail', {
                  restaurantId: item.restaurantId,
                  itemId: item.itemId ?? undefined,
                })
              }
            >
              <JournalEntryCard entry={item} rating={ratings.get(item.clientId) ?? null} />
            </Pressable>
          )}
          ListEmptyComponent={<JournalEmptyState />}
        />
      ) : (
        <FlatList
          data={places}
          key="places"
          keyExtractor={(place) => place.restaurantId}
          contentContainerStyle={[styles.listContent, isEmpty && styles.emptyList]}
          ItemSeparatorComponent={ListSeparator}
          renderItem={({ item: place }) => (
            <View style={styles.placeCard}>
              <Pressable
                style={styles.placeHeader}
                onPress={() =>
                  navigation.navigate('JournalPageDetail', {
                    restaurantId: place.restaurantId,
                  })
                }
                accessibilityRole="button"
              >
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
          ListEmptyComponent={<JournalEmptyState />}
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

function JournalEmptyState() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Your Journal is ready</Text>
      <Text style={styles.emptyBody}>
        Your saved dining memories will appear here, organized by place and visit date.
      </Text>
    </View>
  );
}

function ListSeparator() {
  return <View style={{ height: SPACING.md }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  titleCopy: { flex: 1 },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.pine,
  },
  addButtonLabel: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 27,
    lineHeight: 30,
    color: COLORS.ink,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: COLORS.muted,
    marginBottom: SPACING.xs,
  },
  title: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 34,
    lineHeight: 40,
    color: COLORS.ink,
  },
  subtitle: {
    ...text.bodyMuted,
    marginTop: SPACING.xs,
    maxWidth: 360,
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: 3,
    borderRadius: RADII.md,
    backgroundColor: COLORS.pineLight,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.md,
    backgroundColor: COLORS.goldLight,
  },
  draftCopy: { flex: 1, gap: 2 },
  draftTitle: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 14,
    color: COLORS.ink,
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
  },
  modeButtonSelected: {
    backgroundColor: COLORS.surface,
  },
  modeLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.muted,
  },
  modeLabelSelected: { color: COLORS.ink },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  emptyList: { flexGrow: 1 },
  placeCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  placeHeaderCopy: { flex: 1, gap: 2 },
  placeName: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 20,
    color: COLORS.ink,
  },
  chevron: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 30,
    color: COLORS.forest,
  },
  itemRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  itemRowCopy: { flex: 1, gap: 2 },
  itemName: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 15,
    color: COLORS.ink,
  },
  smallChevron: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 24,
    color: COLORS.dim,
  },
  rowPressed: { opacity: 0.65 },
  generalVisits: {
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  emptyState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 22,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  emptyBody: {
    ...text.bodyMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  error: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: COLORS.gold,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
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
    color: COLORS.muted,
    marginTop: SPACING.sm,
    maxWidth: 420,
  },
  authCard: {
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
});
