import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { uuid } from 'expo-modules-core';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { IllustrationSlot } from '../../components/illustrations/IllustrationSlot';
import {
  MAX_JOURNAL_PHOTOS,
  type JournalEntryDraft,
  type JournalPhoto,
  type StagedJournalPhoto,
} from '../../data/journal';
import {
  dateFromVisitDate,
  formatVisitDateLong,
  visitDateFromDate,
} from '../../data/journalDate';
import { createJournalIdentifiers } from '../../data/journalIds';
import { journalDraftFingerprint } from '../../data/journalDraft';
import {
  deleteLocalStagedJournalPhoto,
  listLocalStagedJournalPhotos,
  saveLocalStagedJournalPhoto,
} from '../../data/journalStore';
import { isActionableMenuItem } from '../../data/isActionableMenuItem';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { useActivity } from '../../hooks/useActivity';
import { useAuth } from '../../hooks/useAuth';
import { useDataProvider } from '../../hooks/useDataProvider';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useJournal } from '../../hooks/useJournal';
import type { AppRootStackParamList } from '../../navigation/journalTypes';
import { loadSearchIndex } from '../../search/searchIndexLoader';
import {
  deleteSavedJournalPhotoFiles,
  deleteStagedJournalPhotoFiles,
  resolveJournalPhotoThumbnailUri,
  stageJournalPhoto,
} from '../../media/journalPhotoStorage';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<AppRootStackParamList, 'JournalComposer'>;

type TargetResult =
  | { kind: 'restaurant'; key: string; restaurant: Restaurant }
  | {
      kind: 'item';
      key: string;
      item: SearchIndexEntry;
      restaurantName: string;
    };

