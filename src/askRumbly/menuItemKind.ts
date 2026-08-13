import type { MenuItem } from '../data/types';
import { normalizeForSearch } from '../data/diacritics';
import type { BeverageRole, MenuItemKind, QueryPlan } from './queryPlan';

export const MENU_ITEM_KIND_LABELS: Readonly<Record<MenuItemKind, string>> = {
  cocktail: 'A cocktail or alcoholic drink',
  non_alcoholic_drink: 'A non-alcoholic drink',
  dessert: 'A dessert or treat',
  savory: 'A savory dish',
};

const ALCOHOL_INGREDIENT = /\b(?:bourbon|whisk(?:e)?y|vodka|tequila|mezcal|rum|gin|cognac|brandy|liqueur|kahlua|amaretto|vermouth|campari|aperol|chartreuse|bitters|prosecco|champagne|hard cider)\b/;
const ALCOHOLIC_ROLE = /\b(?:spirits?[ -]cocktails?|cocktails?|martinis?|margaritas?|mojitos?|sangria|libations?|alcoholic|with alcohol|beers?|lager|ales?|hard cider|wine|liquor cabinet|after dinner drinks?)\b/;
const NON_ALCOHOLIC_ROLE = /\b(?:spirit[ -]free|zero[ -]proof|non[ -]alcoholic|without alcohol|mocktails?|coffee|espresso|cold brew|tea|lemonade|juice|smoothies?|refreshments?|soft drinks?|soda|milk|beverages?)\b/;
const COCKTAIL_NAME = /\b(?:martinis?|margaritas?|mojitos?|sangria|cocktails?)\b/;
const DESSERT_ROLE = /\b(?:desserts?|sundaes?|ice cream|gelato|sorbet|dole whip|cakes?|cupcakes?|shortcakes?|cheesecakes?|cookies?|brownies?|doughnuts?|donuts?|beignets?|churros?|cinnamon rolls?|pastr(?:y|ies)|pies?|fudge|sweet treats?)\b/;
const SAVORY_ROLE = /\b(?:entr(?:e|é)es?|appetizers?|starters?|sandwich(?:es)?|burgers?|hot dogs?|pizza|flatbreads?|sides?|ribs?|roast|meatloaf|salads?|soups?|chicken|beef|pork|seafood|pasta|rice|noodles|tacos?|burritos?|snacks?)\b/;
const DESSERT_NAME = /\b(?:desserts?|sundaes?|ice cream|gelato|sorbet|dole whip|milkshakes?|cupcakes?|shortcakes?|cheesecakes?|cookies?|brownies?|doughnuts?|donuts?|beignets?|churros?|cinnamon rolls?|pastr(?:y|ies)|fudge|sweet treats?)\b/;
const SAVORY_NAME = /\b(?:sandwich(?:es)?|burgers?|hot dogs?|pizza|flatbreads?|ribs?|roast|meatloaf|salads?|soups?|chicken|beef|pork|seafood|pasta|rice|noodles|tacos?|burritos?|pretzels?)\b/;
const NON_ALCOHOLIC_BEVERAGE_HEAD = /\b(?:coffee|espresso|cold brew|lattes?|cappuccinos?|tea|lemonade|juice|smoothies?|soda|milk|refresco|spritzers?)\b\s*$/;
const SAVORY_CATEGORY = /\b(?:entr(?:e|é)es?|appetizers?|starters?|sandwich(?:es)?|burgers?|hot dogs?|pizza|flatbreads?|sides?|ribs?|roast|meatloaf|salads?|soups?|seafood|pasta|tacos?|burritos?)\b/;

function fields(item: MenuItem) {
  const name = normalizeForSearch(item.item);
  const publishedCategory = normalizeForSearch(`${item.category} ${item.category_group}`);
  const normalizedCategories = normalizeForSearch((item.norm_categories ?? []).join(' '));
  const category = `${publishedCategory} ${normalizedCategories}`.trim();
  const description = normalizeForSearch(item.description);
  return { name, category, publishedCategory, normalizedCategories, description, all: `${name} ${category} ${description}` };
}

