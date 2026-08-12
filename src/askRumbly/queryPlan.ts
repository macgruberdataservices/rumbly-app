import type { FoodLexicon } from './foodLexicon';

export type QueryAction =
  | 'find'
  | 'check_menu'
  | 'compare'
  | 'explain_process'
  | 'open_menu'
  | 'check_feature'
  | 'hours'
  | 'distance'
  | 'handoff'
  | 'clarify';

export type ClaimType =
  | 'disney_label'
  | 'menu_presence'
  | 'restaurant_feature'
  | 'restaurant_hours'
  | 'restaurant_location'
  | 'venue_amenity'
  | 'sensory_attribute'
  | 'price_comparison'
  | 'ingredient_content'
  | 'allergy_safety'
  | 'cross_contact'
  | 'kitchen_process'
  | 'live_availability'
  | 'official_policy'
  | 'editorial_judgment'
  | 'live_park_operations'
  | 'general_information';

export type EntityType = 'restaurant' | 'park' | 'area' | 'resort' | 'attraction';
export type LocationEntityType = 'park' | 'area' | 'resort';

export interface DistanceAnchorConstraint {
  entityId: string;
  entityType: 'attraction' | 'area';
  label: string;
  latitude: number;
  longitude: number;
  approximation: 'representative-point' | 'central-area';
}

export interface SourceSpan {
  start: number;
  end: number;
  text: string;
}

export interface LinkedEntity extends SourceSpan {
  id: string;
  label: string;
  type: EntityType;
  matchedAlias: string;
  distanceAnchor?: DistanceAnchorConstraint;
}

export type RestaurantFeature =
  | 'mobile_order'
  | 'walk_up_list'
  | 'reservations'
  | 'quick_service'
  | 'character_dining'
  | 'table_service'
  | 'festival_booth'
  | 'resort_bar'
  | 'wait_time';

export interface QueryPlan {
  version: 1;
  sourceText: string;
  action: QueryAction;
  claimType: ClaimType;
  subject: {
    foodTerms: string[];
    excludedFoodTerms: string[];
    foodMode: 'all' | 'any';
    restaurantIds: string[];
  };
  constraints: {
    allergenKeys: string[];
    allergenMode: 'all';
    dietaryKeys: Array<'plant-based' | 'vegetarian' | 'kosher' | 'kids'>;
    mealPeriods: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>;
    location?: {
      relation: 'in' | 'near';
      entityId: string;
      entityType: LocationEntityType;
      label: string;
    };
    locations?: Array<{
      relation: 'in' | 'near';
      entityId: string;
      entityType: LocationEntityType;
      label: string;
    }>;
    locationMode?: 'any';
    locationSet?: 'theme_parks';
    requiredFeatures: RestaurantFeature[];
    excludedFeatures: RestaurantFeature[];
    serviceStyle?: string;
    cuisine?: string;
    priceOperation?: 'cheapest' | 'maximum';
    maxPrice?: number;
    distanceOperation?: 'nearest';
    distanceAnchor?: DistanceAnchorConstraint;
    distanceRadiusMiles?: number;
    time?: 'now' | 'today' | 'tomorrow';
  };
  linkedEntities: LinkedEntity[];
  diagnostics: {
    confidence: 'high' | 'medium' | 'low';
    consumedSpans: SourceSpan[];
    meaningfulUnconsumedText: string;
    reasons: string[];
    /** Name of the claim rule that fired. See claimRules.ts. */
    claimRule?: string;
    /** Every claim feature the question matched, not only the deciding one. */
    claimFeatures?: string[];
  };
}

export interface ParserEntity {
  id: string;
  label: string;
  type: EntityType;
  aliases: string[];
  distanceAnchor?: DistanceAnchorConstraint;
}

export interface ParserVocabulary {
  entities: ParserEntity[];
  protectedFoodPhrases?: string[];
  cuisines?: string[];
  /**
   * Data-derived vocabulary of things a guest can ask for. When present the
   * parser recognises food against it instead of inferring food by deleting
   * everything it recognised as something else. See foodLexicon.ts.
   */
  foodLexicon?: FoodLexicon;
}
