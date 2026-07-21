import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import type { PersonalActivityEvent } from '../data/activity';
import type { Restaurant, SearchIndexEntry } from '../data/types';
import { loadSearchIndex } from '../search/searchIndexLoader';
import { useActivity } from '../hooks/useActivity';
import { useAuth } from '../hooks/useAuth';
import { useDataProvider } from '../hooks/useDataProvider';
import { useEntitlement } from '../hooks/useEntitlement';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'MyActivity'>;
type CollectionTab = 'love' | 'need' | 'history';

function eventKey(event: PersonalActivityEvent): string {
  return `${event.restaurantId}:${event.itemId ?? ''}`;
}

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function restaurantLocation(restaurant: Restaurant | undefined): string {
  if (!restaurant) return '';
  return restaurant.resort ?? restaurant.area ?? restaurant.park ?? '';
}

export function MyActivityScreen({ navigation }: Props) {
  const { restaurants } = useDataProvider();
  const { user, initializing, signOut } = useAuth();
  const needItEnabled = useEntitlement('need_it');
  const { personalActivity, isActivityReady, reloadActivity } = useActivity();
  const [activeTab, setActiveTab] = useState<CollectionTab>('love');
  const [itemByKey, setItemByKey] = useState<Map<string, SearchIndexEntry>>(new Map());

  useFocusEffect(
    useCallback(() => {
      reloadActivity().catch((error) => console.warn('My Rumbly refresh failed:', error));
    }, [reloadActivity])
  );

  useEffect(() => {
    let cancelled = false;
    loadSearchIndex().then((items) => {
      if (cancelled) return;
      setItemByKey(new Map(items.map((item) => [`${item.restaurant_id}:${item.item_id}`, item])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!needItEnabled && activeTab === 'need') setActiveTab('love');
  }, [activeTab, needItEnabled]);

  const restaurantById = useMemo(
    () => new Map(restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant])),
    [restaurants]
  );
  const lovedEvents = useMemo(
    () =>
      [...personalActivity.lovedRestaurants, ...personalActivity.lovedItems].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
    [personalActivity]
  );
  const visibleEvents =
    activeTab === 'love'
      ? lovedEvents
      : activeTab === 'need'
        ? personalActivity.neededItems
        : personalActivity.gotItHistory;
  const loveCount = lovedEvents.length;
  const needCount = personalActivity.neededItems.length;

  const openEvent = (event: PersonalActivityEvent) => {
    const item = event.itemId ? itemByKey.get(eventKey(event)) : undefined;
    navigation.navigate('RestaurantDetail', {
      restaurantId: event.restaurantId,
      itemId: event.itemId ?? undefined,
      period: item?.dining_period,
      category: item?.category,
    });
  };

  if (initializing || !isActivityReady) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headingRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to My Rumbly"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <View style={styles.headingCopy}>
            <Text style={styles.heading}>Personal Activity</Text>
            <Text style={text.bodyMuted}>{user?.email ?? 'Saved on this device'}</Text>
          </View>
        </View>

        <View style={styles.statsBand}>
          <Stat value={loveCount} label="Love It" />
          <Stat value={needCount} label="Need It" />
          <Stat value={personalActivity.totalGotItCount} label="Got It" />
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <CollectionTabButton label="Love It" active={activeTab === 'love'} onPress={() => setActiveTab('love')} />
          {needItEnabled && (
            <CollectionTabButton label="Need It" active={activeTab === 'need'} onPress={() => setActiveTab('need')} />
          )}
          <CollectionTabButton
            label="History"
            active={activeTab === 'history'}
            onPress={() => setActiveTab('history')}
          />
        </View>

        <View style={styles.collectionSection}>
          <Text style={styles.collectionTitle}>
            {activeTab === 'love' ? 'Things you love' : activeTab === 'need' ? 'Your Need It list' : 'Your history'}
          </Text>
          {visibleEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={text.bodyMuted}>
                {activeTab === 'love'
                  ? 'Restaurants and menu items you Love will appear here.'
                  : activeTab === 'need'
                    ? 'Menu items you Need will appear here.'
                    : 'Each Got It tap will appear here with its date and rating.'}
              </Text>
            </View>
          ) : (
            visibleEvents.map((event) => (
              <ActivityRow
                key={event.clientId}
                event={event}
                restaurant={restaurantById.get(event.restaurantId)}
                item={event.itemId ? itemByKey.get(eventKey(event)) : undefined}
                showDate={activeTab === 'history'}
                onPress={() => openEvent(event)}
              />
            ))
          )}
        </View>

        <View style={styles.accountSection}>
          <Text style={[styles.collectionTitle, styles.accountSectionTitle]}>Account</Text>
          {user ? <SignedInPanel email={user.email ?? ''} onSignOut={signOut} /> : <AuthPanel />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CollectionTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ActivityRow({
  event,
  restaurant,
  item,
  showDate,
  onPress,
}: {
  event: PersonalActivityEvent;
  restaurant: Restaurant | undefined;
  item: SearchIndexEntry | undefined;
  showDate: boolean;
  onPress: () => void;
}) {
  const title = event.itemId ? item?.item ?? 'Menu item no longer listed' : restaurant?.restaurant ?? 'Restaurant';
  const meta = event.itemId ? restaurant?.restaurant ?? event.restaurantId : restaurantLocation(restaurant);

  return (
    <Pressable style={({ pressed }) => [styles.activityRow, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.rowCopy}>
        <Text style={text.restaurantName} numberOfLines={1}>{title}</Text>
        {!!meta && <Text style={text.bodyMuted} numberOfLines={1}>{meta}</Text>}
        {showDate && <Text style={styles.eventDate}>{formatEventDate(event.occurredAt)}</Text>}
      </View>
      {showDate && event.rating !== null ? (
        <Text style={styles.rating} accessibilityLabel={`${event.rating} out of 5 stars`}>
          {'★'.repeat(Math.round(event.rating))}
        </Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

function SignedInPanel({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  return (
    <View>
      <Text style={text.body}>Signed in as {email}</Text>
      <Text style={[text.bodyMuted, styles.accountHint]}>Your activity syncs across signed-in devices.</Text>
      <Pressable style={styles.secondaryButton} onPress={onSignOut} accessibilityRole="button">
        <Text style={text.buttonLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function AuthPanel() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length >= 6 && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const action = mode === 'signIn' ? signIn : signUp;
    const { error: actionError } = await action(email.trim(), password);
    setSubmitting(false);
    if (actionError) setError(actionError);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={[text.bodyMuted, styles.accountHint]}>Sign in to sync this device's activity.</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={COLORS.muted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        accessibilityLabel="Email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={COLORS.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color={COLORS.surface} />
        ) : (
          <Text style={styles.primaryButtonLabel}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setError(null);
          setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
        }}
      >
        <Text style={styles.switchModeLabel}>
          {mode === 'signIn' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: SPACING.xxl },
  headingRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: FONT_FAMILY.interRegular, fontSize: 34, lineHeight: 36, color: COLORS.forest },
  headingCopy: { flex: 1, gap: 2 },
  heading: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 22, lineHeight: 27, color: COLORS.ink },
  statsBand: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FONT_FAMILY.frauncesSemiBold, fontSize: 22, color: COLORS.forest },
  statLabel: { fontFamily: FONT_FAMILY.interMedium, fontSize: 11, color: COLORS.muted, marginTop: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    padding: 2,
  },
  tab: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  tabActive: { backgroundColor: COLORS.forest },
  tabLabel: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 12, color: COLORS.muted },
  tabLabelActive: { color: COLORS.goldLight },
  collectionSection: { marginTop: SPACING.lg },
  collectionTitle: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 17,
    color: COLORS.ink,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  emptyState: { minHeight: 96, justifyContent: 'center', paddingHorizontal: SPACING.lg },
  activityRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowPressed: { backgroundColor: COLORS.goldLight },
  rowCopy: { flex: 1, minWidth: 0 },
  eventDate: { fontFamily: FONT_FAMILY.interRegular, fontSize: 11, color: COLORS.dim, marginTop: 2 },
  rating: { fontFamily: FONT_FAMILY.interMedium, fontSize: 12, color: COLORS.gold, marginLeft: SPACING.sm },
  chevron: { fontFamily: FONT_FAMILY.interRegular, fontSize: 25, color: COLORS.dim, marginLeft: SPACING.sm },
  accountSection: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.xl, paddingTop: SPACING.lg, paddingHorizontal: SPACING.lg },
  accountSectionTitle: { paddingHorizontal: 0 },
  accountHint: { marginBottom: SPACING.md },
  input: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 15,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  error: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.gold, marginBottom: SPACING.md },
  primaryButton: { backgroundColor: COLORS.pine, borderRadius: RADII.sm, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 14, color: COLORS.surface },
  switchModeLabel: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.muted, textAlign: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADII.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, alignSelf: 'flex-start' },
});
