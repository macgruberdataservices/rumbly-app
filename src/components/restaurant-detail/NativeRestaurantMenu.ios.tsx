import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  RumblyNativeMenuView,
  type NativeMenuAction,
  type NativeMenuSection,
  type RumblyNativeMenuViewRef,
} from '../../../modules/rumbly-native-menu/src';
import {
  GotItRatingCard,
  type GotItCardEvent,
} from '../GotItRatingCard';
import { formatDateLabel } from '../../data/changes';
import { isNewMenuItem } from '../../data/newItem';
import { formatRatingAverage } from '../../data/ratingAverage';
import { getItemIdentityKeyFor } from '../../data/itemIdentity';
import type { MenuItem } from '../../data/types';
import { useActivity } from '../../hooks/useActivity';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useJournalComposer } from '../../hooks/useJournalComposer';
import type {
  NativeRestaurantMenuProps,
  NativeRestaurantMenuRef,
} from './NativeRestaurantMenu';

export const NativeRestaurantMenu = forwardRef<
  NativeRestaurantMenuRef,
  NativeRestaurantMenuProps
>(function NativeRestaurantMenu(
  {
    sections,
    targetAnchorId,
    highlightedItemId,
    bottomInset,
    onReady,
    onActiveCategoryChange,
    onScrollOffsetChange,
  },
  forwardedRef
) {
  const nativeRef = useRef<RumblyNativeMenuViewRef>(null);
  const [gotItItem, setGotItItem] = useState<MenuItem | null>(null);
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);
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
  const journalEnabled = useEntitlement('journal');
  const openJournalComposer = useJournalComposer();

  const itemsByAnchor = useMemo(() => {
    const result = new Map<string, MenuItem>();
    sections.forEach((section, sectionIndex) =>
      section.data.forEach((item, itemIndex) => {
        result.set(`${sectionIndex}:${itemIndex}:${item.item_id}`, item);
      })
    );
    return result;
  }, [sections]);

  const nativeSections = useMemo<NativeMenuSection[]>(
    () =>
      sections.map((section, sectionIndex) => ({
        title: section.title || 'Menu',
        items: section.data.map((item, itemIndex) => {
          const itemKey = getItemIdentityKeyFor(item);
          return {
            anchorId: `${sectionIndex}:${itemIndex}:${item.item_id}`,
            itemId: String(item.item_id),
            name: item.item || 'Menu item',
            description: item.description ?? null,
            price: item.price_display ?? '',
            isNew: isNewMenuItem(item.first_seen),
            addedLabel: `Added ${formatDateLabel(item.first_seen)}`,
            periodCategoryLabel: `${item.dining_period} - ${item.category}`,
            rating: ratingAveragesEnabled
              ? formatRatingAverage(itemRatingAverages.get(itemKey))
              : null,
            isNeeded: needItItemKeys.has(itemKey),
            isLoved: lovedItemKeys.has(itemKey),
            gotItCount: gotItItemCounts.get(itemKey) ?? 0,
            needItEnabled,
            gotItEnabled,
            journalEnabled,
          };
        }),
      })),
    [
      gotItEnabled,
      journalEnabled,
      gotItItemCounts,
      itemRatingAverages,
      lovedItemKeys,
      needItEnabled,
      needItItemKeys,
      ratingAveragesEnabled,
      sections,
    ]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToCategory: (category) =>
        nativeRef.current?.scrollToCategory(category) ?? Promise.resolve(),
      scrollToItem: (itemId, category) =>
        nativeRef.current?.scrollToItem(itemId, category) ?? Promise.resolve(),
    }),
    []
  );

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

  const handleAction = (action: NativeMenuAction, itemId: string, anchorId?: string) => {
    const item = (anchorId ? itemsByAnchor.get(anchorId) : undefined)
      ?? [...itemsByAnchor.values()].find((candidate) => candidate.item_id === itemId);
    if (!item) return;

    switch (action) {
      case 'journal':
        openJournalComposer({
          restaurantId: item.restaurant_id,
          itemId: item.item_id,
          itemNameSnapshot: item.item,
          mealPeriodSnapshot: item.dining_period,
        });
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
    <>
      <RumblyNativeMenuView
        ref={nativeRef}
        style={styles.list}
        sections={nativeSections}
        targetAnchorId={targetAnchorId}
        highlightedItemId={highlightedItemId}
        bottomInset={bottomInset}
        onReady={onReady}
        onActiveCategoryChange={({ nativeEvent }) => {
          onActiveCategoryChange(nativeEvent.category);
        }}
        onScrollOffsetChange={({ nativeEvent }) => {
          onScrollOffsetChange(nativeEvent.offsetY);
        }}
        onAction={({ nativeEvent }) => {
          handleAction(nativeEvent.action, nativeEvent.itemId, nativeEvent.anchorId);
        }}
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
    </>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
});
