import { forwardRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  RumblyNativeSearchRestaurantRowView,
  type NativeMenuAction,
} from '../../../modules/rumbly-native-menu/src';
import { getTodayStatus } from '../../data/hoursStatus';
import { restaurantLocationLabel } from '../../data/locationNames';
import { formatRatingAverage } from '../../data/ratingAverage';
import { useActivity } from '../../hooks/useActivity';
import { useDataProvider } from '../../hooks/useDataProvider';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useJournalComposer } from '../../hooks/useJournalComposer';
import { formatProximityDistance } from '../../location/proximity';
import {
  GotItRatingCard,
  type GotItCardEvent,
} from '../GotItRatingCard';
import type { NativeRestaurantResultRowProps } from './NativeRestaurantResultRow';

function priceDots(tier: number | null): string {
  return tier ? '$'.repeat(tier) : '';
}

export const NativeRestaurantResultRow = forwardRef<
  View,
  NativeRestaurantResultRowProps
>(function NativeRestaurantResultRow(
  { restaurant, highlightQuery, distanceMiles, onPress },
  forwardedRef
) {
  const {
    lovedIds,
    needItRestaurantIds,
    gotItRestaurantCounts,
    restaurantRatingAverages,
    toggleLove,
    toggleRestaurantNeedIt,
    addRestaurantGotIt,
    confirmGotIt,
    undoGotIt,
  } = useActivity();
  const { hoursData } = useDataProvider();
  const needItEnabled = useEntitlement('need_it');
  const gotItEnabled = useEntitlement('got_it');
  const ratingsEnabled = useEntitlement('ratings');
  const ratingAveragesEnabled = useEntitlement('rating_averages');
  const journalEnabled = useEntitlement('journal');
  const openJournalComposer = useJournalComposer();
  const isNeeded = needItRestaurantIds.has(restaurant.restaurant_id);
  const isLoved = lovedIds.has(restaurant.restaurant_id);
  const gotItCount =
    gotItRestaurantCounts.get(restaurant.restaurant_id) ?? 0;
  const rating = ratingAveragesEnabled
    ? formatRatingAverage(
        restaurantRatingAverages.get(restaurant.restaurant_id)
      )
    : null;
  const [gotItEvent, setGotItEvent] = useState<GotItCardEvent | null>(null);
  const hoursStatus = getTodayStatus(hoursData, restaurant.restaurant_id);
  const meta = [
    restaurantLocationLabel(restaurant),
    distanceMiles === null || distanceMiles === undefined
      ? null
      : formatProximityDistance(distanceMiles),
    priceDots(restaurant.price_tier),
    restaurant.experience_type,
    hoursStatus.label,
    rating,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleAction = async (action: NativeMenuAction) => {
    if (action === 'open') {
      onPress();
      return;
    }
    if (action === 'needIt') {
      await toggleRestaurantNeedIt(restaurant.restaurant_id);
    } else if (action === 'loveIt') {
      await toggleLove(restaurant.restaurant_id);
    } else if (action === 'gotIt') {
      const clientId = await addRestaurantGotIt(restaurant.restaurant_id);
      setGotItEvent({
        clientId,
        targetName: restaurant.restaurant,
        count: gotItCount + 1,
        origin: null,
      });
    } else if (action === 'journal') {
      openJournalComposer({
        restaurantId: restaurant.restaurant_id,
        restaurantNameSnapshot: restaurant.restaurant,
      });
    } else {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined
    );
  };

  return (
    <>
      <View ref={forwardedRef} style={styles.host}>
        <RumblyNativeSearchRestaurantRowView
          style={styles.nativeRow}
          row={{
            restaurantId: restaurant.restaurant_id,
            name: restaurant.restaurant,
            meta,
            highlightQuery: highlightQuery ?? null,
            isNeeded,
            isLoved,
            gotItCount,
            needItEnabled,
            gotItEnabled,
            journalEnabled,
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
              restaurant.restaurant_id,
              null
            );
            setGotItEvent(null);
          }}
        />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  host: {
    height: 76,
  },
  nativeRow: {
    flex: 1,
  },
});
