import { forwardRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  RumblyNativeSearchItemRowView,
  type NativeMenuAction,
} from '../../../modules/rumbly-native-menu/src';
import type { Restaurant, SearchIndexEntry } from '../../data/types';
import { restaurantLocationLabel } from '../../data/locationNames';
import { formatProximityDistance } from '../../location/proximity';
import { useActivity } from '../../hooks/useActivity';
import { useEntitlement } from '../../hooks/useEntitlement';
import { isNewMenuItem } from '../../data/newItem';
import { formatRatingAverage } from '../../data/ratingAverage';
import {
  GotItRatingCard,
  type GotItCardEvent,
} from '../GotItRatingCard';
import type { NativeItemResultRowProps } from './NativeItemResultRow';

export const NativeItemResultRow = forwardRef<View, NativeItemResultRowProps>(
  function NativeItemResultRow(
    { item, restaurant, highlightQuery, distanceMiles, onPress },
    forwardedRef
  ) {
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
    const key = `${item.restaurant_id}:${item.item_id}`;
    const isLoved = lovedItemKeys.has(key);
    const isNeeded = needItItemKeys.has(key);
    const gotItCount = gotItItemCounts.get(key) ?? 0;
    const rating = ratingAveragesEnabled
      ? formatRatingAverage(itemRatingAverages.get(key))
      : null;
    const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);

    const meta = [
      restaurantLocationLabel(restaurant),
      distanceMiles === null || distanceMiles === undefined
        ? null
        : formatProximityDistance(distanceMiles),
    ]
      .filter(Boolean)
      .join(' · ');

    const handleAction = async (action: NativeMenuAction) => {
      if (action === 'open') {
        onPress();
        return;
      }
      if (action === 'needIt') {
        await toggleItemNeedIt(item.restaurant_id, item.item_id);
      } else if (action === 'loveIt') {
        await toggleItemLove(item.restaurant_id, item.item_id);
      } else if (action === 'gotIt') {
        const clientId = await addItemGotIt(item.restaurant_id, item.item_id);
        setGotItEvent({
          clientId,
          targetName: item.item,
          count: gotItCount + 1,
          origin: null,
        });
      } else {
        // Share and Journal intentionally remain visible pilot actions,
        // matching the native menu preview contract, until their product
        // flows are implemented.
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };

    return (
      <>
        <View ref={forwardedRef} style={styles.host}>
          <RumblyNativeSearchItemRowView
            style={styles.nativeRow}
            row={{
              itemId: item.item_id,
              name: item.item,
              restaurant: restaurant.restaurant,
              meta,
              price: item.price_display ?? '',
              rating,
              highlightQuery: highlightQuery ?? null,
              isNew: isNewMenuItem(item.first_seen),
              isNeeded,
              isLoved,
              gotItCount,
              needItEnabled,
              gotItEnabled,
            }}
            onAction={(event) => void handleAction(event.nativeEvent.action)}
          />
        </View>
        {gotItEvent && (
          <GotItRatingCard
            event={gotItEvent}
            ratingsEnabled={ratingsEnabled}
            onConfirm={async (nextRating) => {
              await confirmGotIt(gotItEvent.clientId, nextRating);
              setGotItEvent(null);
            }}
            onUndo={async () => {
              await undoGotIt(
                gotItEvent.clientId,
                item.restaurant_id,
                item.item_id
              );
              setGotItEvent(null);
            }}
          />
        )}
      </>
    );
  }
);

const styles = StyleSheet.create({
  host: {
    height: 88,
  },
  nativeRow: {
    flex: 1,
  },
});
