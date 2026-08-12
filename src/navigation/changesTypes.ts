import type { ChangeEvent } from '../data/types';
import type { GroupMode } from '../data/changes';
import type { RestaurantDetailRouteParams } from './browseTypes';

// Includes RestaurantDetail (owned by BrowseStackParamList, but the same
// route is registered in the shared Explore stack navigator these screens
// mount into) so a Changes row can navigate straight there without a
// getParent() workaround. groupMode threads through from Level 0 (derived
// there from the active range's span, see groupModeForRange) since Level 2
// needs it too and there's no global state to read it from here.
//
// rangeLabel/query are display-only breadcrumbs of the Level 0 filters that
// produced these events. The events are already filtered before they're
// handed down, so nothing re-filters on them -- they exist so the deeper
// screens can say *which* range and search the counts belong to instead of
// an unqualified "in this range".
export type ChangesStackParamList = {
  ChangesHome: undefined;
  ChangesRestaurant: {
    restaurantId: string | null;
    restaurantName: string;
    events: ChangeEvent[];
    groupMode: GroupMode;
    rangeLabel?: string;
    query?: string;
  };
  ChangesCategory: {
    catKey: 'menu' | 'price';
    catLabel: string;
    events: ChangeEvent[];
    backLabel: string;
    scopeRestaurant: boolean;
    groupMode: GroupMode;
    rangeLabel?: string;
    query?: string;
  };
  RestaurantDetail: RestaurantDetailRouteParams;
};
