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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AllergyAcknowledgementSheet } from '../components/AllergyAcknowledgementSheet';
import { NearMeButton } from '../components/NearMeButton';
import { RestaurantCard } from '../components/RestaurantCard';
import { useDataProvider } from '../hooks/useDataProvider';
import { useNearMe } from '../hooks/useNearMe';
import { getAllMenuItems } from '../data/db';
import { loadSearchIndex } from '../search/searchIndexLoader';
import type { MenuItem, Restaurant, SearchIndexEntry } from '../data/types';
import { dedupeByItemIdentity } from '../data/itemIdentity';
import { distanceToRestaurant } from '../location/proximity';
import { suggestEntities, type EntitySuggestion } from '../../modules/ask-rumbly/scripts/ask-rumbly/entity_suggestions';
import { buildAskRumblyData } from '../askRumbly/appData';
import { runAskRumbly, type AskRumblyResponse } from '../askRumbly/appExecutor';
import type { AskRumblyStackParamList } from '../navigation/AskRumblyNavigator';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<AskRumblyStackParamList, 'AskRumblyHome'>;

const QUERY_STARTERS = [
  { label: 'Where can I get a…', value: 'Where can I get a ' },
  { label: 'What’s the closest…', value: "What's the closest " },
  { label: 'Where is the cheapest…', value: 'Where is the cheapest ' },
] as const;

const INITIAL_RESULT_COUNT = 10;

function DevelopmentDataDisclosure({
  response,
  expanded,
  onToggle,
}: {
  response: AskRumblyResponse;
  expanded: boolean;
  onToggle: () => void;
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
        </View>
      ) : null}
    </View>
  );
}

