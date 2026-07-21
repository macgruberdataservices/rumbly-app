import type { Coordinates } from '../location/proximity';

export type RestaurantDetailRouteParams = {
  restaurantId: string;
  itemId?: string;
  period?: string;
  category?: string;
};

export type BrowseStackParamList = {
  LocationList: { parentGroupKey?: string; parentGroupLabel?: string } | undefined;
  RestaurantList: { groupKey: string; groupLabel: string; nearMeOrigin?: Coordinates };
  RestaurantDetail: RestaurantDetailRouteParams;
};
