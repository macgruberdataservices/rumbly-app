import type { ChangeEvent } from '../data/types';
import type { GroupMode } from '../data/changes';
import type { RestaurantDetailRouteParams } from './browseTypes';

// Includes RestaurantDetail (owned by BrowseStackParamList, but the same
// route is registered in the shared Explore stack navigator these screens
// mount into) so a Changes row can navigate straight there without a
// getParent() workaround. groupMode threads through from Level 0 (day if
// the active range spans under a week, week otherwise) since Level 2 needs
// it too and there's no global state to read it from here.
export type ChangesStackParamList = {
  ChangesHome: undefined;
  ChangesRestaurant: {
    restaurantId: string | null;
    restaurantName: string;
    events: ChangeEvent[];
    groupMode: GroupMode;
  };
  ChangesCategory: {
    catKey: 'menu' | 'price';
    catLabel: string;
    events: ChangeEvent[];
    backLabel: string;
    scopeRestaurant: boolean;
    groupMode: GroupMode;
  };
  RestaurantDetail: RestaurantDetailRouteParams;
};
