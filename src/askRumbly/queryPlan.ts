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
  | 'menu_recency'
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

export type EntityType = 'restaurant' | 'park' | 'area' | 'resort' | 'pavilion' | 'attraction';
// `pavilion` is deliberately its own type rather than another `area`. It reads
// differently in copy ("in the Japan pavilion", not "in Japan") and it needs a
// far smaller `near` radius, since EPCOT's pavilions sit roughly 100m apart and
// an area-sized radius around Japan would cover most of World Showcase.
export type LocationEntityType = 'park' | 'area' | 'resort' | 'pavilion';

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

/**
 * Mutually exclusive guest-facing menu roles used to resolve a phrase whose
 * literal name matches different kinds of menu item. This is deliberately
 * narrower than Disney's category taxonomy: it exists to preserve intent at
 * the execution/proof boundary, not to replace menu categories.
 */
export type MenuItemKind =
  | 'cocktail'
  | 'non_alcoholic_drink'
  | 'dessert'
  | 'savory';

export type BeverageRole =
  | 'unspecified'
  | 'zero_proof_cocktail';

/** A bounded continuation operation that cannot erase unrelated constraints. */
export type QueryPlanRefinement =
  | { kind: 'menu_item_kind'; value: MenuItemKind }
  | { kind: 'ordering'; value: 'cheapest' | 'nearest' };

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
    /**
     * "What's new". Deliberately not a claim that Disney added the item
     * recently — Rumbly cannot see before its own first collection, and early
     * classification work can attribute an old item to a recent first sighting.
     * All this constrains is when the row first appeared in Rumbly's data.
     */
    recency?: { withinDays: number };
    /**
     * An explicit ask for (or against) alcohol: "a Dole Whip with alcohol",
     * "a virgin piña colada". Distinct from ordering preference -- when this
     * is unset the executor still shows alcoholic rows, just not first.
     *
     * Needed because Disney sells both versions of the same named drink, so
     * without it "Dole Whip with alcohol" was captured as one long food term
     * and matched almost nothing.
     */
    alcohol?: 'required' | 'excluded';
    /**
     * Set only after the guest supplies or selects an otherwise ambiguous
     * menu-item role. The executor filters on it and proof independently
     * witnesses it.
     */
    menuItemKind?: MenuItemKind;
    /**
     * A guest explicitly described the requested item as a drink or beverage,
     * but did not say whether they meant an alcoholic or zero-proof version.
     * Kept separate from `menuItemKind`: it narrows a clarification to the two
     * beverage branches without pretending the ambiguity has been resolved.
     */
    beverageRole?: BeverageRole;
    priceOperation?: 'cheapest' | 'maximum';
    maxPrice?: number;
    /**
     * `nearest` is the superlative — "the closest churro" has one winner, and
     * the proof layer holds it to a global optimum. `nearby` is a request for
     * options near the guest, which wants a proximity-ranked list across
     * several venues. Treating them alike returned ten beers from whichever
     * single restaurant happened to be closest.
     */
    distanceOperation?: 'nearest' | 'nearby';
    distanceAnchor?: DistanceAnchorConstraint;
    distanceRadiusMiles?: number;
    /**
     * `specific` means the guest named a clock time ("open after 7pm").
     * Recognised rather than ignored: left unparsed it was captured as a food
     * term called "open after 7pm", and treating it as "now" would answer a
     * different question than the one asked. Rumbly declines it instead --
     * the hours data is a daily open/close pair, not a schedule it can filter
     * by arbitrary times.
     */
    time?: 'now' | 'today' | 'tomorrow' | 'specific';
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