/**
 * Decide the explicit alcohol constraint from redundant evidence. Unlike a
 * menu-item role, this intentionally includes alcoholic desserts and savory
 * dishes. The source boolean is useful but cannot stand alone because the
 * current menu snapshot contains known false negatives.
 */
export function menuItemHasAlcohol(item: MenuItem): boolean {
  const value = fields(item);
  const explicitNonAlcoholic = /\b(?:spirit[ -]free|zero[ -]proof|non[ -]alcoholic|without alcohol|mocktails?)\b/.test(`${value.name} ${value.publishedCategory}`);
  const alcoholIngredients = ALCOHOL_INGREDIENT.test(value.description);
  if (explicitNonAlcoholic) return false;
  const publishedWithoutProvenance = value.publishedCategory.replace(/\bwine[ -]country\b/g, '');
  const wineCountryCategoryNoise = /\bwine[ -]country\b/.test(value.publishedCategory)
    && !ALCOHOLIC_ROLE.test(publishedWithoutProvenance)
    && !ALCOHOL_INGREDIENT.test(`${value.name} ${value.description}`);
  if (wineCountryCategoryNoise) return false;
  return item.is_alcoholic
    || ALCOHOLIC_ROLE.test(publishedWithoutProvenance)
    || alcoholIngredients;
}

/**
 * A zero-proof cocktail is narrower than an arbitrary non-alcoholic drink.
 * Require an explicit published role or a crafted row under Disney's
 * Spirit-Free heading so soda, milk, coffee, and water cannot satisfy a
 * guest asking for a mocktail-style rendition.
 */
export function menuItemIsZeroProofCocktail(item: MenuItem): boolean {
  const value = fields(item);
  const published = value.publishedCategory;
  if (/\b(?:zero[ -]proof|non[ -]alcoholic)[ -]cocktails?\b|\bmocktails?\b|\bconcoctions? without alcohol\b/.test(`${value.name} ${published}`)) {
    return !menuItemHasAlcohol(item);
  }
  if (!/\bspirit[ -]free\b/.test(published)) return false;
  const commodity = /\b(?:soda|water|tea|coffee|juice|jarritos?|agua fresca)\b/.test(value.name);
  const craftedDescription = normalizeForSearch(item.description).split(',').filter(Boolean).length >= 3;
  return !commodity && craftedDescription && !menuItemHasAlcohol(item);
}

export function itemMatchesBeverageRole(item: MenuItem, role: BeverageRole): boolean {
  if (role === 'zero_proof_cocktail') return menuItemIsZeroProofCocktail(item);
  // `unspecified` is deliberately unresolved and must produce a clarification,
  // never an executable item predicate.
  return false;
}

/**
 * Resolve a small set of mutually exclusive menu roles from redundant menu
 * evidence. `is_alcoholic` is only supporting evidence because the published
 * snapshot contains known false positives and false negatives.
 */
