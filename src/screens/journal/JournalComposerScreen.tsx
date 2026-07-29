import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { JournalEntryDraft } from '../../data/journal';
import {
  dateFromVisitDate,
  formatVisitDateLong,
  visitDateFromDate,
} from '../../data/journalDate';
import { createJournalIdentifiers } from '../../data/journalIds';
import { isActionableMenuItem } from '../../data/isActionableMenuItem';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { useActivity } from '../../hooks/useActivity';
import { useAuth } from '../../hooks/useAuth';
import { useDataProvider } from '../../hooks/useDataProvider';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useJournal } from '../../hooks/useJournal';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { loadSearchIndex } from '../../search/searchIndexLoader';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalComposer'>;

type TargetResult =
  | { kind: 'restaurant'; key: string; restaurant: Restaurant }
  | {
      kind: 'item';
      key: string;
      item: SearchIndexEntry;
      restaurantName: string;
    };

const COMMON_MEAL_PERIODS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .trim();
}

export function JournalComposerScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const { restaurants } = useDataProvider();
  const { personalActivity } = useActivity();
  const ratingsEnabled = useEntitlement('ratings');
  const {
    createEntry,
    deleteEntry,
    discardDraft,
    entries,
    latestDraft,
    saveDraft,
    updateEntry,
  } = useJournal();
  const editingEntry = entries.find((entry) => entry.id === route.params?.entryId);
  const resumedDraft =
    latestDraft && latestDraft.id === route.params?.draftId ? latestDraft : null;
  const existingRating = editingEntry
    ? personalActivity.gotItHistory.find(
        (event) => event.clientId === editingEntry.clientId
      )?.rating ?? null
    : null;
  const [identifiers] = useState(() =>
    editingEntry
      ? { entryId: editingEntry.id, clientId: editingEntry.clientId }
      : resumedDraft
        ? { entryId: resumedDraft.id, clientId: resumedDraft.clientId }
        : createJournalIdentifiers()
  );
  const initial = editingEntry ?? resumedDraft;
  const [restaurantId, setRestaurantId] = useState(initial?.restaurantId ?? '');
  const [restaurantName, setRestaurantName] = useState(
    initial?.restaurantNameSnapshot ?? ''
  );
  const [itemId, setItemId] = useState<string | null>(initial?.itemId ?? null);
  const [itemName, setItemName] = useState<string | null>(
    initial?.itemNameSnapshot ?? null
  );
  const [visitedOn, setVisitedOn] = useState(
    initial?.visitedOn ?? visitDateFromDate(new Date())
  );
  const [mealPeriod, setMealPeriod] = useState<string | null>(
    initial?.mealPeriodSnapshot ?? route.params?.mealPeriodSnapshot ?? null
  );
  const [rating, setRating] = useState<number | null>(
    editingEntry ? existingRating : resumedDraft?.rating ?? null
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [items, setItems] = useState<SearchIndexEntry[]>([]);
  const [targetPickerVisible, setTargetPickerVisible] = useState(false);
  const [targetQuery, setTargetQuery] = useState('');
  const deferredTargetQuery = useDeferredValue(targetQuery);
  const [androidDateVisible, setAndroidDateVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>(
    resumedDraft ? 'saved' : 'idle'
  );
  const submittingRef = useRef(false);
  const draftSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const exitAllowedRef = useRef(false);
  const restaurantById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant])),
    [restaurants]
  );

  useEffect(() => {
    let cancelled = false;
    loadSearchIndex()
      .then((loadedItems) => {
        if (!cancelled) setItems(loadedItems.filter(isActionableMenuItem));
      })
      .catch((error) => console.warn('Journal target items failed to load:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRestaurant = restaurantById.get(restaurantId);
  const mealPeriods = useMemo(() => {
    const values = new Set(COMMON_MEAL_PERIODS);
    for (const value of selectedRestaurant?.meal_periods ?? []) {
      if (value.trim()) values.add(value.trim());
    }
    if (mealPeriod) values.add(mealPeriod);
    return [...values];
  }, [mealPeriod, selectedRestaurant]);

  const draft = useMemo<JournalEntryDraft | null>(() => {
    if (!user || !restaurantId || !restaurantName) return null;
    return {
      id: identifiers.entryId,
      userId: user.id,
      clientId: identifiers.clientId,
      restaurantId,
      itemId,
      restaurantNameSnapshot: restaurantName,
      itemNameSnapshot: itemName,
      visitedOn,
      mealPeriodSnapshot: mealPeriod,
      note: note.trim() || null,
      rating: ratingsEnabled
        ? rating
        : editingEntry
          ? existingRating
          : resumedDraft?.rating ?? null,
      photoIds: [],
      updatedAt: new Date().toISOString(),
    };
  }, [
    identifiers.clientId,
    identifiers.entryId,
    editingEntry,
    existingRating,
    itemId,
    itemName,
    mealPeriod,
    note,
    rating,
    ratingsEnabled,
    resumedDraft,
    restaurantId,
    restaurantName,
    user,
    visitedOn,
  ]);

  useEffect(() => {
    if (!draft || submitting) return;
    setDraftStatus('saving');
    const timeout = setTimeout(() => {
      if (submittingRef.current) return;
      const savePromise = saveDraft({ ...draft, updatedAt: new Date().toISOString() })
        .then(() => setDraftStatus('saved'))
        .catch((error) => {
          console.warn('Journal draft autosave failed:', error);
          setDraftStatus('idle');
        });
      draftSavePromiseRef.current = savePromise;
    }, 500);
    return () => clearTimeout(timeout);
  }, [draft, saveDraft, submitting]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (exitAllowedRef.current) return;
        event.preventDefault();
        submittingRef.current = true;
        const persistAndClose = async () => {
          await draftSavePromiseRef.current;
          if (draft) {
            await saveDraft({ ...draft, updatedAt: new Date().toISOString() });
          }
          exitAllowedRef.current = true;
          navigation.dispatch(event.data.action);
        };
        persistAndClose().catch((error) => {
          console.warn('Journal draft close save failed:', error);
          submittingRef.current = false;
          setSaveError('Your latest changes could not be saved as a draft.');
        });
      }),
    [draft, navigation, saveDraft]
  );

  const targetResults = useMemo<TargetResult[]>(() => {
    const query = normalize(deferredTargetQuery);
    const matchingRestaurants = restaurants
      .filter(
        (restaurant) =>
          restaurant.show_in_app &&
          (!query || normalize(restaurant.restaurant).includes(query))
      )
      .sort((left, right) => left.restaurant.localeCompare(right.restaurant))
      .slice(0, query ? 15 : 40)
      .map(
        (restaurant): TargetResult => ({
          kind: 'restaurant',
          key: `restaurant:${restaurant.restaurant_id}`,
          restaurant,
        })
      );
    if (query.length < 2) return matchingRestaurants;

    const matchingItems = items
      .filter((item) => {
        const itemRestaurant = restaurantById.get(item.restaurant_id);
        return (
          itemRestaurant?.show_in_app &&
          (normalize(item.item).includes(query) ||
            normalize(itemRestaurant.restaurant).includes(query))
        );
      })
      .slice(0, 30)
      .map(
        (item): TargetResult => ({
          kind: 'item',
          key: `item:${item.restaurant_id}:${item.item_id}`,
          item,
          restaurantName:
            restaurantById.get(item.restaurant_id)?.restaurant ?? 'Restaurant',
        })
      );
    return [...matchingRestaurants, ...matchingItems].slice(0, 40);
  }, [deferredTargetQuery, items, restaurantById, restaurants]);

  const chooseRestaurant = (restaurant: Restaurant) => {
    setRestaurantId(restaurant.restaurant_id);
    setRestaurantName(restaurant.restaurant);
    setItemId(null);
    setItemName(null);
    setMealPeriod(null);
    setTargetPickerVisible(false);
  };

  const chooseItem = (item: SearchIndexEntry, nextRestaurantName: string) => {
    setRestaurantId(item.restaurant_id);
    setRestaurantName(nextRestaurantName);
    setItemId(item.item_id);
    setItemName(item.item);
    setMealPeriod(item.dining_period || null);
    setTargetPickerVisible(false);
  };

  const handleSave = async () => {
    if (!user || !restaurantId || !restaurantName || submitting) {
      setSaveError('Choose a restaurant before saving.');
      return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    setSaveError(null);
    try {
      await draftSavePromiseRef.current;
      if (editingEntry) {
        await updateEntry({
          id: editingEntry.id,
          userId: user.id,
          visitedOn,
          mealPeriodSnapshot: mealPeriod,
          note: note.trim() || null,
          rating: ratingsEnabled ? rating : existingRating,
        });
      } else {
        await createEntry({
          id: identifiers.entryId,
          userId: user.id,
          clientId: identifiers.clientId,
          restaurantId,
          itemId,
          restaurantNameSnapshot: restaurantName,
          itemNameSnapshot: itemName,
          visitedOn,
          mealPeriodSnapshot: mealPeriod,
          note: note.trim() || null,
          rating: ratingsEnabled ? rating : null,
          photoIds: [],
        });
      }
      exitAllowedRef.current = true;
      navigation.goBack();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The Journal entry could not be saved.');
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleDelete = () => {
    if (!editingEntry || submitting) return;
    Alert.alert(
      'Delete Journal entry?',
      'Choose whether the linked Got It visit should remain in your activity history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Journal only',
          style: 'destructive',
          onPress: () => performDelete('journal_only'),
        },
        {
          text: 'Delete Journal and Got It',
          style: 'destructive',
          onPress: () => performDelete('journal_and_got_it'),
        },
      ]
    );
  };

  const performDelete = async (mode: 'journal_only' | 'journal_and_got_it') => {
    if (!editingEntry) return;
    setSubmitting(true);
    submittingRef.current = true;
    try {
      await draftSavePromiseRef.current;
      await deleteEntry(editingEntry.id, mode);
      exitAllowedRef.current = true;
      navigation.popToTop();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The entry could not be deleted.');
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleDiscardDraft = () => {
    Alert.alert('Discard this draft?', 'The unsaved note and visit details will be removed.', [
      { text: 'Keep draft', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          submittingRef.current = true;
          await draftSavePromiseRef.current;
          await discardDraft(identifiers.entryId);
          exitAllowedRef.current = true;
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelLabel}>Close</Text>
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>{editingEntry ? 'Edit entry' : 'New entry'}</Text>
            <Text style={styles.draftStatus}>
              {draftStatus === 'saving'
                ? 'Saving draft…'
                : draftStatus === 'saved'
                  ? 'Draft saved'
                  : 'Private Journal'}
            </Text>
          </View>
          <Pressable
            style={[styles.headerButton, styles.saveButton, submitting && styles.disabled]}
            onPress={handleSave}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.ink} />
            ) : (
              <Text style={styles.saveLabel}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ComposerSection title="What did you have?">
            <Pressable
              style={[styles.targetButton, editingEntry && styles.disabled]}
              disabled={!!editingEntry}
              onPress={() => {
                setTargetQuery('');
                setTargetPickerVisible(true);
              }}
            >
              {restaurantId ? (
                <View style={styles.targetCopy}>
                  <Text style={styles.targetTitle}>{itemName ?? restaurantName}</Text>
                  {!!itemName && <Text style={text.bodyMuted}>{restaurantName}</Text>}
                </View>
              ) : (
                <Text style={styles.placeholder}>Choose a restaurant or menu item</Text>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Text style={styles.helpText}>
              {editingEntry
                ? 'The target stays attached to its original Got It visit.'
                : 'A restaurant is required. Choosing a menu item is optional.'}
            </Text>
          </ComposerSection>

          <ComposerSection title="Visit date">
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{formatVisitDateLong(visitedOn)}</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={dateFromVisitDate(visitedOn)}
                  mode="date"
                  display="compact"
                  maximumDate={new Date()}
                  accentColor={COLORS.forest}
                  onValueChange={(_event, date) => setVisitedOn(visitDateFromDate(date))}
                />
              ) : (
                <Pressable
                  style={styles.changeDateButton}
                  onPress={() => setAndroidDateVisible(true)}
                >
                  <Text style={styles.changeDateLabel}>Change</Text>
                </Pressable>
              )}
            </View>
            {Platform.OS === 'android' && androidDateVisible && (
              <DateTimePicker
                value={dateFromVisitDate(visitedOn)}
                mode="date"
                presentation="dialog"
                maximumDate={new Date()}
                accentColor={COLORS.forest}
                onValueChange={(_event, date) => {
                  setVisitedOn(visitDateFromDate(date));
                  setAndroidDateVisible(false);
                }}
                onDismiss={() => setAndroidDateVisible(false)}
              />
            )}
          </ComposerSection>

          <ComposerSection title="Meal context" optional>
            <View style={styles.chips}>
              <MealChip label="None" selected={mealPeriod === null} onPress={() => setMealPeriod(null)} />
              {mealPeriods.map((period) => (
                <MealChip
                  key={period}
                  label={period}
                  selected={mealPeriod === period}
                  onPress={() => setMealPeriod(period)}
                />
              ))}
            </View>
          </ComposerSection>

          <ComposerSection title="Rating" optional>
            {ratingsEnabled ? (
              <>
                <View style={styles.ratingRow} accessibilityRole="radiogroup">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const selected = rating !== null && value <= rating;
                    return (
                      <Pressable
                        key={value}
                        style={styles.starButton}
                        onPress={() => setRating(value)}
                        accessibilityRole="radio"
                        accessibilityLabel={`${value} star${value === 1 ? '' : 's'}`}
                        accessibilityState={{ checked: rating === value }}
                      >
                        <Text style={[styles.star, selected && styles.starSelected]}>
                          {selected ? '★' : '☆'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {rating !== null && (
                  <Pressable onPress={() => setRating(null)}>
                    <Text style={styles.clearRating}>Clear rating</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Text style={styles.helpText}>Ratings are not enabled for this account.</Text>
            )}
          </ComposerSection>

          <ComposerSection title="Notes" optional>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={4000}
              textAlignVertical="top"
              placeholder="What stood out? Would you order it again?"
              placeholderTextColor={COLORS.dim}
            />
            <Text style={styles.characterCount}>{note.length}/4000</Text>
          </ComposerSection>

          {!!saveError && <Text style={styles.error}>{saveError}</Text>}

          {editingEntry ? (
            <Pressable style={styles.destructiveButton} onPress={handleDelete}>
              <Text style={styles.destructiveLabel}>Delete entry…</Text>
            </Pressable>
          ) : (
            draft && (
              <Pressable style={styles.discardButton} onPress={handleDiscardDraft}>
                <Text style={styles.discardLabel}>Discard draft</Text>
              </Pressable>
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={targetPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTargetPickerVisible(false)}
      >
        <SafeAreaView style={styles.pickerContainer} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Choose what to journal</Text>
            <Pressable onPress={() => setTargetPickerVisible(false)}>
              <Text style={styles.doneLabel}>Done</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.searchInput}
            value={targetQuery}
            onChangeText={setTargetQuery}
            placeholder="Search restaurants and menu items"
            placeholderTextColor={COLORS.dim}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <FlatList
            data={targetResults}
            keyExtractor={(result) => result.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.targetList}
            renderItem={({ item: result }) =>
              result.kind === 'restaurant' ? (
                <TargetRow
                  title={result.restaurant.restaurant}
                  subtitle="Restaurant only"
                  onPress={() => chooseRestaurant(result.restaurant)}
                />
              ) : (
                <TargetRow
                  title={result.item.item}
                  subtitle={[
                    result.restaurantName,
                    result.item.dining_period,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => chooseItem(result.item, result.restaurantName)}
                />
              )
            }
            ListEmptyComponent={
              <Text style={styles.noResults}>No matching restaurants or menu items.</Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ComposerSection({
  title,
  optional,
  children,
}: {
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {optional && <Text style={styles.optional}>OPTIONAL</Text>}
      </View>
      {children}
    </View>
  );
}

function MealChip({
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
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function TargetRow({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.targetRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.targetCopy}>
        <Text style={styles.targetTitle}>{title}</Text>
        <Text style={text.bodyMuted}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerButton: {
    width: 72,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 14, color: COLORS.muted },
  headerTitle: { flex: 1, alignItems: 'center' },
  title: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 19, color: COLORS.ink },
  draftStatus: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 10.5, color: COLORS.muted },
  saveButton: { borderRadius: RADII.sm, backgroundColor: COLORS.pine },
  saveLabel: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 13, color: COLORS.ink },
  disabled: { opacity: 0.5 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg },
  section: {
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  optional: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: COLORS.dim,
  },
  targetButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  targetCopy: { flex: 1, gap: 2 },
  targetTitle: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 15, color: COLORS.ink },
  placeholder: { flex: 1, fontFamily: FONT_FAMILY.workSansRegular, fontSize: 15, color: COLORS.dim },
  chevron: { fontFamily: FONT_FAMILY.interRegular, fontSize: 27, color: COLORS.forest },
  helpText: { ...text.bodyMuted, marginTop: SPACING.sm, lineHeight: 18 },
  dateRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center' },
  dateLabel: { flex: 1, fontFamily: FONT_FAMILY.workSansBold, fontSize: 15, color: COLORS.ink },
  changeDateButton: {
    minHeight: 38,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.pineLight,
    justifyContent: 'center',
  },
  changeDateLabel: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 12, color: COLORS.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    minHeight: 38,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  chipSelected: { backgroundColor: COLORS.pine, borderColor: COLORS.pine },
  chipLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 12, color: COLORS.muted },
  chipLabelSelected: { color: COLORS.ink },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  starButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 32, color: COLORS.borderMid },
  starSelected: { color: COLORS.gold },
  clearRating: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  noteInput: {
    minHeight: 150,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: COLORS.cream,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.ink,
  },
  characterCount: {
    marginTop: SPACING.xs,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 10.5,
    color: COLORS.dim,
    textAlign: 'right',
  },
  error: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 13, color: COLORS.gold },
  destructiveButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  destructiveLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 13, color: COLORS.gold },
  discardButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  discardLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 13, color: COLORS.muted },
  pickerContainer: { flex: 1, backgroundColor: COLORS.cream },
  pickerHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  pickerTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 22,
    color: COLORS.ink,
  },
  doneLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 14, color: COLORS.forest },
  searchInput: {
    minHeight: 46,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    color: COLORS.ink,
  },
  targetList: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  targetRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pressed: { opacity: 0.6 },
  noResults: { ...text.bodyMuted, paddingTop: SPACING.xl, textAlign: 'center' },
});
