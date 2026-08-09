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

export type EntityType = 'restaurant' | 'park' | 'area' | 'resort';

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
}

export type RestaurantFeature =
  | 'mobile_order'
  | 'walk_up_list'
  | 'reservations'
  | 'quick_service'
  | 'character_dining'
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
      entityType: Exclude<EntityType, 'restaurant'>;
      label: string;
    };
    locations?: Array<{
      relation: 'in' | 'near';
      entityId: string;
      entityType: Exclude<EntityType, 'restaurant'>;
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
    time?: 'now' | 'today' | 'tomorrow';
  };
  linkedEntities: LinkedEntity[];
  diagnostics: {
    confidence: 'high' | 'medium' | 'low';
    consumedSpans: SourceSpan[];
    meaningfulUnconsumedText: string;
    reasons: string[];
  };
}

export interface ParserEntity {
  id: string;
  label: string;
  type: EntityType;
  aliases: string[];
}

export interface ParserVocabulary {
  entities: ParserEntity[];
  protectedFoodPhrases?: string[];
  cuisines?: string[];
}
