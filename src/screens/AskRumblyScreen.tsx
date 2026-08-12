import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AllergyAcknowledgementSheet } from '../components/AllergyAcknowledgementSheet';
import { IllustrationSlot } from '../components/illustrations/IllustrationSlot';
import { NearMeButton } from '../components/NearMeButton';
import { RestaurantCard } from '../components/RestaurantCard';
import { useDataProvider } from '../hooks/useDataProvider';
import { useAppSettings } from '../hooks/useAppSettings';
import { useNearMe } from '../hooks/useNearMe';
import { getAllMenuItems } from '../data/db';
import { loadSearchIndex } from '../search/searchIndexLoader';
import type { MenuItem, Restaurant, SearchIndexEntry } from '../data/types';
import { dedupeByItemIdentity } from '../data/itemIdentity';
import { distanceToRestaurant, formatProximityDistance } from '../location/proximity';
import { suggestEntities, type EntitySuggestion } from '../../modules/ask-rumbly/scripts/ask-rumbly/entity_suggestions';
import { buildAskRumblyData } from '../askRumbly/appData';
import { runAskRumbly, type AskRumblyResponse } from '../askRumbly/appExecutor';
import {
  buildAskRumblyPresentation,
  type AskRumblySuggestion,
} from '../askRumbly/presentation';
import {
  clearAskRumblyNegativeFeedback,
  createAskRumblyNegativeFeedback,
  deliverAskRumblyNegativeFeedback,
  formatAskRumblyFeedbackExport,
  loadAskRumblyNegativeFeedback,
  saveAskRumblyNegativeFeedback,
  syncPendingAskRumblyNegativeFeedback,
  type AskRumblyFeedbackReason,
} from '../askRumbly/developmentFeedback';
import type { AskRumblyStackParamList } from '../navigation/AskRumblyNavigator';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<AskRumblyStackParamList, 'AskRumblyHome'>;

// Complete questions, not sentence openers.
//
// The previous three starters were all the same shape ("Where can I get a…",
// "What's the closest…", "Where is the cheapest…") and all left the guest
// holding half a sentence with no idea which endings Rumbly can actually
// answer. These each demonstrate a different capability and run on tap, so the
// boundary is learned from a real answer rather than from a decline.
//
// Every one of these is verified to return a grounded answer against the
// current dataset; a starter that fails is worse than no starter at all.
const QUERY_STARTERS: ReadonlyArray<{ value: string; needsLocation?: boolean }> = [
  { value: 'Where can I get a Dole Whip?' },
  { value: 'Snacks near me', needsLocation: true },
  { value: 'Gluten-free options in Magic Kingdom' },
  { value: "What's new at EPCOT?" },
  { value: 'What time does Cosmic Rays close?' },
  { value: 'Which restaurants have Mobile Order?' },
  { value: 'Cheapest snack in Magic Kingdom' },
  { value: 'Vegan food at Animal Kingdom' },
];

const INITIAL_RESULT_COUNT = 10;
const FEEDBACK_REASONS: ReadonlyArray<{ value: AskRumblyFeedbackReason; label: string }> = [
  { value: 'misunderstood', label: 'Misunderstood me' },
  { value: 'missing_result', label: 'Missing something' },
  { value: 'wrong_result', label: 'Wrong result' },
  { value: 'wording', label: 'Hard to understand' },
  { value: 'stale_data', label: 'Outdated data' },
  { value: 'other', label: 'Something else' },
];

