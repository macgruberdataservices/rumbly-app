import type { RelatedTag } from './relatedTaxonomy';
import { emptyFilters, type SearchFilters } from './filters';
import type { Coordinates } from '../location/proximity';

export type SearchCategory = 'all' | 'items' | 'restaurants' | 'related';
export type FilterPanelState = 'hidden' | 'peek' | 'expanded';
export type FilterGroupKey = 'location' | 'food' | 'dining' | 'price';
export type FindSort = 'best-match';

export interface SerializedSearchFilters {
  parks: string[];
  resorts: string[];
  accessibleWithoutAdmission: boolean;
  cuisines: string[];
  mealPeriods: string[];
  serviceTypes: string[];
  priceTiers: number[];
  favoritesOnly: boolean;
}

export interface FindBrowseContext {
  groupKey: string;
  groupLabel: string;
}

export interface FindRestoreState {
  version: 1;
  query: string;
  filters: SerializedSearchFilters;
  activeCategory: SearchCategory;
  activeRelated: RelatedTag | null;
  filterPanelState: FilterPanelState;
  activeFilterGroup: FilterGroupKey;
  sort: FindSort;
  browseContext: FindBrowseContext | null;
  resultListOffset: number;
  focusedResultKey: string | null;
  searchInputFocused: boolean;
  nearMeOrigin: Coordinates | null;
}

export function serializeFilters(filters: SearchFilters): SerializedSearchFilters {
  return {
    parks: [...filters.parks],
    resorts: [...filters.resorts],
    accessibleWithoutAdmission: filters.accessibleWithoutAdmission,
    cuisines: [...filters.cuisines],
    mealPeriods: [...filters.mealPeriods],
    serviceTypes: [...filters.serviceTypes],
    priceTiers: [...filters.priceTiers],
    favoritesOnly: filters.favoritesOnly,
  };
}

export function deserializeFilters(filters?: SerializedSearchFilters): SearchFilters {
  if (!filters) return emptyFilters();
  return {
    parks: new Set(filters.parks),
    resorts: new Set(filters.resorts),
    accessibleWithoutAdmission: filters.accessibleWithoutAdmission,
    cuisines: new Set(filters.cuisines),
    mealPeriods: new Set(filters.mealPeriods),
    serviceTypes: new Set(filters.serviceTypes),
    priceTiers: new Set(filters.priceTiers),
    favoritesOnly: filters.favoritesOnly,
  };
}

export function defaultFindRestoreState(): FindRestoreState {
  return {
    version: 1,
    query: '',
    filters: serializeFilters(emptyFilters()),
    activeCategory: 'all',
    activeRelated: null,
    filterPanelState: 'hidden',
    activeFilterGroup: 'location',
    sort: 'best-match',
    browseContext: null,
    resultListOffset: 0,
    focusedResultKey: null,
    searchInputFocused: false,
    nearMeOrigin: null,
  };
}

export function resolveFindRestoreState(state?: FindRestoreState): FindRestoreState {
  return state?.version === 1
    ? { ...defaultFindRestoreState(), ...state, nearMeOrigin: state.nearMeOrigin ?? null }
    : defaultFindRestoreState();
}