function MenuResultCard({
  item,
  restaurant,
  onPress,
}: {
  item: MenuItem;
  restaurant: Restaurant;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.item} at ${restaurant.restaurant}`}
      onPress={onPress}
      style={({ pressed }) => [styles.menuResultCard, pressed && styles.pressed]}
    >
      <View style={styles.menuResultHeader}>
        <Text style={text.restaurantName}>{item.item}</Text>
        {item.price_display ? <Text style={styles.price}>{item.price_display}</Text> : null}
      </View>
      <Text style={[text.bodyMuted, styles.menuRestaurant]}>{restaurant.restaurant}</Text>
      {!!item.category && <Text style={[text.bodyMuted, styles.menuCategory]}>{item.category}</Text>}
      <Text style={styles.openLabel}>Open restaurant menu ›</Text>
    </Pressable>
  );
}

export function AskRumblyScreen({ navigation }: Props) {
  const { restaurants, hoursData, isLoading, lastSyncedAt, error: dataError } = useDataProvider();
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
  const inputRef = useRef<TextInput>(null);

  // Keep the expensive full-menu read off the launch/tab-mount path. The
  // restaurant list powers autocomplete immediately; the SQLite rows and
  // slim search index are loaded only when the guest submits a question.
  useEffect(() => {
    if (lastSyncedAt === null) return;
    setMenuItems([]);
    setSearchIndex([]);
    setMenuError(null);
  }, [lastSyncedAt]);

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

  const submitQuery = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isAsking || isLoading || restaurants.length === 0) return;
    Keyboard.dismiss();
    setIsAsking(true);
    setRequestError(null);
    setSubmittedQuery(trimmed);
    setDevelopmentDataExpanded(false);
    setShowAllResults(false);
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
      const next = runAskRumbly(trimmed, dataForQuery, origin ?? undefined);
      if ('safety' in next.result && next.result.safety?.kind === 'allergy') {
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
  }, [askData, hoursData, isAsking, isLoading, menuItems.length, origin, query, restaurants, searchIndex.length]);

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
    inputRef.current?.focus();
  }, []);

  const chooseStarter = useCallback((value: string) => {
    setQuery(value);
    setSubmittedQuery(null);
    setResponse(null);
    setRequestError(null);
    setDevelopmentDataExpanded(false);
    setShowAllResults(false);
    inputRef.current?.focus();
  }, []);

  const runLocationEnable = useCallback(async () => {
    const outcome = await enableLocation();
    if (outcome === 'active') return;
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
            { text: 'Not now', style: 'cancel' },
            { text: 'Continue', onPress: () => void runLocationEnable() },
          ]
        );
        return;
      }
      await runLocationEnable();
    } catch {
      Alert.alert('Location unavailable', 'Rumbly could not check location permission. Please try again.');
    }
  }, [disableLocation, getLocationPermissionStatus, locationActive, runLocationEnable]);

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
    setResponse(pendingResponse);
    setPendingResponse(null);
    setAcknowledgementVisible(false);
  }, [pendingResponse]);

  const cancelAllergyAcknowledgement = useCallback(() => {
    setPendingResponse(null);
    setAcknowledgementVisible(false);
    setResponse(null);
  }, []);

  const result = response?.result;
  const isReady = !isLoading && menuError === null && dataError === null;
  const hasLinkedResults = itemResults.length > 0 || restaurantResults.length > 0;
  const totalPossibilities = itemResults.length > 0 ? itemResults.length : restaurantResults.length;
  const isProximityResult = response?.plan.constraints.distanceOperation === 'nearest';
  const isCheapestResult = response?.plan.constraints.priceOperation === 'cheapest';
  const visibleItemResults = showAllResults ? itemResults : itemResults.slice(0, INITIAL_RESULT_COUNT);
  const visibleRestaurantResults = showAllResults
    ? restaurantResults
    : restaurantResults.slice(0, INITIAL_RESULT_COUNT);
  const friendlyResultText = itemResults.length > 0
    ? isProximityResult
      ? "Here's a list of the closest menu items I found."
      : isCheapestResult
        ? "Here's a list of the cheapest menu items I found."
        : "Here's a list of menu items I found."
    : isProximityResult
      ? "Here's a list of the closest places I found."
      : "Here's a list of places I found.";

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.titleRow}>
            <Text style={text.sectionTitle}>Ask Rumbly</Text>
            <Text style={styles.betaLabel}>(Beta)</Text>
          </View>
          <Text style={[text.bodyMuted, styles.intro]}>
            Ask about Disney food, restaurants, menus, prices, locations, hours, and published allergy labels.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.starterScroll}
            contentContainerStyle={styles.starterContent}
          >
            {QUERY_STARTERS.map((starter) => (
              <Pressable
                key={starter.value}
                accessibilityRole="button"
                accessibilityLabel={`Start question: ${starter.label}`}
                onPress={() => chooseStarter(starter.value)}
                style={({ pressed }) => [styles.starterPill, pressed && styles.starterPillPressed]}
              >
                <Text style={styles.starterLabel}>{starter.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

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
                  placeholder="Ask a dining question"
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

          {(!isReady || menuLoading) && (
            <View style={styles.statusBox}>
              <ActivityIndicator color={COLORS.forest} />
              <Text style={[text.bodyMuted, styles.statusText]}>
                {menuLoading
                  ? 'Preparing menu search…'
                  : dataError ?? menuError ?? (isLoading ? 'Loading Rumbly dining data…' : 'Preparing menu search…')}
              </Text>
            </View>
          )}

          {submittedQuery && result && (
            <View style={styles.responseSection}>
              <Text style={styles.queryLabel}>{submittedQuery}</Text>
              {!hasLinkedResults ? (
                <View style={styles.responseBox}>
                  <Text style={text.body}>{result.text}</Text>
                </View>
              ) : null}

              {result.kind === 'answer' && result.actions?.length ? (
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

              {result.kind === 'answer' && hasLinkedResults ? (
                <View style={styles.resultGroup}>
                  <Text style={styles.possibilityCount}>
                    Found {totalPossibilities} {totalPossibilities === 1 ? 'Possibility' : 'Possibilities'}
                  </Text>
                  <Text style={styles.resultIntro}>{friendlyResultText}</Text>

                  {result.safety?.kind === 'allergy' ? (
                    <View style={styles.allergyNotice}>
                      <Text style={styles.allergyNoticeText}>
                        Disney lists these as matching the requested allergy label(s). Rumbly does not interpret ingredients or determine safety. Menus and preparation can change—confirm with a Disney Cast Member before ordering.
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
                        onPress={() => openRestaurant(restaurant.restaurant_id, item)}
                      />
                    );
                  })}
                  {itemResults.length === 0 && visibleRestaurantResults.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.restaurant_id}
                      restaurant={restaurant}
                      distanceMiles={origin ? distanceToRestaurant(origin, restaurant) : undefined}
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

              {response ? (
                <DevelopmentDataDisclosure
                  response={response}
                  expanded={developmentDataExpanded}
                  onToggle={() => setDevelopmentDataExpanded((current) => !current)}
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
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg, paddingBottom: 150 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm },
  betaLabel: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 12,
    color: COLORS.muted,
  },
  intro: { marginTop: SPACING.sm, lineHeight: 18 },
  starterScroll: { marginTop: SPACING.lg, marginHorizontal: -SPACING.lg },
  starterContent: { paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  starterPill: {
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.cream,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  starterPillPressed: { backgroundColor: COLORS.pineLight },
  starterLabel: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 12,
    color: COLORS.forest,
  },
  queryRow: {
    marginTop: SPACING.md,
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
    borderColor: COLORS.borderMid,
    borderRadius: RADII.xl,
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.sm,
    backgroundColor: COLORS.cream,
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
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  suggestion: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    borderRadius: RADII.md,
    backgroundColor: COLORS.forest,
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
    backgroundColor: COLORS.cream,
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
  responseBox: {
    padding: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: COLORS.cream,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  actionButton: {
    borderWidth: 1,
    borderColor: COLORS.forest,
    borderRadius: RADII.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  actionText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.forest,
  },
  resultGroup: { marginTop: SPACING.xl },
  possibilityCount: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 13,
    color: COLORS.forest,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  resultIntro: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 17,
    lineHeight: 23,
    color: COLORS.ink,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  allergyNotice: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: RADII.md,
    backgroundColor: COLORS.goldLight,
  },
  allergyNoticeText: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.ink,
  },
  menuResultCard: {
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
  },
  menuResultHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  price: {
    fontFamily: FONT_FAMILY.workSansSemiBold,
    fontSize: 15,
    color: COLORS.forest,
  },
  menuRestaurant: { marginTop: SPACING.xs },
  menuCategory: { marginTop: SPACING.xs },
  openLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.forest,
    marginTop: SPACING.md,
  },
  seeAllButton: {
    minHeight: 44,
    marginTop: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.forest,
    borderRadius: RADII.xl,
  },
  seeAllText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 13,
    color: COLORS.forest,
  },
  developmentSection: {
    marginTop: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    overflow: 'hidden',
    backgroundColor: COLORS.cream,
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
    borderTopColor: COLORS.border,
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
  errorText: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: '#A84444',
    marginTop: SPACING.lg,
  },
});