function DevelopmentDataDisclosure({
  response,
  expanded,
  onToggle,
  feedbackCount,
  onShareFeedback,
  onClearFeedback,
}: {
  response: AskRumblyResponse;
  expanded: boolean;
  onToggle: () => void;
  feedbackCount: number;
  onShareFeedback: () => void;
  onClearFeedback: () => void;
}) {
  const { result } = response;
  return (
    <View style={styles.developmentSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} development data`}
        onPress={onToggle}
        style={({ pressed }) => [styles.developmentHeader, pressed && styles.pressed]}
      >
        <Text style={styles.developmentTitle}>Development Data</Text>
        <Text style={styles.developmentChevron}>{expanded ? '⌄' : '›'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.developmentBody}>
          <Text style={styles.developmentLabel}>Raw answer</Text>
          <Text selectable style={styles.developmentText}>{result.text}</Text>
          <Text style={styles.developmentLabel}>Plan</Text>
          <Text selectable style={styles.developmentCode}>{JSON.stringify(response.plan, null, 2)}</Text>
          {response.adaptation ? (
            <>
              <Text style={styles.developmentLabel}>Response adaptation</Text>
              <Text selectable style={styles.developmentCode}>{JSON.stringify(response.adaptation, null, 2)}</Text>
            </>
          ) : null}
          {'trace' in result && result.trace ? (
            <>
              <Text style={styles.developmentLabel}>Execution trace</Text>
              <Text selectable style={styles.developmentCode}>{JSON.stringify(result.trace, null, 2)}</Text>
            </>
          ) : null}
          {'proof' in result && result.proof ? (
            <>
              <Text style={styles.developmentLabel}>Proof</Text>
              <Text selectable style={styles.developmentCode}>{JSON.stringify(result.proof, null, 2)}</Text>
            </>
          ) : null}
          {__DEV__ ? (
            <View style={styles.feedbackLogSection}>
              <Text style={styles.developmentLabel}>Thumbs-down feedback</Text>
              <Text style={styles.developmentText}>
                {feedbackCount} {feedbackCount === 1 ? 'response' : 'responses'} saved on this device. The export contains guest questions, so review it before sharing.
              </Text>
              <View style={styles.feedbackLogActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onShareFeedback}
                  disabled={feedbackCount === 0}
                  style={({ pressed }) => [styles.feedbackLogButton, pressed && styles.pressed, feedbackCount === 0 && styles.disabled]}
                >
                  <Text style={styles.feedbackLogButtonText}>Share log</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onClearFeedback}
                  disabled={feedbackCount === 0}
                  style={({ pressed }) => [styles.feedbackLogButton, pressed && styles.pressed, feedbackCount === 0 && styles.disabled]}
                >
                  <Text style={styles.feedbackLogButtonText}>Clear log</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MenuResultCard({
  item,
  restaurant,
  distanceMiles,
  onPress,
}: {
  item: MenuItem;
  restaurant: Restaurant;
  distanceMiles?: number | null;
  onPress: () => void;
}) {
  const restaurantMeta = [
    restaurant.restaurant,
    distanceMiles == null ? null : `${formatProximityDistance(distanceMiles)} away`,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.item} at ${restaurantMeta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.menuResultCard, pressed && styles.pressed]}
    >
      <View style={styles.menuResultHeader}>
        <Text style={[text.restaurantName, styles.menuResultName]}>{item.item}</Text>
        {item.price_display ? <Text style={styles.price}>{item.price_display}</Text> : null}
      </View>
      <Text style={[text.bodyMuted, styles.menuRestaurant]}>{restaurantMeta}</Text>
      {!!item.category && <Text style={[text.bodyMuted, styles.menuCategory]}>{item.category}</Text>}
      <Text style={styles.openLabel}>Open restaurant menu ›</Text>
    </Pressable>
  );
}

export function AskRumblyScreen({ navigation }: Props) {
  const { restaurants, hoursData, isLoading, lastSyncedAt, error: dataError } = useDataProvider();
  const { allergyAcknowledgedThisSession, acknowledgeAllergyDisclaimer } = useAppSettings();
  const {
    origin,
    status: locationStatus,
    isActive: locationActive,
    getPermissionStatus: getLocationPermissionStatus,
    enable: enableLocation,
    disable: disableLocation,
  } = useNearMe();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [response, setResponse] = useState<AskRumblyResponse | null>(null);
  const [pendingResponse, setPendingResponse] = useState<AskRumblyResponse | null>(null);
  const [acknowledgementVisible, setAcknowledgementVisible] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [developmentDataExpanded, setDevelopmentDataExpanded] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [responseRating, setResponseRating] = useState<'up' | 'down' | null>(null);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [feedbackDelivery, setFeedbackDelivery] = useState<'sent' | 'pending' | null>(null);
  const [feedbackReasonPickerVisible, setFeedbackReasonPickerVisible] = useState(false);
  const [negativeFeedbackCount, setNegativeFeedbackCount] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const pendingLocationRetryRef = useRef<string | null>(null);

  // Keep the expensive full-menu read off the launch/tab-mount path. The
  // restaurant list powers autocomplete immediately; the SQLite rows and
  // slim search index are loaded only when the guest submits a question.
  useEffect(() => {
    if (lastSyncedAt === null) return;
    setMenuItems([]);
    setSearchIndex([]);
    setMenuError(null);
  }, [lastSyncedAt]);

  useEffect(() => {
    loadAskRumblyNegativeFeedback()
      .then((entries) => {
        setNegativeFeedbackCount(entries.length);
        void syncPendingAskRumblyNegativeFeedback();
      })
      .catch(() => setNegativeFeedbackCount(0));
  }, []);

  const askData = useMemo(
    () => buildAskRumblyData(restaurants, menuItems, hoursData, searchIndex),
    [hoursData, menuItems, restaurants, searchIndex],
  );
  const restaurantsById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant])),
    [restaurants],
  );

  const suggestions = useMemo<EntitySuggestion[]>(() => {
    if (!query.trim() || restaurants.length === 0) return [];
    return suggestEntities(query, askData).slice(0, 4);
  }, [askData, query, restaurants.length]);

  const itemResults = useMemo(() => {
    const result = response?.result;
    if (!result || result.kind !== 'answer') return [];
    // A compound answer is proven by several menu rows at the same venue.
    // Showing those rows as independent cards makes “chicken and beer” look
    // like hundreds of unrelated possibilities and can separate the two
    // witnesses. Present the qualifying restaurants instead; their pages own
    // the detailed menu evidence.
    if (response.plan.subject.foodTerms.length > 1) return [];
    if (result.itemKeys?.length) {
      const itemsByKey = new Map(menuItems.map((item) => [`${item.restaurant_id}:${item.item_id}`, item]));
      return dedupeByItemIdentity(
        result.itemKeys
          .map((key) => itemsByKey.get(key))
          .filter((item): item is MenuItem => Boolean(item)),
      );
    }
    const restaurantIds = new Set(result.restaurantIds ?? []);
    const itemIds = new Set(result.itemIds ?? []);
    return dedupeByItemIdentity(menuItems.filter((item) => {
      return itemIds.has(item.item_id) && restaurantIds.has(item.restaurant_id);
    }));
  }, [menuItems, response]);

  const restaurantResults = useMemo(() => {
    const result = response?.result;
    if (!result || result.kind !== 'answer') return [];
    return Array.from(new Set(result.restaurantIds ?? []))
      .map((id) => restaurantsById.get(id))
      .filter((restaurant): restaurant is Restaurant => Boolean(restaurant));
  }, [restaurantsById, response]);

  const runQuestion = useCallback(async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isAsking || isLoading || restaurants.length === 0) return;
    Keyboard.dismiss();
    setIsAsking(true);
    setRequestError(null);
    setSubmittedQuery(trimmed);
    setResponse(null);
    setPendingResponse(null);
    setAcknowledgementVisible(false);
    setDevelopmentDataExpanded(false);
    setShowAllResults(false);
    setResponseRating(null);
    setFeedbackDelivery(null);
    setFeedbackReasonPickerVisible(false);
    try {
      let dataForQuery = askData;
      if (menuItems.length === 0 || searchIndex.length === 0) {
        setMenuLoading(true);
        setMenuError(null);
        const [items, index] = await Promise.all([getAllMenuItems(), loadSearchIndex()]);
        dataForQuery = buildAskRumblyData(
          restaurants,
          items,
          hoursData,
          index.length > 0 ? index : undefined,
        );
        setMenuItems(items);
        setSearchIndex(dataForQuery.searchIndex);
      }
      // Let the searching state paint before the deterministic parser and
      // proof pass run synchronously on the JS thread, especially on repeat
      // questions when the menu is already cached.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const next = runAskRumbly(trimmed, dataForQuery, origin ?? undefined);
      if ('safety' in next.result && next.result.safety?.kind === 'allergy' && !allergyAcknowledgedThisSession) {
        setPendingResponse(next);
        setAcknowledgementVisible(true);
      } else {
        setResponse(next);
      }
    } catch (askError) {
      setRequestError(askError instanceof Error ? askError.message : String(askError));
      setResponse(null);
    } finally {
      setMenuLoading(false);
      setIsAsking(false);
    }
  }, [allergyAcknowledgedThisSession, askData, hoursData, isAsking, isLoading, menuItems.length, origin, restaurants, searchIndex.length]);

  const submitQuery = useCallback(() => {
    void runQuestion(query);
  }, [query, runQuestion]);

  const chooseSuggestion = useCallback((suggestion: EntitySuggestion) => {
    setQuery((current) => `${current.slice(0, suggestion.replaceStart)}${suggestion.label}${current.slice(suggestion.replaceEnd)}`);
  }, []);

  const clearQuery = useCallback(() => {
    setQuery('');
    setSubmittedQuery(null);
    setResponse(null);
    setPendingResponse(null);
    setRequestError(null);
    setDevelopmentDataExpanded(false);
    setShowAllResults(false);
    setResponseRating(null);
    setFeedbackDelivery(null);
    setFeedbackReasonPickerVisible(false);
    inputRef.current?.focus();
  }, []);

  // Starters are complete questions, so tapping one asks it. Filling the box
  // and leaving the guest to press send taught nothing; seeing the answer is
  // the point.
  const chooseStarter = useCallback((value: string) => {
    setQuery(value);
    setSubmittedQuery(null);
    setResponse(null);
    setRequestError(null);
    setDevelopmentDataExpanded(false);
    setShowAllResults(false);
    setResponseRating(null);
    setFeedbackDelivery(null);
    setFeedbackReasonPickerVisible(false);
    void runQuestion(value);
  }, [runQuestion]);

  const runLocationEnable = useCallback(async () => {
    const outcome = await enableLocation();
    if (outcome === 'active') return;
    pendingLocationRetryRef.current = null;
    if (outcome === 'denied') {
      Alert.alert(
        'Location access is off',
        'Enable foreground location in Settings to use Near Me. Rumbly never requests background location.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]
      );
      return;
    }
    if (outcome === 'unavailable') {
      Alert.alert(
        'Location services are off',
        'Turn on Location Services, then try Near Me again.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ]
      );
      return;
    }
    Alert.alert('Location unavailable', 'Rumbly could not determine your location. Please try again.');
  }, [enableLocation]);

  const handleLocationPress = useCallback(async () => {
    if (locationActive) {
      pendingLocationRetryRef.current = null;
      disableLocation();
      return;
    }
    try {
      const permissionStatus = await getLocationPermissionStatus();
      if (permissionStatus === 'undetermined') {
        Alert.alert(
          'Show nearby dining?',
          'Rumbly uses your location only while the app is open and compares it with Disney guest entrances on your device. No paid routing service receives your location.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => { pendingLocationRetryRef.current = null; } },
            { text: 'Continue', onPress: () => void runLocationEnable() },
          ]
        );
        return;
      }
      await runLocationEnable();
    } catch {
      pendingLocationRetryRef.current = null;
      Alert.alert('Location unavailable', 'Rumbly could not check location permission. Please try again.');
    }
  }, [disableLocation, getLocationPermissionStatus, locationActive, runLocationEnable]);

  useEffect(() => {
    const pendingQuestion = pendingLocationRetryRef.current;
    if (!locationActive || !origin || !pendingQuestion) return;
    pendingLocationRetryRef.current = null;
    setQuery(pendingQuestion);
    void runQuestion(pendingQuestion);
  }, [locationActive, origin, runQuestion]);

  const handleRecoverySuggestion = useCallback((suggestion: AskRumblySuggestion) => {
    if (suggestion.kind === 'enable_location') {
      pendingLocationRetryRef.current = submittedQuery;
      void handleLocationPress();
      return;
    }
    setQuery(suggestion.query);
    void runQuestion(suggestion.query);
  }, [handleLocationPress, runQuestion, submittedQuery]);

  const openRestaurant = useCallback(
    (restaurantId: string, item?: MenuItem) => {
      navigation.navigate('RestaurantDetail', {
        restaurantId,
        ...(item
          ? { itemId: item.item_id, period: item.dining_period, category: item.category }
          : {}),
      });
    },
    [navigation],
  );

  const acceptAllergyAcknowledgement = useCallback(() => {
    acknowledgeAllergyDisclaimer();
    setResponse(pendingResponse);
    setPendingResponse(null);
    setAcknowledgementVisible(false);
  }, [acknowledgeAllergyDisclaimer, pendingResponse]);

  const cancelAllergyAcknowledgement = useCallback(() => {
    setPendingResponse(null);
    setAcknowledgementVisible(false);
    setResponse(null);
  }, []);

  const result = response?.result;
  const resultDistances = result?.kind === 'answer' ? result.distanceMilesByRestaurant ?? {} : {};
  const isReady = !isLoading && menuError === null && dataError === null;
  const hasLinkedResults = itemResults.length > 0 || restaurantResults.length > 0;
  const totalPossibilities = itemResults.length > 0 ? itemResults.length : restaurantResults.length;
  const visibleItemResults = showAllResults ? itemResults : itemResults.slice(0, INITIAL_RESULT_COUNT);
  const visibleRestaurantResults = showAllResults
    ? restaurantResults
    : restaurantResults.slice(0, INITIAL_RESULT_COUNT);
  const presentation = response
    ? buildAskRumblyPresentation(response.plan, response.result, {
        linkedKind: itemResults.length > 0 ? 'item' : restaurantResults.length > 0 ? 'restaurant' : null,
        totalPossibilities,
        hasCurrentLocation: locationActive,
        subjectiveOptions: response.adaptation?.kind === 'subjective_options',
      })
    : null;

  const rateResponseUp = useCallback(() => {
    if (responseRating || isSavingFeedback) return;
    setResponseRating('up');
  }, [isSavingFeedback, responseRating]);

  const rateResponseDown = useCallback(async (feedbackReason?: AskRumblyFeedbackReason) => {
    if (!response || !presentation || !submittedQuery || responseRating || isSavingFeedback) return;
    setIsSavingFeedback(true);
    try {
      const entry = createAskRumblyNegativeFeedback({
        question: submittedQuery,
        response,
        presentation,
        dataLastSyncedAt: lastSyncedAt,
        feedbackReason,
      });
      const count = await saveAskRumblyNegativeFeedback(entry);
      setNegativeFeedbackCount(count);
      setResponseRating('down');
      setFeedbackReasonPickerVisible(false);
      setFeedbackDelivery('pending');
      const delivered = await deliverAskRumblyNegativeFeedback(entry);
      setFeedbackDelivery(delivered ? 'sent' : 'pending');
    } catch {
      Alert.alert('Feedback was not saved', 'Rumbly could not write the development feedback log on this device.');
    } finally {
      setIsSavingFeedback(false);
    }
  }, [isSavingFeedback, lastSyncedAt, presentation, response, responseRating, submittedQuery]);

  const shareFeedbackLog = useCallback(async () => {
    try {
      const entries = await loadAskRumblyNegativeFeedback();
      if (entries.length === 0) {
        Alert.alert('No feedback saved', 'Use thumbs down on a response before exporting the development log.');
        return;
      }
      await Share.share({
        title: 'Ask Rumbly development feedback',
        message: formatAskRumblyFeedbackExport(entries),
      });
    } catch {
      Alert.alert('Feedback could not be shared', 'Rumbly could not prepare the development feedback log.');
    }
  }, []);

  const clearFeedbackLog = useCallback(() => {
    Alert.alert(
      'Clear Ask Rumbly feedback?',
      'This permanently removes every saved thumbs-down response from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void clearAskRumblyNegativeFeedback()
              .then(() => setNegativeFeedbackCount(0))
              .catch(() => Alert.alert('Feedback was not cleared', 'Please try again.'));
          },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.askHero}>
            <View style={styles.askHeroCopy}>
              <View style={styles.titleRow}>
                <Text style={styles.heroTitle}>Ask Rumbly</Text>
                <View style={styles.betaPill}><Text style={styles.betaLabel}>BETA</Text></View>
              </View>
              <Text style={styles.heroEyebrow}>YOUR DINING SIDEKICK</Text>
              <Text style={styles.intro}>
                Menus, prices, places, hours, and published allergy labels. Ask it like you’d ask a friend.
              </Text>
            </View>
            <IllustrationSlot
              tagId="ask.hero.companion.v1"
              variant="artwork"
              style={styles.askHeroArt}
            />
          </View>

          <Text style={styles.starterEyebrow}>TAP TO TRY ONE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.starterScroll}
            contentContainerStyle={styles.starterContent}
          >
            {QUERY_STARTERS
              // A proximity example with location off would open on a
              // permission request instead of an answer, which teaches the
              // guest that Rumbly asks for things rather than that it knows
              // things.
              .filter((starter) => !starter.needsLocation || locationActive)
              .map((starter) => (
              <Pressable
                key={starter.value}
                accessibilityRole="button"
                accessibilityLabel={`Ask: ${starter.value}`}
                onPress={() => chooseStarter(starter.value)}
                style={({ pressed }) => [styles.starterPill, pressed && styles.starterPillPressed]}
              >
                <Text style={styles.starterLabel}>{starter.value}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.questionComposer}>
          <View style={styles.queryRow}>
            <View style={styles.inputShell}>
              <View style={styles.inputControl}>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={submitQuery}
                  returnKeyType="search"
                  editable={isReady && !isAsking}
                  placeholder="Ask about food, places, hours, or allergy labels"
                  placeholderTextColor={COLORS.dim}
                  accessibilityLabel="Ask Rumbly question"
                  style={styles.input}
                />
                {query.length > 0 && (
                  <Pressable
                    onPress={clearQuery}
                    accessibilityLabel="Clear question"
                    accessibilityRole="button"
                    hitSlop={8}
                    style={styles.clearButton}
                  >
                    <Text style={styles.clearButtonText}>×</Text>
                  </Pressable>
                )}
              </View>
              {suggestions.length > 0 && (
                <View style={styles.suggestions}>
                  {suggestions.map((suggestion) => (
                    <Pressable
                      key={`${suggestion.type}:${suggestion.label}`}
                      onPress={() => chooseSuggestion(suggestion)}
                      style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                    >
                      <Text style={text.body}>{suggestion.label}</Text>
                      <Text style={text.bodyMuted}>{suggestion.type}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <NearMeButton
              active={locationActive}
              status={locationStatus}
              onPress={() => void handleLocationPress()}
              accentColor={DAYLIGHT.ocean}
              borderColor={DAYLIGHT.border}
            />
          </View>

          <View style={styles.utilityRow}>
            <Text style={text.bodyMuted}>
              {locationStatus === 'active'
                ? 'Using the same Near Me location as Find.'
                : locationStatus === 'requesting'
                  ? 'Finding your current location…'
                  : 'Tap the location icon for distance-aware answers.'}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={submitQuery}
            disabled={!isReady || isAsking}
            style={({ pressed }) => [styles.askButton, pressed && styles.pressed, (!isReady || isAsking) && styles.disabled]}
          >
            {isAsking ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.askButtonText}>Ask</Text>}
          </Pressable>
          </View>

          {(!isReady || menuLoading || isAsking) && (
            <View style={styles.statusBox}>
              <ActivityIndicator color={COLORS.forest} />
              <Text style={[text.bodyMuted, styles.statusText]}>
                {isAsking && !menuLoading
                  ? 'Checking current menus and verifying every part of your question…'
                  : menuLoading
                  ? 'Preparing menu search…'
                  : dataError ?? menuError ?? (isLoading ? 'Loading Rumbly dining data…' : 'Preparing menu search…')}
              </Text>
            </View>
          )}

          {submittedQuery && result && (
            <View style={styles.responseSection}>
              <Text style={styles.queryLabel}>{submittedQuery}</Text>
              {presentation ? (
                <View style={styles.companionResponse}>
                  <Text style={styles.responseEyebrow}>{presentation.eyebrow}</Text>
                  <Text style={styles.responseTitle}>{presentation.title}</Text>
                  <Text style={styles.responseMessage}>{presentation.message}</Text>

                  {presentation.trustNote ? (
                    <Text style={styles.trustNote}>{presentation.trustNote}</Text>
                  ) : null}
                </View>
              ) : null}

              {'actions' in result && result.actions?.length ? (
                <View style={styles.actionRow}>
                  {result.actions.map((action) => (
                    <Pressable
                      key={`${action.kind}:${action.label}`}
                      accessibilityRole={action.kind === 'openDisney' ? 'link' : 'button'}
                      onPress={() => {
                        if (action.kind === 'openDisney') void Linking.openURL(action.url);
                        else openRestaurant(action.restaurantId);
                      }}
                      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.actionText}>{action.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {presentation?.suggestions.length ? (
                <View style={styles.recoverySection}>
                  <Text style={styles.recoveryLabel}>Try this</Text>
                  <View style={styles.recoveryRow}>
                    {presentation.suggestions.map((suggestion) => (
                      <Pressable
                        key={suggestion.kind === 'query' ? suggestion.query : suggestion.kind}
                        accessibilityRole="button"
                        onPress={() => handleRecoverySuggestion(suggestion)}
                        style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.recoveryText}>{suggestion.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {result.kind === 'answer' && hasLinkedResults ? (
                <View style={styles.resultGroup}>
                  {result.safety?.kind === 'allergy' ? (
                    <View style={styles.allergyNotice}>
                      <Text style={styles.allergyNoticeText}>
                        Disney lists these as matching the requested allergy label(s). Rumbly does not interpret ingredients or determine safety. Menus and preparation can change. Confirm with a Disney Cast Member before ordering.
                      </Text>
                    </View>
                  ) : null}

                  {visibleItemResults.map((item) => {
                    const restaurant = restaurantsById.get(item.restaurant_id);
                    if (!restaurant) return null;
                    return (
                      <MenuResultCard
                        key={`${item.restaurant_id}:${item.item_id}`}
                        item={item}
                        restaurant={restaurant}
                        distanceMiles={resultDistances[restaurant.restaurant_id]
                          ?? (origin ? distanceToRestaurant(origin, restaurant) : undefined)}
                        onPress={() => openRestaurant(restaurant.restaurant_id, item)}
                      />
                    );
                  })}
                  {itemResults.length === 0 && visibleRestaurantResults.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.restaurant_id}
                      restaurant={restaurant}
                      distanceMiles={resultDistances[restaurant.restaurant_id]
                        ?? (origin ? distanceToRestaurant(origin, restaurant) : undefined)}
                      onPress={() => openRestaurant(restaurant.restaurant_id)}
                    />
                  ))}

                  {!showAllResults && totalPossibilities > INITIAL_RESULT_COUNT ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`See all ${totalPossibilities} possibilities`}
                      onPress={() => setShowAllResults(true)}
                      style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.seeAllText}>See them all</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* TEMPORARY (owner decision, 2026-08-10): dropped the __DEV__
                  gate so TestFlight testers can rate responses -- restore
                  it before a public release, or replace with a real
                  entitlement/flag if this is meant to stay on. */}
              {presentation ? (
                <View style={styles.ratingSection}>
                  {responseRating ? (
                    <Text style={styles.ratingThanks}>
                      {responseRating === 'down'
                        ? feedbackDelivery === 'sent'
                          ? 'Thanks. Anonymous feedback sent for review.'
                          : 'Thanks. Saved and queued to send.'
                        : 'Thanks. That helps.'}
                    </Text>
                  ) : (
                    <>
                      {feedbackReasonPickerVisible ? (
                        <>
                          <Text style={styles.ratingPrompt}>What was off?</Text>
                          <View style={styles.feedbackReasonList}>
                            {FEEDBACK_REASONS.map((reason) => (
                              <Pressable
                                key={reason.value}
                                accessibilityRole="button"
                                accessibilityLabel={reason.label}
                                onPress={() => void rateResponseDown(reason.value)}
                                disabled={isSavingFeedback}
                                style={({ pressed }) => [styles.feedbackReasonChip, pressed && styles.pressed]}
                              >
                                <Text style={styles.feedbackReasonText}>{reason.label}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Send feedback without choosing a reason"
                            onPress={() => void rateResponseDown()}
                            disabled={isSavingFeedback}
                            style={({ pressed }) => [styles.feedbackSkipButton, pressed && styles.pressed]}
                          >
                            {isSavingFeedback
                              ? <ActivityIndicator color={COLORS.forest} />
                              : <Text style={styles.feedbackSkipText}>Skip and send</Text>}
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Text style={styles.ratingPrompt}>Did this response help?</Text>
                          <Text style={styles.ratingPrivacy}>
                            Thumbs down sends this question and response diagnostics without your account or exact location.
                          </Text>
                          <View style={styles.ratingButtons}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="This response was helpful"
                              onPress={rateResponseUp}
                              disabled={isSavingFeedback}
                              style={({ pressed }) => [styles.ratingButton, pressed && styles.pressed]}
                            >
                              <Text style={styles.ratingIcon} allowFontScaling={false}>👍</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="This response was not helpful"
                              onPress={() => setFeedbackReasonPickerVisible(true)}
                              disabled={isSavingFeedback}
                              style={({ pressed }) => [styles.ratingButton, pressed && styles.pressed]}
                            >
                              <Text style={styles.ratingIcon} allowFontScaling={false}>👎</Text>
                            </Pressable>
                          </View>
                        </>
                      )}
                    </>
                  )}
                </View>
              ) : null}

              {response ? (
                <DevelopmentDataDisclosure
                  response={response}
                  expanded={developmentDataExpanded}
                  onToggle={() => setDevelopmentDataExpanded((current) => !current)}
                  feedbackCount={negativeFeedbackCount}
                  onShareFeedback={() => void shareFeedbackLog()}
                  onClearFeedback={clearFeedbackLog}
                />
              ) : null}
            </View>
          )}

          {requestError && <Text style={styles.errorText}>{requestError}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
      <AllergyAcknowledgementSheet
        visible={acknowledgementVisible}
        onAccept={acceptAllergyAcknowledgement}
        onCancel={cancelAllergyAcknowledgement}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.paper },
  content: { padding: SPACING.lg, paddingBottom: 150 },
  askHero: {
    minHeight: 214,
    overflow: 'hidden',
    flexDirection: 'row',
    borderRadius: 28,
    backgroundColor: DAYLIGHT.coral,
  },
  askHeroCopy: {
    zIndex: 1,
    width: '63%',
    justifyContent: 'center',
    padding: SPACING.lg,
    paddingRight: SPACING.xs,
  },
  askHeroArt: {
    position: 'absolute',
    width: '42%',
    right: 0,
    top: 0,
    bottom: 0,
    minHeight: 214,
    borderRadius: 0,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  heroTitle: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 30,
    lineHeight: 35,
    color: DAYLIGHT.paper,
  },
  betaPill: {
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: 11,
    backgroundColor: DAYLIGHT.paper,
  },
  betaLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 8.5,
    color: DAYLIGHT.coral,
  },
  heroEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#FFF4EA',
    marginTop: SPACING.sm,
  },
  intro: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#FFF4EA',
    marginTop: SPACING.xs,
  },
  starterEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.9,
    color: DAYLIGHT.ocean,
    marginTop: SPACING.xl,
  },
  starterScroll: { marginTop: SPACING.sm, marginHorizontal: -SPACING.lg },
  starterContent: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  starterPill: {
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  starterPillPressed: { opacity: 0.72 },
  starterLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: DAYLIGHT.ocean,
  },
  questionComposer: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
    shadowColor: DAYLIGHT.ink,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  queryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    zIndex: 2,
  },
  inputShell: { flex: 1 },
  inputControl: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.xl,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    backgroundColor: DAYLIGHT.mist,
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.sm,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    color: COLORS.ink,
  },
  clearButton: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  suggestions: {
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: DAYLIGHT.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  utilityRow: {
    marginTop: SPACING.sm,
  },
  askButton: {
    minHeight: 50,
    marginTop: SPACING.md,
    borderRadius: 25,
    backgroundColor: DAYLIGHT.ocean,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askButtonText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 15,
    color: COLORS.surface,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  statusBox: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: DAYLIGHT.sky,
    alignItems: 'center',
  },
  statusText: { marginTop: SPACING.sm, textAlign: 'center' },
  responseSection: { marginTop: SPACING.xxl },
  queryLabel: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: COLORS.muted,
    marginBottom: SPACING.sm,
  },
  companionResponse: {
    padding: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
  },
  responseEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    color: DAYLIGHT.ocean,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  responseTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 23,
    lineHeight: 28,
    color: COLORS.ink,
    marginTop: SPACING.xs,
  },
  responseMessage: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  trustNote: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 11.5,
    lineHeight: 16,
    color: COLORS.muted,
    marginTop: SPACING.md,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  actionButton: {
    borderWidth: 1,
    borderColor: DAYLIGHT.ocean,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  actionText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: DAYLIGHT.ocean,
  },
  recoverySection: { marginTop: SPACING.md },
  recoveryLabel: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 11,
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: SPACING.sm,
  },
  recoveryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  recoveryButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  recoveryText: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 12,
    color: COLORS.ink,
  },
  resultGroup: { marginTop: SPACING.xl },
  ratingSection: {
    marginTop: SPACING.xl,
    alignItems: 'center',
  },
  ratingPrompt: {
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 12.5,
    color: COLORS.muted,
  },
  ratingPrivacy: {
    ...text.bodyMuted,
    maxWidth: 300,
    marginTop: SPACING.xs,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  feedbackReasonList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  feedbackReasonChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.mist,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
  },
  feedbackReasonText: {
    ...text.buttonLabel,
    fontSize: 12,
    color: COLORS.ink,
  },
  feedbackSkipButton: {
    minHeight: 36,
    justifyContent: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  feedbackSkipText: {
    ...text.buttonLabel,
    fontSize: 12,
    color: COLORS.forest,
  },
  ratingButton: {
    width: 48,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
  },
  ratingIcon: { fontSize: 20 },
  ratingThanks: {
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 12.5,
    color: COLORS.muted,
    textAlign: 'center',
  },
  allergyNotice: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: DAYLIGHT.sun,
    borderRadius: RADII.lg,
    backgroundColor: '#FFF0BD',
  },
  allergyNoticeText: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.ink,
  },
  menuResultCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: RADII.xl,
    backgroundColor: DAYLIGHT.sky,
  },
  menuResultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  menuResultName: {
    flex: 1,
    minWidth: 0,
  },
  price: {
    flexShrink: 0,
    marginTop: 2,
    textAlign: 'right',
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 15,
    color: DAYLIGHT.ocean,
  },
  menuRestaurant: { marginTop: SPACING.xs },
  menuCategory: { marginTop: SPACING.xs },
  openLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: DAYLIGHT.ocean,
    marginTop: SPACING.md,
  },
  seeAllButton: {
    minHeight: 44,
    marginTop: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DAYLIGHT.ocean,
    borderRadius: RADII.xl,
  },
  seeAllText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 13,
    color: DAYLIGHT.ocean,
  },
  developmentSection: {
    marginTop: SPACING.xl,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: DAYLIGHT.mist,
  },
  developmentHeader: {
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  developmentTitle: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 12.5,
    color: COLORS.muted,
  },
  developmentChevron: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 22,
    color: COLORS.muted,
  },
  developmentBody: {
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: DAYLIGHT.border,
    backgroundColor: COLORS.surface,
  },
  developmentLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: COLORS.muted,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  developmentText: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.ink,
  },
  developmentCode: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 10.5,
    lineHeight: 15,
    color: COLORS.ink,
  },
  feedbackLogSection: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  feedbackLogActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  feedbackLogButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
  },
  feedbackLogButtonText: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 12,
    color: COLORS.forest,
  },
  errorText: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: '#A84444',
    marginTop: SPACING.lg,
  },
});
