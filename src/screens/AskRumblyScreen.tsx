import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

const DEFAULT_QUERY = 'Where can I get a burger?';

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
  const { origin, status: locationStatus, enable: enableLocation } = useNearMe();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [response, setResponse] = useState<AskRumblyResponse | null>(null);
  const [pendingResponse, setPendingResponse] = useState<AskRumblyResponse | null>(null);
  const [acknowledgementVisible, setAcknowledgementVisible] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

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

  const suggestions = useMemo<EntitySuggestion[]>(() => {
    if (!query.trim() || restaurants.length === 0) return [];
    return suggestEntities(query, askData).slice(0, 4);
  }, [askData, query, restaurants.length]);

  const itemResults = useMemo(() => {
    const result = response?.result;
    if (!result || result.kind !== 'answer') return [];
    const restaurantIds = new Set(result.restaurantIds ?? []);
    const itemKeys = new Set(result.itemKeys ?? []);
    const itemIds = new Set(result.itemIds ?? []);
    return dedupeByItemIdentity(menuItems.filter((item) => {
      const key = `${item.restaurant_id}:${item.item_id}`;
      return itemKeys.has(key) || (itemIds.has(item.item_id) && restaurantIds.has(item.restaurant_id));
    }));
  }, [menuItems, response]);

  const restaurantResults = useMemo(() => {
    const result = response?.result;
    if (!result || result.kind !== 'answer') return [];
    const ids = new Set(result.restaurantIds ?? []);
    return restaurants.filter((restaurant) => ids.has(restaurant.restaurant_id));
  }, [restaurants, response]);

  const submitQuery = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isAsking || isLoading || restaurants.length === 0) return;
    Keyboard.dismiss();
    setIsAsking(true);
    setRequestError(null);
    setSubmittedQuery(trimmed);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Text style={text.sectionTitle}>Ask Rumbly</Text>
          <Text style={[text.bodyMuted, styles.intro]}>
            Ask about Disney food, restaurants, menus, prices, locations, hours, and published allergy labels.
          </Text>

          <View style={styles.inputShell}>
            <TextInput
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

          <View style={styles.utilityRow}>
            <Text style={text.bodyMuted}>
              {locationStatus === 'active' ? 'Using your location for distance questions.' : 'Enable Near Me for distance-aware answers.'}
            </Text>
            {locationStatus !== 'active' && (
              <Pressable onPress={() => void enableLocation()} accessibilityRole="button">
                <Text style={styles.utilityAction}>Use Near Me</Text>
              </Pressable>
            )}
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
              <View style={styles.responseBox}>
                <Text style={text.body}>{result.text}</Text>
              </View>

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

              {result.kind === 'answer' && itemResults.length > 0 && (
                <View style={styles.resultGroup}>
                  <Text style={styles.resultGroupTitle}>Menu matches</Text>
                  {itemResults.slice(0, 12).map((item) => {
                    const restaurant = restaurants.find((candidate) => candidate.restaurant_id === item.restaurant_id);
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
                </View>
              )}

              {result.kind === 'answer' && itemResults.length === 0 && restaurantResults.length > 0 && (
                <View style={styles.resultGroup}>
                  <Text style={styles.resultGroupTitle}>Places</Text>
                  {restaurantResults.slice(0, 12).map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.restaurant_id}
                      restaurant={restaurant}
                      distanceMiles={origin ? distanceToRestaurant(origin, restaurant) : undefined}
                      onPress={() => openRestaurant(restaurant.restaurant_id)}
                    />
                  ))}
                </View>
              )}
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
  intro: { marginTop: SPACING.sm, lineHeight: 18 },
  inputShell: { marginTop: SPACING.xl, zIndex: 2 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  utilityAction: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.forest,
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
  resultGroupTitle: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
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
  errorText: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: '#A84444',
    marginTop: SPACING.lg,
  },
});
