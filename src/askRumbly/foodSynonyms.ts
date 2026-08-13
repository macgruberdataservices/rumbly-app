// Guest words to Disney words.
//
// Rumbly's menu data uses Disney's naming, and guests use their own. A guest
// asking for "soda" at Cosmic Ray's is asking about a row Disney calls
// "Assorted Fountain Beverages"; a guest asking for a "pop tart" wants a
// "Lunch Box Tart". Before this module that knowledge was spread across four
// places — an alias in the parser, a curated list in the lexicon builder, an
// alternatives table in the proof layer, and per-dish branches inside
// itemProvesFoodTerm — so a synonym added in one place silently failed in
// another.
//
// Everything here is consumed by both sides: the lexicon uses these keys to
// recognise what a guest said, and the proof layer uses the same entries to
// decide whether a returned row actually witnesses it. A term the parser can
// produce is therefore always a term the proof layer can verify.

/**
 * Acceptable evidence for a food term.
 *
 * Outer array is alternatives (any one is sufficient); inner array is the
 * tokens that must all appear. Tokens are matched after singularization, so
 * list the singular form.
 */
export const FOOD_TERM_ALTERNATIVES: Readonly<Record<string, string[][]>> = {
  burger: [['burger'], ['hamburger'], ['cheeseburger']],
  burgers: [['burger'], ['hamburger'], ['cheeseburger']],
  hamburger: [['hamburger'], ['burger'], ['cheeseburger']],
  hamburgers: [['hamburger'], ['burger'], ['cheeseburger']],
  'corn dog': [['corn', 'dog'], ['corn', 'dogs']],
  'corn dogs': [['corn', 'dog'], ['corn', 'dogs']],
  corndog: [['corn', 'dog'], ['corn', 'dogs']],
  corndogs: [['corn', 'dog'], ['corn', 'dogs']],
  fries: [['fries'], ['fry']],
  'french fries': [['french', 'fries'], ['fries'], ['fry']],
  'ice cream': [['ice', 'cream'], ['gelato'], ['sundae'], ['sorbet'], ['soft', 'serve'], ['softserve'], ['scoop']],
  'chicken fingers': [['chicken', 'finger'], ['chicken', 'strip'], ['chicken', 'tender']],
  'chicken tenders': [['chicken', 'tender'], ['chicken', 'strip'], ['chicken', 'finger']],
  // Disney does not name a single row "soda". The fountain, the branded
  // bottles, and the individual flavours are all what a guest means.
  soda: [['soda'], ['fountain', 'beverage'], ['coca', 'cola'], ['coke'], ['sprite'], ['fanta'], ['dr', 'pepper'], ['soft', 'drink']],
  sodas: [['soda'], ['fountain', 'beverage'], ['coca', 'cola'], ['coke'], ['sprite'], ['fanta'], ['dr', 'pepper'], ['soft', 'drink']],
  // "Pop" is deliberately absent. As a bare regional word for soda it collides
  // with the start of "pop tart" and "popsicle", and a one-token match there
  // would swallow the real request.
  'soft drink': [['soft', 'drink'], ['soda'], ['fountain', 'beverage'], ['coca', 'cola'], ['coke']],
  'soft drinks': [['soft', 'drink'], ['soda'], ['fountain', 'beverage'], ['coca', 'cola'], ['coke']],
  water: [['water'], ['dasani'], ['aquafina'], ['smartwater']],
  'bottled water': [['bottled', 'water'], ['dasani'], ['aquafina'], ['smartwater']],
  nuggets: [['nugget']],
  // The chicken token is mandatory. A bare "Nuggets" row can still qualify
  // when its single Disney category supplies chicken evidence, but Pretzel
  // Nuggets must never enter a chicken-nugget result set merely because it is
  // closer to the guest.
  'chicken nuggets': [['chicken', 'nugget']],
  // Disney has been renaming pizzas to "flatbread" -- Pinocchio's Village Haus
  // now publishes All-Meat, Pepperoni, and Gourmet Cheese *Flatbread*, and its
  // only remaining row with "pizza" in the name is the plant-based one. A
  // guest asking for pizza in Magic Kingdom was being handed the plant-based
  // pizza as though it were the whole answer. Listed as a fallback rather than
  // an equal, so an actual pizza still ranks first where one exists.
  pizza: [['pizza'], ['flatbread']],
  pizzas: [['pizza'], ['flatbread']],
  milkshake: [['milkshake'], ['milk', 'shake'], ['shake']],
  milkshakes: [['milkshake'], ['milk', 'shake'], ['shake']],
  'tater tots': [['tot'], ['tater', 'tot']],
  tots: [['tot'], ['tater', 'tot']],
  'mickey bar': [['mickey', 'bar'], ['mickey', 'premium', 'bar']],
  'grilled cheese': [['grilled', 'cheese']],
  'pb&j': [['peanut', 'butter', 'jelly'], ['pb', 'j'], ['uncrustable']],
  'peanut butter and jelly': [['peanut', 'butter', 'jelly'], ['pb', 'j'], ['uncrustable']],
};