export function menuItemKind(item: MenuItem): MenuItemKind | null {
  const value = fields(item);
  const explicitNonAlcoholic = /\b(?:spirit[ -]free|zero[ -]proof|non[ -]alcoholic|without alcohol|mocktails?)\b/.test(`${value.name} ${value.publishedCategory}`);
  const alcoholIngredients = ALCOHOL_INGREDIENT.test(value.description);
  const seafoodCocktail = /\b(?:shrimp|prawn|seafood)\b[\s\S]*\bcocktail\b|\bcocktail sauce\b/.test(value.name);
  const savoryPie = /\b(?:shepherd'?s|pot|lobster|chicken|beef|turkey) pie\b/.test(value.name);
  const savoryName = SAVORY_NAME.test(value.name)
    || /\bcrab cakes?\b|\bcheese board\b|\bmac(?:aroni)?\s*(?:&|and)\s*cheese\b/.test(value.name)
    || seafoodCocktail
    || savoryPie;
  const dessertName = DESSERT_NAME.test(value.name)
    || (/\bcakes?\b/.test(value.name) && !/\bcrab cakes?\b/.test(value.name))
    || (/\bpies?\b/.test(value.name) && !savoryName);
  const cocktailName = COCKTAIL_NAME.test(value.name)
    && !savoryName
    && !/\b(?:martini|margarita|cocktail)\s+mix\b/.test(value.name);
  const oldFashionedName = /\bold[ -]fashioned\b/.test(value.name);
  const beverageContext = /\b(?:drink|beverage|beer|cider|wine|brew|spritz|cocktail|martini|margarita|frozen)\b/.test(`${value.name} ${value.category}`);
  const publishedAlcoholicRole = ALCOHOLIC_ROLE.test(value.publishedCategory.replace(/\bwine[ -]country\b/g, ''));
  const publishedSavoryRole = SAVORY_CATEGORY.test(value.publishedCategory);

  // Disney's explicit Spirit-Free/Zero-Proof role wins over noisy booleans,
  // bitters, alcohol-removed ingredients, and optional add-a-float copy.
  if (explicitNonAlcoholic) return 'non_alcoholic_drink';
  if (publishedSavoryRole && !menuItemHasAlcohol(item)) return 'savory';
  if (publishedAlcoholicRole) return 'cocktail';
  if (savoryName) return 'savory';
  if (cocktailName) return 'cocktail';
  if (NON_ALCOHOLIC_BEVERAGE_HEAD.test(value.name)) {
    return alcoholIngredients || item.is_alcoholic ? 'cocktail' : 'non_alcoholic_drink';
  }
  if ((alcoholIngredients && (beverageContext || oldFashionedName))
    || (!dessertName && item.is_alcoholic && /\b(?:drink|beverage|beer|cider|wine|brew|spritz|old[ -]fashioned)\b/.test(`${value.name} ${value.category}`))) {
    return 'cocktail';
  }
  if (dessertName) return 'dessert';
  if ((DESSERT_ROLE.test(value.publishedCategory) || /\bdesserts?\b/.test(value.normalizedCategories))
    && !/\b(?:thin crust )?pies?\b/.test(value.publishedCategory)) return 'dessert';
  if (NON_ALCOHOLIC_ROLE.test(`${value.name} ${value.category}`)) return 'non_alcoholic_drink';
  if (SAVORY_ROLE.test(`${value.name} ${value.category}`)) return 'savory';
  return null;
}

export function itemMatchesMenuItemKind(item: MenuItem, kind: MenuItemKind): boolean {
  const classified = menuItemKind(item);
  if (classified !== kind) return false;
  if (kind === 'non_alcoholic_drink') return !menuItemHasAlcohol(item);
  return true;
}

export function menuItemKindEvidence(item: MenuItem): string[] {
  return [item.item, item.category, item.category_group, ...(item.norm_categories ?? []), item.description]
    .filter((value): value is string => Boolean(value));
}

/**
 * Strong guest-language heads can resolve incidental riffs without a prompt.
 * “Cold brew” is coffee even though some cocktails contain it; “old
 * fashioned” intentionally has no entry because it is genuinely polysemous.
 */
/**
 * A seasonal or event theme rather than a kind of food.
 *
 * Disney publishes these as category headings -- "Halloween Offerings",
 * "Mickey's Not-So-Scary Halloween Party Exclusives" -- across desserts,
 * savory dishes, and drinks alike. That breadth is the request: a guest
 * asking for Halloween food wants the Skull Meatloaf *and* the Not-So-Poison
 * Apple Doughnuts. Asking which kind they meant would throw away the answer,
 * which is exactly what "What kind of halloween did you mean?" was doing.
 */
export function isSeasonalThemeTerm(term: string): boolean {
  const normalized = normalizeForSearch(term).trim();
  return /^(?:halloween|christmas|holidays?|hanukkah|thanksgiving|easter|valentines?(?: day)?|lunar new year|new years?(?: eve)?|fourth of july|independence day|st\.? patrick'?s(?: day)?|mardi gras|oktoberfest|festival|food and wine|flower and garden|festival of the arts)$/
    .test(normalized);
}

function exactMenuItemKind(normalized: string): MenuItemKind | null {
  const exact = (pattern: string) => new RegExp(`^(?:${pattern})$`).test(normalized);
  if (exact('martinis?|margaritas?|mojitos?|cocktails?|sangria|beers?|ciders?|wines?|espresso martini')) return 'cocktail';
  if (exact('mocktails?|coffee|espresso|cold brew|lattes?|cappuccinos?|tea|lemonade|juice|smoothies?|soda|water')) return 'non_alcoholic_drink';
  if (exact('milkshakes?|shakes?')) return 'dessert';
  if (exact('desserts?|sundaes?|ice cream|gelato|sorbet|dole whip|cakes?|cupcakes?|cookies?|brownies?|doughnuts?|donuts?|beignets?|cinnamon rolls?|fudge|churros?')) return 'dessert';
  if (exact('entr(?:e|é)es?|sandwich(?:es)?|burgers?|hot dogs?|pizza|flatbreads?|pretzels?|ribs?|roast|meatloaf|salads?|soups?|chicken|beef|pork|pasta|tacos?|burritos?')) return 'savory';
  return null;
}

export function expectedMenuItemKindForTerm(term: string): MenuItemKind | null {
  const normalized = normalizeForSearch(term).trim();
  const direct = exactMenuItemKind(normalized);
  if (direct) return direct;

  // English noun phrases are head-final: "chocolate ice cream" is a kind of
  // ice cream. Matching only whole strings made every modifier a new unknown,
  // so a guest asking for something *more* specific than the list got asked
  // what they meant -- and the answer was to add another entry. Reading the
  // head instead resolves the whole family at once.
  const words = normalized.split(/\s+/);
  let headKind: MenuItemKind | null = null;
  for (let start = 1; start < words.length && headKind == null; start += 1) {
    headKind = exactMenuItemKind(words.slice(start).join(' '));
  }
  // Disney names cocktails after soft drinks -- Kentucky Coffee, Long Island
  // Iced Tea, Bourbon Lemonade, Hard Root Beer -- and never the reverse. So a
  // head noun may promote a phrase to dessert, savory, or cocktail, but it may
  // never conclude "non-alcoholic" on its own: that is exactly the direction
  // the naming convention breaks. The whole-term match above still resolves a
  // bare "coffee", where there is no modifier to be wrong about.
  if (headKind == null || headKind === 'non_alcoholic_drink') return null;

  // "Ice cream sandwich" is the trap: its head says savory and its modifier
  // says dessert. When the two disagree the phrase is genuinely a compound
  // and neither reading may be imposed, so it falls through unnarrowed rather
  // than being filtered to the wrong half of the menu.
  for (let end = words.length - 1; end > 0; end -= 1) {
    const modifierKind = exactMenuItemKind(words.slice(0, end).join(' '));
    if (modifierKind != null && modifierKind !== headKind) return null;
  }
  return headKind;
}

/**
 * One shared policy for automatic kind narrowing. Explicit guest choices win.
 * Alcohol wording may legitimately change a canonical family: a
 * non-alcoholic margarita is a zero-proof drink, while an alcoholic Dole Whip
 * must not be filtered back to ordinary dessert rows.
 */
export function effectiveMenuItemKindForPlan(plan: QueryPlan): MenuItemKind | null {
  if (plan.constraints.menuItemKind != null) return plan.constraints.menuItemKind;
  if (plan.subject.foodTerms.length !== 1) return null;
  const expected = expectedMenuItemKindForTerm(plan.subject.foodTerms[0]);
  if (!expected) return null;
  if (plan.constraints.alcohol === 'required' && expected !== 'cocktail') return null;
  if (plan.constraints.alcohol === 'excluded' && expected === 'cocktail') return 'non_alcoholic_drink';
  return expected;
}

/** Select the same row version that execution/proof consider strongest. */
export function menuItemConstraintFailureCount(plan: QueryPlan, item: MenuItem): number {
  let failures = 0;
  if (plan.constraints.maxPrice != null && !(item.price_value > 0 && item.price_value <= plan.constraints.maxPrice)) failures += 1;
  failures += plan.constraints.allergenKeys.filter((allergen) =>
    !(item.is_allergy_friendly && (allergen === 'allergy-friendly' || item.allergens.includes(allergen)))).length;
  failures += plan.constraints.dietaryKeys.filter((dietary) => dietary === 'kids'
    ? !item.is_kids
    : (dietary === 'plant-based' || dietary === 'vegetarian')
      ? !/plant[ -]based/.test(normalizeForSearch(`${item.category} ${item.category_group}`))
      : true).length;
  const effectivePeriods = plan.subject.foodTerms.length > 0
    ? plan.constraints.mealPeriods.filter((period) => period !== 'snack')
    : plan.constraints.mealPeriods;
  if (effectivePeriods.length > 0 && !effectivePeriods.some((period) => normalizeForSearch(item.dining_period).includes(period))) failures += 1;
  if (plan.constraints.alcohol != null && menuItemHasAlcohol(item) !== (plan.constraints.alcohol === 'required')) failures += 1;
  const effectiveKind = effectiveMenuItemKindForPlan(plan);
  if (effectiveKind != null && !itemMatchesMenuItemKind(item, effectiveKind)) failures += 1;
  if (plan.constraints.beverageRole === 'zero_proof_cocktail'
    && !itemMatchesBeverageRole(item, 'zero_proof_cocktail')) failures += 1;
  return failures;
}

export function preferredMenuItemVersion(
  plan: QueryPlan,
  versions: readonly MenuItem[],
  provesFoodTerm?: (item: MenuItem, term: string) => boolean,
): MenuItem | undefined {
  const foodFailures = (item: MenuItem) => {
    if (!provesFoodTerm || plan.subject.foodTerms.length === 0) return 0;
    const matches = plan.subject.foodTerms.map((term) => provesFoodTerm(item, term));
    return plan.subject.foodMode === 'any'
      ? matches.some(Boolean) ? 0 : 1
      : matches.filter((match) => !match).length;
  };
  const evidenceStrength = (item: MenuItem) => {
    const published = normalizeForSearch(`${item.category} ${item.category_group}`);
    const normalized = normalizeForSearch((item.norm_categories ?? []).join(' '));
    const effectiveKind = effectiveMenuItemKindForPlan(plan);
    let score = 0;
    if (effectiveKind === 'cocktail' && /\b(?:cocktails?|spirits?[ -]cocktails?|martinis?|margaritas?)\b/.test(published)) score += 3;
    if (effectiveKind === 'dessert' && /\b(?:desserts?|sweets?|sweet treats?|ice cream)\b/.test(published)) score += 3;
    if (effectiveKind === 'savory' && /\b(?:entr(?:e|é)es?|appetizers?|sides?|sandwich(?:es)?|pizza)\b/.test(published)) score += 3;
    if (effectiveKind === 'non_alcoholic_drink' && /\b(?:non[ -]alcoholic|zero[ -]proof|spirit[ -]free|beverages?)\b/.test(published)) score += 3;
    if (effectiveKind && itemMatchesMenuItemKind(item, effectiveKind)) score += 1;
    if (plan.constraints.alcohol === 'required' && item.is_alcoholic) score += 1;
    if (plan.constraints.alcohol === 'excluded' && !item.is_alcoholic) score += 1;
    if (normalized.includes(effectiveKind === 'cocktail' ? 'spirits cocktails' : effectiveKind === 'dessert' ? 'desserts' : '')) score += 1;
    return score;
  };
  return [...versions].sort((a, b) => {
    const food = foodFailures(a) - foodFailures(b);
    if (food !== 0) return food;
    const constraints = menuItemConstraintFailureCount(plan, a) - menuItemConstraintFailureCount(plan, b);
    if (constraints !== 0) return constraints;
    return evidenceStrength(b) - evidenceStrength(a);
  })[0];
}