const COMMON_MEAL_PERIODS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const PENDING_PHOTO_SOURCE_KEY = 'journal.pendingPhotoSource';

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
    photos,
    saveDraft,
    updateEntry,
    isJournalEnabled,
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
  const preselectedRestaurantName =
    route.params?.restaurantNameSnapshot ||
    restaurants.find(
      (restaurant) => restaurant.restaurant_id === route.params?.restaurantId
    )?.restaurant ||
    '';
  const [restaurantId, setRestaurantId] = useState(
    initial?.restaurantId ?? route.params?.restaurantId ?? ''
  );
  const [restaurantName, setRestaurantName] = useState(
    initial?.restaurantNameSnapshot ?? preselectedRestaurantName
  );
  const [itemId, setItemId] = useState<string | null>(
    initial?.itemId ?? route.params?.itemId ?? null
  );
  const [itemName, setItemName] = useState<string | null>(
    initial?.itemNameSnapshot ?? route.params?.itemNameSnapshot ?? null
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
  const [iosDateVisible, setIosDateVisible] = useState(false);
  const [pendingIosDate, setPendingIosDate] = useState(() =>
    dateFromVisitDate(initial?.visitedOn ?? visitDateFromDate(new Date()))
  );
  const [stagedPhotos, setStagedPhotos] = useState<StagedJournalPhoto[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<Set<string>>(
    () => new Set()
  );
  const [stagedPhotosLoaded, setStagedPhotosLoaded] = useState(false);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved'>(
    resumedDraft ? 'saved' : 'idle'
  );
  const submittingRef = useRef(false);
  const draftSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const queuedDraftFingerprintRef = useRef<string | null>(
    resumedDraft ? journalDraftFingerprint(resumedDraft) : null
  );
  const exitAllowedRef = useRef(false);
  const restaurantById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant])),
    [restaurants]
  );
  const savedPhotos = useMemo(
    () =>
      editingEntry
        ? photos
            .filter(
              (photo) =>
                photo.entryId === editingEntry.id && !removedPhotoIds.has(photo.id)
            )
            .sort((left, right) => left.position - right.position)
        : [],
    [editingEntry, photos, removedPhotoIds]
  );
  const photoCount = savedPhotos.length + stagedPhotos.length;
  const selectedPhotoIds = useMemo(
    () => [...savedPhotos.map((photo) => photo.id), ...stagedPhotos.map((photo) => photo.id)],
    [savedPhotos, stagedPhotos]
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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listLocalStagedJournalPhotos(user.id, identifiers.entryId)
      .then((photos) => {
        if (!cancelled) {
          setStagedPhotos(photos);
          setStagedPhotosLoaded(true);
        }
      })
      .catch((error) => {
        console.warn('Journal staged photos failed to load:', error);
        if (!cancelled) setStagedPhotosLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [identifiers.entryId, user]);

  useEffect(() => {
    if (!user || !stagedPhotosLoaded) return;
    ImagePicker.getPendingResultAsync()
      .then(async (result) => {
        if (!result || 'code' in result || result.canceled) return;
        const source = await AsyncStorage.getItem(PENDING_PHOTO_SOURCE_KEY);
        await AsyncStorage.removeItem(PENDING_PHOTO_SOURCE_KEY);
        await addPickedAssets(result.assets, source === 'camera');
      })
      .catch((error) => console.warn('Journal pending photo recovery failed:', error));
    // Android only returns a pending result once. The identifiers and current
    // staged-photo state are captured by addPickedAssets for this composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifiers.entryId, stagedPhotosLoaded, user]);

  useEffect(() => {
    if (!restaurantId || restaurantName) return;
    const match = restaurants.find(
      (restaurant) => restaurant.restaurant_id === restaurantId
    );
    if (match) setRestaurantName(match.restaurant);
  }, [restaurantId, restaurantName, restaurants]);

  useEffect(() => {
    if (!restaurantId || !itemId || itemName) return;
    const match = items.find(
      (item) => item.restaurant_id === restaurantId && item.item_id === itemId
    );
    if (!match) return;
    setItemName(match.item);
    if (!mealPeriod && match.dining_period) setMealPeriod(match.dining_period);
  }, [itemId, itemName, items, mealPeriod, restaurantId]);

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
    if (
      !user
      || !isJournalEnabled
      || !restaurantId
      || !restaurantName
      || !stagedPhotosLoaded
    ) return null;
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
      photoIds: selectedPhotoIds,
      updatedAt: new Date().toISOString(),
    };
  }, [
    identifiers.clientId,
    identifiers.entryId,
    isJournalEnabled,
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
    selectedPhotoIds,
    stagedPhotos,
    stagedPhotosLoaded,
    user,
    visitedOn,
  ]);

  useEffect(() => {
    if (!draft || submitting) return;
    const fingerprint = journalDraftFingerprint(draft);
    if (queuedDraftFingerprintRef.current === fingerprint) return;
    queuedDraftFingerprintRef.current = fingerprint;
    setDraftStatus('saving');
    const timeout = setTimeout(() => {
      if (submittingRef.current) return;
      const savePromise = saveDraft({ ...draft, updatedAt: new Date().toISOString() })
        .then(() => setDraftStatus('saved'))
        .catch((error) => {
          console.warn('Journal draft autosave failed:', error);
          queuedDraftFingerprintRef.current = null;
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

  const confirmKeepWithoutLibraryCopy = (): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        'Keep this photo in your Journal?',
        'myRumbly could not save a separate original to Photos. You can keep the optimized private Journal copy or open Settings.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings().catch(() => {});
              resolve(false);
            },
          },
          { text: 'Keep in Journal only', onPress: () => resolve(true) },
        ]
      );
    });

  const preserveCameraOriginal = async (uri: string): Promise<boolean> => {
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!permission.granted) return confirmKeepWithoutLibraryCopy();
    try {
      await MediaLibrary.Asset.create(uri);
      return true;
    } catch (error) {
      console.warn('Journal camera original could not be saved:', error);
      return confirmKeepWithoutLibraryCopy();
    }
  };

  const addPickedAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
    fromCamera: boolean
  ) => {
    if (!user || processingPhotos) return;
    const available = MAX_JOURNAL_PHOTOS - photoCount;
    const selected = assets.slice(0, available);
    if (selected.length === 0) return;
    setProcessingPhotos(true);
    setSaveError(null);
    try {
      const next = [...stagedPhotos];
      for (const asset of selected) {
        if (fromCamera && !(await preserveCameraOriginal(asset.uri))) continue;
        const photo = await stageJournalPhoto({
          id: uuid.v4(),
          userId: user.id,
          draftId: identifiers.entryId,
          position: next.length,
          sourceUri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
        await saveLocalStagedJournalPhoto(photo);
        next.push(photo);
      }
      setStagedPhotos(next);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'The selected photo could not be prepared.'
      );
    } finally {
      await AsyncStorage.removeItem(PENDING_PHOTO_SOURCE_KEY);
      setProcessingPhotos(false);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access is off',
        'Allow camera access in Settings to take a Journal photo.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
      return;
    }
    await AsyncStorage.setItem(PENDING_PHOTO_SOURCE_KEY, 'camera');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    });
    if (!result.canceled) await addPickedAssets(result.assets, true);
    else await AsyncStorage.removeItem(PENDING_PHOTO_SOURCE_KEY);
  };

  const choosePhotos = async () => {
    await AsyncStorage.setItem(PENDING_PHOTO_SOURCE_KEY, 'library');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: MAX_JOURNAL_PHOTOS - photoCount,
      quality: 1,
      exif: false,
    });
    if (!result.canceled) await addPickedAssets(result.assets, false);
    else await AsyncStorage.removeItem(PENDING_PHOTO_SOURCE_KEY);
  };

  const showPhotoSource = () => {
    if (!restaurantId) {
      setSaveError('Choose a restaurant before adding photos.');
      return;
    }
    Alert.alert('Add photos', 'Choose where your Journal photos come from.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Take Photo', onPress: () => takePhoto().catch(handlePhotoError) },
      { text: 'Choose from Library', onPress: () => choosePhotos().catch(handlePhotoError) },
    ]);
  };

  const handlePhotoError = (error: unknown) => {
    console.warn('Journal photo selection failed:', error);
    AsyncStorage.removeItem(PENDING_PHOTO_SOURCE_KEY).catch(() => {});
    setProcessingPhotos(false);
    setSaveError('The photo picker could not be opened.');
  };

  const removePhoto = async (photo: StagedJournalPhoto) => {
    await deleteLocalStagedJournalPhoto(photo.userId, photo.id);
    deleteStagedJournalPhotoFiles(photo);
    const remaining = stagedPhotos
      .filter((candidate) => candidate.id !== photo.id)
      .map((candidate, position) => ({ ...candidate, position }));
    for (const remainingPhoto of remaining) {
      await saveLocalStagedJournalPhoto(remainingPhoto);
    }
    setStagedPhotos(remaining);
  };

  const removeSavedPhoto = (photo: JournalPhoto) => {
    setRemovedPhotoIds((current) => {
      const next = new Set(current);
      next.add(photo.id);
      return next;
    });
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
          photoIds: selectedPhotoIds,
        });
        photos
          .filter(
            (photo) =>
              photo.entryId === editingEntry.id && removedPhotoIds.has(photo.id)
          )
          .forEach(deleteSavedJournalPhotoFiles);
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
          photoIds: stagedPhotos.map((photo) => photo.id),
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
      // A single goBack() reliably dismisses this modal, revealing
      // whichever screen opened it -- for the only entry point that can
      // reach a delete (JournalEntryDetail's "Edit entry"), that screen
      // now reacts to its own entry having disappeared and navigates
      // itself away, rather than this screen trying to reach across the
      // app to fix up a different screen's navigation state. Dispatching
      // a second navigation action here (an earlier attempt at this)
      // raced against the modal's own dismissal and could leave it not
      // fully torn down, so the next time it opened it reused the same
      // stale instance instead of remounting fresh.
      navigation.goBack();
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
          await Promise.all(
            stagedPhotos.map(async (photo) => {
              await deleteLocalStagedJournalPhoto(photo.userId, photo.id);
              deleteStagedJournalPhotoFiles(photo);
            })
          );
          await discardDraft(identifiers.entryId);
          exitAllowedRef.current = true;
          navigation.goBack();
        },
      },
    ]);
  };

  if (!user || !isJournalEnabled) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.unavailable}>
          <Text style={styles.title}>Journal unavailable</Text>
          <Text style={styles.unavailableBody}>
            {!user
              ? 'Sign in from My Rumbly to use your private Journal.'
              : 'Journal is not enabled for this account yet.'}
          </Text>
          <Pressable
            style={styles.unavailableButton}
            onPress={() => {
              exitAllowedRef.current = true;
              navigation.goBack();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.saveLabel}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close composer"
          >
            <Text style={styles.cancelLabel}>Close</Text>
          </Pressable>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>{editingEntry ? 'Edit entry' : 'New entry'}</Text>
            <Text style={styles.draftStatus} accessibilityLiveRegion="polite">
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
            accessibilityRole="button"
            accessibilityLabel="Save Journal entry"
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <Text style={styles.saveLabel}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.captureIntro}>
            <View style={styles.captureIntroCopy}>
              <Text style={styles.captureEyebrow}>A MOMENT WORTH KEEPING</Text>
              <Text style={styles.captureTitle}>Give this memory a place to land.</Text>
              <Text style={styles.captureBody}>A few details now can bring the whole park day back later.</Text>
            </View>
            <IllustrationSlot
              tagId="journal.composer.capture-memory.v1"
              variant="artwork"
              style={styles.captureArt}
            />
          </View>

          <ComposerSection title="What did you have?">
            <Pressable
              style={[styles.targetButton, editingEntry && styles.disabled]}
              disabled={!!editingEntry}
              onPress={() => {
                setTargetQuery('');
                setTargetPickerVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                restaurantId
                  ? `Change target: ${itemName ?? restaurantName}`
                  : 'Choose a restaurant or menu item'
              }
              accessibilityState={{ disabled: !!editingEntry }}
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
              <Pressable
                style={styles.changeDateButton}
                onPress={() => {
                  if (Platform.OS === 'ios') {
                    setPendingIosDate(dateFromVisitDate(visitedOn));
                    setIosDateVisible(true);
                  } else {
                    setAndroidDateVisible(true);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Change visit date, currently ${formatVisitDateLong(visitedOn)}`}
              >
                <Text style={styles.changeDateLabel}>Change</Text>
              </Pressable>
            </View>
            {Platform.OS === 'android' && androidDateVisible && (
              <DateTimePicker
                value={dateFromVisitDate(visitedOn)}
                mode="date"
                presentation="dialog"
                maximumDate={new Date()}
                accentColor={DAYLIGHT.ocean}
                onValueChange={(_event, date) => {
                  setVisitedOn(visitDateFromDate(date));
                  setAndroidDateVisible(false);
                }}
                onDismiss={() => setAndroidDateVisible(false)}
              />
            )}
          </ComposerSection>

          <ComposerSection title="Meal context" optional>
            <View style={styles.chips} accessibilityRole="radiogroup">
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
                  <Pressable
                    onPress={() => setRating(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Clear rating"
                  >
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
              accessibilityLabel="Journal note"
            />
            <Text style={styles.characterCount}>{note.length}/4000</Text>
          </ComposerSection>

          <ComposerSection title="Photos" optional>
            <View style={styles.photoGrid}>
              {savedPhotos.map((photo) => {
                const thumbnailUri = resolveJournalPhotoThumbnailUri(photo);
                if (!thumbnailUri) return null;
                return (
                  <View key={photo.id} style={styles.photoTile}>
                    <Image source={{ uri: thumbnailUri }} style={styles.photoThumbnail} />
                    <Pressable
                      style={styles.removePhotoButton}
                      onPress={() => removeSavedPhoto(photo)}
                      accessibilityRole="button"
                      accessibilityLabel="Remove saved Journal photo"
                    >
                      <Text style={styles.removePhotoLabel}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
              {stagedPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoTile}>
                  <Image source={{ uri: photo.thumbnailUri }} style={styles.photoThumbnail} />
                  <Pressable
                    style={styles.removePhotoButton}
                    onPress={() => removePhoto(photo).catch(handlePhotoError)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove Journal photo"
                  >
                    <Text style={styles.removePhotoLabel}>×</Text>
                  </Pressable>
                </View>
              ))}
              {photoCount < MAX_JOURNAL_PHOTOS && (
                <Pressable
                  style={styles.addPhotoButton}
                  onPress={showPhotoSource}
                  disabled={processingPhotos || !restaurantId}
                  accessibilityRole="button"
                  accessibilityLabel="Add Journal photos"
                >
                  {processingPhotos ? (
                    <ActivityIndicator color={DAYLIGHT.ocean} />
                  ) : (
                    <>
                      <Text style={styles.addPhotoPlus}>＋</Text>
                      <Text style={styles.addPhotoLabel}>Add</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
            <Text style={styles.helpText}>
              {restaurantId
                ? `${photoCount}/${MAX_JOURNAL_PHOTOS} · myRumbly keeps optimized private copies to reduce storage use.`
                : 'Choose a restaurant before adding photos.'}
            </Text>
          </ComposerSection>

          {!!saveError && <Text style={styles.error}>{saveError}</Text>}

          {editingEntry ? (
            <Pressable
              style={styles.destructiveButton}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete this Journal entry"
            >
              <Text style={styles.destructiveLabel}>Delete entry…</Text>
            </Pressable>
          ) : (
            draft && (
              <Pressable
                style={styles.discardButton}
                onPress={handleDiscardDraft}
                accessibilityRole="button"
                accessibilityLabel="Discard this draft"
              >
                <Text style={styles.discardLabel}>Discard draft</Text>
              </Pressable>
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={iosDateVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIosDateVisible(false)}
      >
        <View style={styles.dateModalBackdrop}>
          <View style={styles.dateModalCard}>
            <View style={styles.dateModalHeader}>
              <Pressable
                onPress={() => setIosDateVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.dateModalAction}>Cancel</Text>
              </Pressable>
              <Text style={styles.dateModalTitle}>Visit date</Text>
              <Pressable
                onPress={() => {
                  setVisitedOn(visitDateFromDate(pendingIosDate));
                  setIosDateVisible(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.dateModalAction}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              style={styles.iosDatePicker}
              value={pendingIosDate}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              accentColor={DAYLIGHT.ocean}
              onValueChange={(_event, date) => setPendingIosDate(date)}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={targetPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTargetPickerVisible(false)}
      >
        <SafeAreaView style={styles.pickerContainer} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Choose what to journal</Text>
            <Pressable
              onPress={() => setTargetPickerVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
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
      accessibilityLabel={label}
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
    <Pressable
      style={({ pressed }) => [styles.targetRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
    >
      <View style={styles.targetCopy}>
        <Text style={styles.targetTitle}>{title}</Text>
        <Text style={text.bodyMuted}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DAYLIGHT.border,
    backgroundColor: DAYLIGHT.sky,
  },
  headerButton: {
    width: 72,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 14, color: DAYLIGHT.ocean },
  headerTitle: { flex: 1, alignItems: 'center' },
  title: { fontFamily: FONT_FAMILY.piazzollaBold, fontSize: 19, color: COLORS.ink },
  draftStatus: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 10.5, color: COLORS.muted },
  saveButton: { borderRadius: RADII.xl, backgroundColor: DAYLIGHT.ocean },
  saveLabel: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 13, color: COLORS.surface },
  disabled: { opacity: 0.5 },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg },
  captureIntro: {
    minHeight: 170,
    overflow: 'hidden',
    flexDirection: 'row',
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.coral,
  },
  captureIntroCopy: {
    zIndex: 1,
    width: '64%',
    justifyContent: 'center',
    padding: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  captureEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#FFF4EA',
  },
  captureTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 21,
    lineHeight: 25,
    color: DAYLIGHT.paper,
    marginTop: SPACING.xs,
  },
  captureBody: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#FFF4EA',
    marginTop: SPACING.sm,
  },
  captureArt: {
    position: 'absolute',
    width: '40%',
    right: 0,
    top: 0,
    bottom: 0,
    minHeight: 170,
    borderRadius: 0,
  },
  section: {
    padding: SPACING.lg,
    borderLeftWidth: 5,
    borderLeftColor: DAYLIGHT.sun,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
    shadowColor: DAYLIGHT.ink,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  optional: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: COLORS.dim,
  },
  targetButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: DAYLIGHT.sky,
  },
  targetCopy: { flex: 1, gap: 2 },
  targetTitle: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 15, color: COLORS.ink },
  placeholder: { flex: 1, fontFamily: FONT_FAMILY.workSansRegular, fontSize: 15, color: COLORS.dim },
  chevron: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 27, color: DAYLIGHT.ocean },
  helpText: { ...text.bodyMuted, marginTop: SPACING.sm, lineHeight: 18 },
  dateRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center' },
  iosDatePicker: { width: '100%', height: 210 },
  dateModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(18, 34, 31, 0.32)',
  },
  dateModalCard: {
    paddingBottom: SPACING.xl,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  dateModalHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  dateModalTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  dateModalAction: {
    minWidth: 52,
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 14,
    color: COLORS.forest,
  },
  dateLabel: { flex: 1, fontFamily: FONT_FAMILY.workSansBold, fontSize: 15, color: COLORS.ink },
  changeDateButton: {
    minHeight: 38,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.sm,
    backgroundColor: DAYLIGHT.sky,
    justifyContent: 'center',
  },
  changeDateLabel: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 12, color: DAYLIGHT.ocean },
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
  chipSelected: { backgroundColor: DAYLIGHT.ocean, borderColor: DAYLIGHT.ocean },
  chipLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 12, color: COLORS.muted },
  chipLabelSelected: { color: COLORS.surface },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  starButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 32, color: COLORS.borderMid },
  starSelected: { color: DAYLIGHT.sun },
  clearRating: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoTile: {
    width: 84,
    height: 84,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: DAYLIGHT.mist,
  },
  photoThumbnail: { width: '100%', height: '100%' },
  removePhotoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 34, 31, 0.82)',
  },
  removePhotoLabel: { color: COLORS.surface, fontSize: 22, lineHeight: 24 },
  addPhotoButton: {
    width: 84,
    height: 84,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: DAYLIGHT.ocean,
    borderRadius: RADII.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DAYLIGHT.sky,
  },
  addPhotoPlus: { fontSize: 25, lineHeight: 28, color: DAYLIGHT.coral },
  addPhotoLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 11,
    color: COLORS.muted,
  },
  noteInput: {
    minHeight: 150,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: DAYLIGHT.mist,
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
    fontFamily: FONT_FAMILY.piazzollaBold,
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
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  unavailableBody: {
    ...text.bodyMuted,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
    textAlign: 'center',
    lineHeight: 19,
  },
  unavailableButton: {
    minWidth: 120,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    backgroundColor: COLORS.pine,
  },
});
