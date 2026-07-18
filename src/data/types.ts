// Mirrors the published schema of Disney Dining Dev's restaurant_data.json,
// menu_data.json, hours_data.json, and data_manifest.json exactly, as
// confirmed by direct inspection of the live files. `restaurant_id` is the
// join key across all three — NOT `facility_id`.

export interface RawFacet {
  facetId: string;
  group: string;
  id: string;
  name: string;
}

export interface Restaurant {
  restaurant_id: string;
  facility_id: string;
  channel_id: string;
  entity_type: string;
  restaurant: string;
  park: string | null;
  area: string | null;
  resort: string | null;
  disney_url: string | null;
  description: string | null;
  service_style: string | null;
  experience_type: string | null;
  is_character_dining: boolean;
  primary_cuisine: string | null;
  secondary_cuisine: string | null;
  price_tier: number | null;
  price_tier_display: string | null;
  meal_periods: string[];
  accepts_reservations: boolean;
  reservations_recommended: boolean;
  has_walkup_list: boolean;
  raw_facets: RawFacet[];
  tags: string[];
  disney_operated: boolean | null;
  disney_owned: boolean | null;
  admission_required: boolean | null;
  status: string;
  status_since: string | null;
  status_notes: string | null;
  show_in_app: boolean;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  detail_image_url: string | null;
  list_image_url: string | null;
  first_seen: string;
  last_api_refresh: string | null;
  queried_facility_id: string | null;
  fetched_from_facility_id: string[] | null;
  menu_ids_diverge: boolean;
  last_pipeline_update: string;
  cuisine_tags: string[];
  is_festival_booth: boolean;
  festival_name: string | null;
  festival_year: number | null;
}

export interface MenuItem {
  restaurant_id: string;
  item_id: string;
  item: string;
  description: string | null;
  category: string;
  category_group: string;
  group_display_order: number;
  dining_period: string;
  price_display: string;
  price_value: number;
  price_changed: string | null;
  previous_price: number | null;
  is_seasonal: boolean;
  is_limited_time: boolean;
  is_allergy_friendly: boolean;
  is_kids: boolean;
  is_alcoholic: boolean;
  has_allergy_option: boolean;
  is_festival_item: boolean;
  show_in_menu: boolean;
  norm_categories: string[];
  cuisine_tags: string[];
  festival_name: string | null;
  festival_year: number | null;
  first_seen: string;
  last_seen: string;
  queried_facility_id: string | null;
  fetched_from_facility_id: string | null;
}

// The slim 12-field-plus-derived projection held fully in memory for
// instant search across all 45k+ items, mirroring the source app's
// SEARCH_INDEX / toSearchIndexEntry().
export interface SearchIndexEntry {
  restaurant_id: string;
  item: string;
  _norm: string;
  price_display: string;
  price_changed: string | null;
  previous_price: number | null;
  show_in_menu: boolean;
  is_festival_item: boolean;
  dining_period: string;
  norm_categories: string[];
  is_kids: boolean;
  is_allergy_friendly: boolean;
  has_allergy_option: boolean;
}

export interface HoursPeriod {
  period: string;
  period_id: string;
  start: string;
  end: string;
  closed: boolean;
}

export interface HoursDayOpen {
  periods: HoursPeriod[];
  open: string;
  close: string;
  closed_flag?: undefined;
  refurbishment_flag?: undefined;
}

export interface HoursDayClosed {
  periods: [];
  closed_flag: true;
  open?: undefined;
  close?: undefined;
}

export interface HoursDayRefurbishment {
  periods: [];
  refurbishment_flag: true;
  open?: undefined;
  close?: undefined;
}

export type HoursDay = HoursDayOpen | HoursDayClosed | HoursDayRefurbishment;

export interface HoursData {
  generated: string;
  days: string[];
  restaurants: Record<string, Record<string, HoursDay>>;
  unmapped_period_ids: Record<string, unknown>;
  unmapped_facility_ids: string[];
}

export interface DataManifest {
  generated: string;
  restaurant_data: string;
  menu_data: string;
  hours_data: string;
}
