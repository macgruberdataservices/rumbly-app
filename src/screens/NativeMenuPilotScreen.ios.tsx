import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  ContextMenu,
  Host,
  List,
  RNHostView,
  Section,
  SwipeActions,
} from '@expo/ui/swift-ui';
import {
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import * as Haptics from 'expo-haptics';
import { AllergyInfoSheet } from '../components/AllergyInfoSheet';
import {
  GotItRatingCard,
  type GotItCardEvent,
} from '../components/GotItRatingCard';
import { MenuItemPreviewCard } from '../components/MenuItemPreviewCard';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { getMenuItemsByRestaurant } from '../data/db';
import { formatDateLabel } from '../data/changes';
import { isNewMenuItem } from '../data/newItem';
import { defaultPeriod, dropRedundantAllDay, sortPeriods } from '../data/period';
import { formatRatingAverage } from '../data/ratingAverage';
import { getItemIdentityKeyFor } from '../data/itemIdentity';
import type { MenuItem } from '../data/types';
import { useActivity } from '../hooks/useActivity';
import { useDataProvider } from '../hooks/useDataProvider';
import { useEntitlement } from '../hooks/useEntitlement';
import type { NativeMenuPilotRouteParams } from '../navigation/browseTypes';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';
import {
  RumblyNativeMenuView,
  type NativeMenuSection as BridgedNativeMenuSection,
  type RumblyNativeMenuViewRef,
} from '../../modules/rumbly-native-menu/src';

interface MenuSection {
  title: string;
  items: MenuItem[];
}

function itemBadges(item: MenuItem): string[] {
  return [
    item.is_kids && 'Kids',
    item.is_allergy_friendly && 'Allergy-friendly',
    item.is_alcoholic && '21+',
  ].filter(Boolean) as string[];
}

function NativePilotRow({
  item,
  width,
  isNeeded,
  isLoved,
  gotItCount,
  ratingLabel,
  needItEnabled,
  gotItEnabled,
  onOpen,
  onNeedIt,
  onGotIt,
  onLoveIt,
  onShare,
  onJournal,
}: {
  item: MenuItem;
  width: number;
  isNeeded: boolean;
  isLoved: boolean;
  gotItCount: number;
  ratingLabel: string | null;
  needItEnabled: boolean;
  gotItEnabled: boolean;
  onOpen: () => void;
  onNeedIt: () => void;
  onGotIt: () => void;
  onLoveIt: () => void;
  onShare: () => void;
  onJournal: () => void;
}) {
  const isNew = isNewMenuItem(item.first_seen);
  const badges = itemBadges(item);

  const renderNeedIt = () =>
    needItEnabled ? (
      <Button
        label={isNeeded ? 'Remove Need It' : 'Need It'}
        systemImage={isNeeded ? 'star.fill' : 'star'}
        modifiers={[tint('#5A6CF2')]}
        onPress={onNeedIt}
      />
    ) : null;
  const renderGotIt = () =>
    gotItEnabled ? (
      <Button
        label={gotItCount > 0 ? `Got It (${gotItCount})` : 'Got It'}
        systemImage={gotItCount > 0 ? 'checkmark.circle.fill' : 'checkmark.circle'}
        modifiers={[tint(COLORS.gold)]}
        onPress={onGotIt}
      />
    ) : null;
  const renderLoveIt = () => (
    <Button
      label={isLoved ? 'Remove Love It' : 'Love It'}
      systemImage={isLoved ? 'heart.fill' : 'heart'}
      modifiers={[tint('#D22AD6')]}
      onPress={onLoveIt}
    />
  );

  return (
    <SwipeActions
      modifiers={[
        listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
        listRowSeparator('hidden'),
        listRowBackground(COLORS.surface),
      ]}
    >
      <ContextMenu>
        <ContextMenu.Items>
          <Button
            label="Share"
            systemImage="square.and.arrow.up"
            modifiers={[tint('#1687E8')]}
            onPress={onShare}
          />
          <Button
            label="Journal"
            systemImage="book.closed"
            modifiers={[tint(COLORS.gold)]}
            onPress={onJournal}
          />
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={[
                item.item,
                isNew && 'New',
                item.price_display,
                item.description,
                ...badges,
                ratingLabel,
                'Tap for details; swipe left or hold for actions',
              ]
                .filter(Boolean)
                .join(', ')}
              onPress={onOpen}
              style={[styles.row, { width }]}
            >
              <View style={styles.titleRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.item}
                </Text>
                {isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>NEW</Text>
                  </View>
                )}
                {!!item.price_display && (
                  <Text style={styles.price} numberOfLines={1}>
                    {item.price_display}
                  </Text>
                )}
                {!!ratingLabel && (
                  <Text style={styles.rating} numberOfLines={1}>
                    {ratingLabel}
                  </Text>
                )}
              </View>
              {!!item.description && (
                <Text style={styles.description} numberOfLines={1}>
                  {item.description}
                </Text>
              )}
            </Pressable>
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Preview>
          <RNHostView matchContents>
            <View style={styles.preview}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewEyebrow}>MENU ITEM</Text>
                <Text style={styles.previewTitle}>{item.item}</Text>
                <Text style={styles.previewAdded}>
                  Added {formatDateLabel(item.first_seen)}
                </Text>
              </View>
              <View style={styles.previewCopy}>
                {!!item.price_display && (
                  <Text style={styles.previewPrice}>{item.price_display}</Text>
                )}
                {!!ratingLabel && <Text style={styles.previewRating}>{ratingLabel}</Text>}
                {!!item.description && (
                  <Text style={styles.previewDescription}>{item.description}</Text>
                )}
                {badges.length > 0 && (
                  <Text style={styles.previewBadges}>{badges.join(' · ')}</Text>
                )}
                <Text style={styles.previewHint}>
                  Share and Journal actions are coming soon.
                </Text>
              </View>
            </View>
          </RNHostView>
        </ContextMenu.Preview>
      </ContextMenu>
      <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
        {renderNeedIt()}
        {renderGotIt()}
        {renderLoveIt()}
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

export function NativeMenuPilotScreen({
  route,
  navigation,
}: {
  route: { params: NativeMenuPilotRouteParams };
  navigation: { goBack: () => void };
}) {
  const {
    restaurantId,
    initialPeriod,
    initialCategory,
    initialItemId,
  } = route.params;
  const { width } = useWindowDimensions();
  const { restaurants } = useDataProvider();
  const restaurant = restaurants.find((entry) => entry.restaurant_id === restaurantId);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(initialPeriod ?? null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MenuItem | null>(null);
  const [allergyItem, setAllergyItem] = useState<MenuItem | null>(null);
  const [gotItItem, setGotItItem] = useState<MenuItem | null>(null);
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);
  const nativeMenuRef = useRef<RumblyNativeMenuViewRef>(null);
  const categoryScrollRef = useRef<ScrollView>(null);
  const categoryLayoutsRef = useRef(
    new Map<string, { x: number; width: number }>()
  );
  const appliedInitialTargetRef = useRef<string | null>(null);
  const {
    lovedItemKeys,
    needItItemKeys,
    gotItItemCounts,
    itemRatingAverages,
    toggleItemLove,
    toggleItemNeedIt,
    addItemGotIt,
    confirmGotIt,
    undoGotIt,
  } = useActivity();
  const needItEnabled = useEntitlement('need_it');
  const gotItEnabled = useEntitlement('got_it');
  const ratingsEnabled = useEntitlement('ratings');
  const ratingAveragesEnabled = useEntitlement('rating_averages');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMenuItemsByRestaurant(restaurantId).then((result) => {
      if (!cancelled) {
        setItems(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const periods = useMemo(
    () =>
      sortPeriods(
        dropRedundantAllDay(
          Array.from(
            new Set(items.filter((item) => item.show_in_menu).map((item) => item.dining_period))
          )
        )
      ),
    [items]
  );

  useEffect(() => {
    if (!selectedPeriod && periods.length > 0) {
      setSelectedPeriod(defaultPeriod(periods) ?? periods[0]);
    }
  }, [periods, selectedPeriod]);

  const sections = useMemo<MenuSection[]>(() => {
    if (!selectedPeriod) return [];
    const byCategory = new Map<string, { order: number; items: MenuItem[] }>();
    for (const item of items) {
      if (!item.show_in_menu || item.dining_period !== selectedPeriod) continue;
      const existing = byCategory.get(item.category);
      if (existing) {
        existing.items.push(item);
      } else {
        byCategory.set(item.category, {
          order: item.group_display_order,
          items: [item],
        });
      }
    }
    return Array.from(byCategory.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([title, value]) => ({ title, items: value.items }));
  }, [items, selectedPeriod]);

  const menuItemsById = useMemo(() => {
    const result = new Map<string, MenuItem>();
    for (const section of sections) {
      for (const item of section.items) result.set(item.item_id, item);
    }
    return result;
  }, [sections]);

  useEffect(() => {
    if (loading || sections.length === 0) return;
    const targetKey = [
      restaurantId,
      selectedPeriod,
      initialCategory ?? '',
      initialItemId ?? '',
    ].join(':');
    if (appliedInitialTargetRef.current === targetKey) return;

    const frame = requestAnimationFrame(() => {
      const itemSection = initialItemId
        ? sections.find((section) =>
          section.items.some((item) => item.item_id === initialItemId)
        )
        : undefined;
      if (initialItemId && menuItemsById.has(initialItemId) && itemSection) {
        void nativeMenuRef.current?.scrollToItem(initialItemId, itemSection.title);
      } else if (
        initialCategory &&
        sections.some((section) => section.title === initialCategory)
      ) {
        setActiveCategory(initialCategory);
        void nativeMenuRef.current?.scrollToCategory(initialCategory);
      }
      appliedInitialTargetRef.current = targetKey;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    initialCategory,
    initialItemId,
    loading,
    menuItemsById,
    restaurantId,
    sections,
    selectedPeriod,
  ]);

  const bridgedSections = useMemo<BridgedNativeMenuSection[]>(
    () =>
      sections.map((section, sectionIndex) => ({
        title: section.title || 'Menu',
        items: section.items.map((item, itemIndex) => {
          const itemKey = getItemIdentityKeyFor(item);
          return {
            anchorId: `${sectionIndex}:${itemIndex}:${item.item_id}`,
            itemId: String(item.item_id),
            name: item.item || 'Menu item',
            description: item.description ?? null,
            price: item.price_display ?? '',
            isNew: isNewMenuItem(item.first_seen),
            rating: ratingAveragesEnabled
              ? formatRatingAverage(itemRatingAverages.get(itemKey))
              : null,
            isNeeded: needItItemKeys.has(itemKey),
            isLoved: lovedItemKeys.has(itemKey),
            gotItCount: gotItItemCounts.get(itemKey) ?? 0,
            needItEnabled,
            gotItEnabled,
          };
        }),
      })),
    [
      gotItEnabled,
      gotItItemCounts,
      itemRatingAverages,
      lovedItemKeys,
      needItEnabled,
      needItItemKeys,
      ratingAveragesEnabled,
      sections,
    ]
  );

  useEffect(() => {
    if (sections.length === 0) {
      setActiveCategory(null);
      return;
    }
    setActiveCategory((current) =>
      current && sections.some((section) => section.title === current)
        ? current
        : sections[0].title
    );
  }, [sections]);

  useEffect(() => {
    if (!activeCategory) return;
    const frame = requestAnimationFrame(() => {
      const layout = categoryLayoutsRef.current.get(activeCategory);
      if (!layout) return;
      categoryScrollRef.current?.scrollTo({
        x: Math.max(0, layout.x + layout.width / 2 - width / 2),
        animated: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeCategory, width]);

  const haptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const logGotIt = async (item: MenuItem) => {
    const itemKey = getItemIdentityKeyFor(item);
    const count = gotItItemCounts.get(itemKey) ?? 0;
    const clientId = await addItemGotIt(item.restaurant_id, item.item_id);
    setGotItItem(item);
    setGotItEvent({
      clientId,
      targetName: item.item,
      count: count + 1,
      origin: null,
    });
    haptic();
  };

  const handleNativeAction = (
    action: 'open' | 'share' | 'journal' | 'needIt' | 'gotIt' | 'loveIt',
    itemId: string
  ) => {
    const item = menuItemsById.get(itemId);
    if (!item) return;

    switch (action) {
      case 'open':
        setPreviewItem(item);
        break;
      case 'share':
        Alert.alert('Share', 'Sharing menu items is coming soon.');
        break;
      case 'journal':
        Alert.alert('Journal', 'Journal entries are coming soon.');
        break;
      case 'needIt':
        void toggleItemNeedIt(item.restaurant_id, item.item_id).then(haptic);
        break;
      case 'gotIt':
        void logGotIt(item);
        break;
      case 'loveIt':
        void toggleItemLove(item.restaurant_id, item.item_id).then(haptic);
        break;
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <SettingsScreenHeader
        title={restaurant?.restaurant ?? 'Native Menu Pilot'}
        onBack={navigation.goBack}
      />
      <View style={styles.pilotBanner}>
        <Text style={styles.pilotLabel}>NATIVE MENU PILOT</Text>
        <Text style={text.bodyMuted}>
          One SwiftUI list owns every section and row. The production menu is unchanged.
        </Text>
      </View>

      {periods.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodScroller}
          contentContainerStyle={styles.periods}
        >
          {periods.map((period) => (
            <Pressable
              key={period}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedPeriod === period }}
              style={[
                styles.periodChip,
                selectedPeriod === period && styles.periodChipSelected,
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  styles.periodLabel,
                  selectedPeriod === period && styles.periodLabelSelected,
                ]}
              >
                {period}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {sections.length > 0 && (
        <ScrollView
          ref={categoryScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroller}
          contentContainerStyle={styles.categories}
        >
          {sections.map((section) => (
            <Pressable
              key={section.title}
              accessibilityRole="button"
              accessibilityState={{ selected: activeCategory === section.title }}
              onLayout={({ nativeEvent }) => {
                categoryLayoutsRef.current.set(section.title, nativeEvent.layout);
                if (activeCategory === section.title) {
                  categoryScrollRef.current?.scrollTo({
                    x: Math.max(
                      0,
                      nativeEvent.layout.x +
                        nativeEvent.layout.width / 2 -
                        width / 2
                    ),
                    animated: false,
                  });
                }
              }}
              style={[
                styles.categoryChip,
                activeCategory === section.title && styles.categoryChipSelected,
              ]}
              onPress={() => {
                setActiveCategory(section.title);
                void nativeMenuRef.current?.scrollToCategory(section.title);
              }}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  activeCategory === section.title && styles.categoryLabelSelected,
                ]}
              >
                {section.title.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.centered}>
          <Text style={text.bodyMuted}>Loading native menu…</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centered}>
          <Text style={text.bodyMuted}>No menu available for this period.</Text>
        </View>
      ) : (
        <RumblyNativeMenuView
          ref={nativeMenuRef}
          style={styles.host}
          sections={bridgedSections}
          onActiveCategoryChange={({ nativeEvent }) => {
            setActiveCategory(nativeEvent.category);
          }}
          onAction={({ nativeEvent }) => {
            handleNativeAction(nativeEvent.action, nativeEvent.itemId);
          }}
        />
      )}

      <MenuItemPreviewCard
        item={previewItem}
        badges={previewItem ? itemBadges(previewItem) : []}
        ratingAverage={
          previewItem && ratingAveragesEnabled
            ? itemRatingAverages.get(getItemIdentityKeyFor(previewItem))
            : undefined
        }
        origin={null}
        onClose={() => setPreviewItem(null)}
        onPressAllergyInfo={() => {
          if (previewItem) setAllergyItem(previewItem);
        }}
      />
      <AllergyInfoSheet
        visible={allergyItem !== null}
        allergyFreeOf={allergyItem?.allergy_free_of ?? []}
        onClose={() => setAllergyItem(null)}
      />
      {gotItEvent && gotItItem && (
        <GotItRatingCard
          event={gotItEvent}
          ratingsEnabled={ratingsEnabled}
          onConfirm={async (rating) => {
            await confirmGotIt(gotItEvent.clientId, rating);
            setGotItEvent(null);
            setGotItItem(null);
          }}
          onUndo={async () => {
            await undoGotIt(
              gotItEvent.clientId,
              gotItItem.restaurant_id,
              gotItItem.item_id
            );
            setGotItEvent(null);
            setGotItItem(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  pilotBanner: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    gap: SPACING.xs,
    borderRadius: RADII.md,
    backgroundColor: COLORS.goldLight,
  },
  pilotLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: COLORS.forest,
  },
  periods: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  periodScroller: {
    flexGrow: 0,
    height: 52,
  },
  periodChip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
  },
  periodChipSelected: {
    borderColor: COLORS.forest,
    backgroundColor: COLORS.forest,
  },
  periodLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 13,
    color: COLORS.ink,
  },
  periodLabelSelected: { color: COLORS.goldLight },
  categoryScroller: {
    flexGrow: 0,
    height: 48,
  },
  categories: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs,
    alignItems: 'center',
  },
  categoryChip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.goldLight,
  },
  categoryChipSelected: {
    backgroundColor: COLORS.pineLight,
  },
  categoryLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 13,
    letterSpacing: 0.45,
    color: COLORS.muted,
  },
  categoryLabelSelected: {
    color: COLORS.forest,
  },
  host: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    minHeight: 76,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  itemName: {
    flex: 1,
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 15,
    color: COLORS.ink,
  },
  price: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 14,
    color: COLORS.ink,
  },
  rating: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    color: COLORS.gold,
  },
  description: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: COLORS.muted,
  },
  newBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newBadgeText: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    lineHeight: 11,
    color: COLORS.ink,
  },
  preview: {
    width: 320,
    overflow: 'hidden',
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  previewHeader: { padding: SPACING.lg, backgroundColor: COLORS.pineLight },
  previewEyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: COLORS.forest,
  },
  previewTitle: {
    marginTop: SPACING.xs,
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 23,
    color: COLORS.ink,
  },
  previewAdded: {
    marginTop: SPACING.xs,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    color: COLORS.muted,
  },
  previewCopy: { padding: SPACING.lg, gap: SPACING.sm },
  previewPrice: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 15,
    color: COLORS.ink,
  },
  previewRating: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 13,
    color: COLORS.gold,
  },
  previewDescription: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.muted,
  },
  previewBadges: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 11,
    color: COLORS.forest,
  },
  previewHint: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: COLORS.forest,
  },
});