/**
 * Broad food *classes* Disney publishes directly in `norm_categories`.
 *
 * Item names rarely repeat their class — "Chocolate Cake" never says
 * "dessert" — so without this a whole family of ordinary requests failed.
 * Only unambiguous slugs are listed: a combined one such as `soups-salads`
 * cannot prove which side of the pair a row belongs to, the same rule already
 * applied to mixed `category` strings.
 */
export const CLASS_TERM_CATEGORIES: Readonly<Record<string, string[]>> = {
  dessert: ['desserts'],
  desserts: ['desserts'],
  appetizer: ['appetizers'],
  appetizers: ['appetizers'],
  starter: ['appetizers'],
  starters: ['appetizers'],
  entree: ['entrees'],
  entrees: ['entrees'],
  seafood: ['seafood'],
  sushi: ['sushi'],
  side: ['sides'],
  sides: ['sides'],
  // "Do they have drinks?" spans every beverage category Disney publishes.
  // Beer is deliberately absent: its own rule already excludes root beer,
  // ginger beer, and beer-battered food, and a category match would undo that.
  drink: ['non-alcoholic', 'spirits-cocktails', 'wine', 'beer-cider'],
  drinks: ['non-alcoholic', 'spirits-cocktails', 'wine', 'beer-cider'],
  beverage: ['non-alcoholic', 'spirits-cocktails', 'wine', 'beer-cider'],
  beverages: ['non-alcoholic', 'spirits-cocktails', 'wine', 'beer-cider'],
  cocktail: ['spirits-cocktails'],
  cocktails: ['spirits-cocktails'],
};

/**
 * Everyday wording Disney publishes under a different name entirely. Applied
 * at the semantic boundary so the executor still demands exact menu evidence
 * for the canonical term rather than fuzzy-matching the guest's word.
 */
// Aliases are listed literally rather than as patterns so the food lexicon can
// be seeded with them. That matters: the lexicon matches longest-first, so
// "pop tart" has to be present as a two-token phrase or a one-token entry for
// its first word would win and swallow the rest of the request.
export const GUEST_TERM_CANONICAL: ReadonlyArray<{ aliases: string[]; canonical: string }> = [
  { aliases: ['pop tart', 'pop tarts', 'poptart', 'poptarts'], canonical: 'lunch box tart' },
  { aliases: ['pommes frites'], canonical: 'french fries' },
];

const ALIAS_LOOKUP = new Map(
  GUEST_TERM_CANONICAL.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.canonical] as const)),
);

export function canonicalGuestTerm(term: string): string {
  return ALIAS_LOOKUP.get(term.trim().toLowerCase()) ?? term;
}

/** Every term the synonym layer knows, for seeding the food lexicon. */
export function knownSynonymTerms(): string[] {
  return Array.from(new Set([
    ...Object.keys(FOOD_TERM_ALTERNATIVES),
    ...Object.keys(CLASS_TERM_CATEGORIES),
    ...GUEST_TERM_CANONICAL.flatMap((entry) => [...entry.aliases, entry.canonical]),
  ]));
}
