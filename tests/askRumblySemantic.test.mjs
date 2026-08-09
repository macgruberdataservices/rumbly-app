import assert from 'node:assert/strict';
import test from 'node:test';

import { assessPlanCapability } from '../src/askRumbly/capabilityRegistry.ts';
import { parseQueryPlan } from '../src/askRumbly/semanticParser.ts';
import { loadData } from '../modules/ask-rumbly/scripts/ask-rumbly/data.ts';
import { buildParserVocabulary } from '../modules/ask-rumbly/scripts/ask-rumbly/parser_vocabulary.ts';
import { compileQueryPlan } from '../modules/ask-rumbly/scripts/ask-rumbly/plan_compiler.ts';
import { answerQuery } from '../modules/ask-rumbly/scripts/ask-rumbly/executor.ts';
import { executeQueryPlan } from '../modules/ask-rumbly/scripts/ask-rumbly/typed_plan_executor.ts';
import { itemProvesFoodTerm } from '../modules/ask-rumbly/scripts/ask-rumbly/result_proof.ts';
import { THEME_PARK_ORDER } from '../src/data/locationNames.ts';

const data = await loadData();
const vocabulary = buildParserVocabulary(data);

function parse(question) {
  const plan = parseQueryPlan(question, vocabulary);
  return { plan, capability: assessPlanCapability(plan) };
}

function compile(question) {
  const parsed = parse(question);
  const compilation = compileQueryPlan(parsed.plan);
  return {
    ...parsed,
    compilation,
    result: compilation.kind === 'compiled' ? answerQuery(compilation.query, data) : null,
  };
}

function execute(question) {
  const { plan } = parse(question);
  return { plan, result: executeQueryPlan(plan, data) };
}

test('ordering process is routed to official guidance, never an allergy restaurant list', () => {
  const { plan, capability } = parse('What is the process for ordering allergy-friendly food through Mobile Order?');
  assert.equal(plan.action, 'explain_process');
  assert.equal(plan.claimType, 'official_policy');
  assert.deepEqual(plan.constraints.requiredFeatures, ['mobile_order']);
  assert.equal(capability.disposition, 'handoff');
  assert.deepEqual(plan.subject.foodTerms, []);
});

test('narrative and does not split an allergen/location request into foods', () => {
  const { plan, capability } = parse("I have a dairy allergy and I'm near Liberty Square.");
  assert.equal(plan.action, 'find');
  assert.equal(plan.claimType, 'disney_label');
  assert.deepEqual(plan.constraints.allergenKeys, ['milk']);
  assert.equal(plan.constraints.location?.relation, 'near');
  assert.match(plan.constraints.location?.label ?? '', /Liberty Square/i);
  assert.deepEqual(plan.subject.foodTerms, []);
  assert.equal(capability.disposition, 'execute');
});

test('food conjunctions are compositional while known dish names stay atomic', () => {
  assert.deepEqual(parse('Where can I get a burger and a beer?').plan.subject, {
    foodTerms: ['burger', 'beer'], excludedFoodTerms: [], foodMode: 'all', restaurantIds: [],
  });
  assert.deepEqual(parse('Where can I get mac and cheese?').plan.subject.foodTerms, ['mac and cheese']);
  assert.deepEqual(parse('Where can I get pizza or burgers?').plan.subject, {
    foodTerms: ['pizza', 'burgers'], excludedFoodTerms: [], foodMode: 'any', restaurantIds: [],
  });
});

test('cross-contact and kitchen-process questions cannot execute a menu search', () => {
  for (const [question, expectedClaim] of [
    ['Which restaurants prevent cross-contact?', 'cross_contact'],
    ['Where is there a dedicated allergy fryer?', 'kitchen_process'],
  ]) {
    const { plan, capability } = parse(question);
    assert.equal(plan.claimType, expectedClaim, question);
    assert.notEqual(plan.action, 'find', question);
    assert.equal(capability.disposition, 'unsupported', question);
  }
});

test('safety language changes the claim and forces clarification', () => {
  const safety = parse('What is safe for a tree nut allergy?');
  assert.equal(safety.plan.claimType, 'allergy_safety');
  assert.equal(safety.plan.action, 'clarify');
  assert.equal(safety.capability.disposition, 'clarify');

  const labels = parse('What does Disney list for a tree nut allergy?');
  assert.equal(labels.plan.claimType, 'disney_label');
  assert.equal(labels.capability.disposition, 'execute');
});

test('restaurant menu and feature questions become app-routing plans', () => {
  const menu = parse("What's on the menu at Cosmic Ray's?");
  assert.equal(menu.plan.action, 'open_menu');
  assert.equal(menu.plan.claimType, 'menu_presence');
  assert.equal(menu.plan.subject.restaurantIds.length, 1);

  const feature = parse('What quick-service restaurants have Mobile Order?');
  assert.equal(feature.plan.action, 'find');
  assert.equal(feature.plan.claimType, 'restaurant_feature');
  assert.deepEqual(new Set(feature.plan.constraints.requiredFeatures), new Set(['quick_service', 'mobile_order']));
});

test('restaurant-scoped item queries preserve both the entity and food', () => {
  const { plan } = parse('Does Cosmic Rays have fries?');
  assert.equal(plan.action, 'check_menu');
  assert.equal(plan.subject.restaurantIds.length, 1);
  assert.deepEqual(plan.subject.foodTerms, ['fries']);
});

test('resort aliases and location relation are part of the plan', () => {
  const { plan } = parse('Where can I get ice cream at Coronado?');
  assert.deepEqual(plan.subject.foodTerms, ['ice cream']);
  assert.equal(plan.constraints.location?.relation, 'in');
  assert.match(plan.constraints.location?.label ?? '', /Coronado Springs/i);
});

test('park operations and weather are explicitly out of domain', () => {
  for (const [question, claim] of [
    ['What time does the park open?', 'live_park_operations'],
    ["What's the weather today?", 'general_information'],
  ]) {
    const { plan, capability } = parse(question);
    assert.equal(plan.action, 'handoff');
    assert.equal(plan.claimType, claim);
    assert.equal(capability.disposition, 'unsupported');
  }
});

test('adding a location or allergen constraint does not broaden the semantic request', () => {
  const base = parse('Where can I get chicken?').plan;
  const constrained = parse('Where can I get gluten-free chicken near Magic Kingdom?').plan;
  assert.deepEqual(constrained.subject.foodTerms, base.subject.foodTerms);
  assert.ok(constrained.constraints.allergenKeys.length > 0);
  assert.ok(constrained.constraints.location);
});

test('high-confidence food plans compile into the existing validated executor', () => {
  const { compilation, result } = compile('Where can I get a burger and a beer?');
  assert.equal(compilation.kind, 'compiled');
  assert.equal(compilation.query.queryType, 'list');
  assert.deepEqual(compilation.query.items, ['burger', 'beer']);
  assert.equal(compilation.query.compoundMode, 'and');
  assert.equal(result.kind, 'answer');
});

test('semantic compilation preserves menu routing rather than transcribing a menu', () => {
  const { compilation, result } = compile("What's on the menu at Cosmic Ray's?");
  assert.equal(compilation.kind, 'compiled');
  assert.equal(compilation.query.queryType, 'menu');
  assert.equal(result.kind, 'answer');
  assert.equal(result.actions?.[0]?.kind, 'openRestaurant');
});

test('semantic feature intersections compile when the executor can preserve every constraint', () => {
  const { compilation, result } = compile('What quick-service restaurants have Mobile Order?');
  assert.equal(compilation.kind, 'compiled');
  assert.equal(compilation.query.queryType, 'attributeList');
  assert.equal(compilation.query.attribute, 'mobile_order');
  assert.equal(compilation.query.serviceStyle, 'Quick Service');
  assert.equal(result.kind, 'answer');
});

test('compiler refuses plans the old executor would silently weaken', () => {
  const near = compile('Where can I get gluten-free food near Magic Kingdom?');
  assert.equal(near.compilation.kind, 'not_compiled');
  assert.match(near.compilation.reason, /distance relative/i);

  const maximum = compile('Where can I get a burger under $15?');
  assert.equal(maximum.plan.constraints.maxPrice, 15);
  assert.equal(maximum.compilation.kind, 'not_compiled');
  assert.match(maximum.compilation.reason, /maximum-price/i);
});

test('park names cannot be stolen by similarly named resorts', () => {
  const { plan } = parse('Where can I get a meal under $15 at Animal Kingdom?');
  assert.equal(plan.constraints.location?.entityType, 'park');
  assert.match(plan.constraints.location?.label ?? '', /^\s*(?:Disney's )?Animal Kingdom(?: Theme Park)?\s*$/i);
  assert.doesNotMatch(plan.constraints.location?.label ?? '', /Lodge|Villas/i);
});

test('unsupported sensory properties cannot masquerade as menu items', () => {
  const parsed = compile("Does Satu'li Canteen have anything spicy?");
  assert.equal(parsed.plan.claimType, 'sensory_attribute');
  assert.equal(parsed.capability.disposition, 'unsupported');
  assert.equal(parsed.compilation.kind, 'not_compiled');
});

test('unsupported and low-confidence claims cannot compile', () => {
  for (const question of [
    'Which restaurants prevent cross-contact?',
    'What is the best restaurant for allergies?',
    'What kosher meals are available?',
  ]) {
    assert.equal(compile(question).compilation.kind, 'not_compiled', question);
  }
});

test('politeness, casing, whitespace, and smart punctuation preserve semantic plans', () => {
  const questions = [
    "What's on the menu at Cosmic Ray's?",
    'Where can I get a burger and a beer?',
    'Does Satu\'li Canteen have gluten-free bowls?',
    'What is the process for ordering allergy-friendly food through Mobile Order?',
    'Which restaurants prevent cross-contact?',
  ];
  const signature = (question) => {
    const { plan, capability } = parse(question);
    return {
      action: plan.action,
      claimType: plan.claimType,
      foodTerms: plan.subject.foodTerms,
      foodMode: plan.subject.foodMode,
      restaurantIds: plan.subject.restaurantIds,
      allergenKeys: plan.constraints.allergenKeys,
      requiredFeatures: plan.constraints.requiredFeatures,
      disposition: capability.disposition,
    };
  };
  for (const question of questions) {
    const expected = signature(question);
    const variants = [
      `Please tell me: ${question}`,
      question.toLowerCase().replace(/\s+/g, '  '),
      question.replaceAll("'", '’'),
    ];
    for (const variant of variants) assert.deepEqual(signature(variant), expected, variant);
  }
});

test('typed execution preserves park and maximum-price constraints', () => {
  const { result } = execute('Where can I get a meal under $15 at Animal Kingdom?');
  assert.equal(result.kind, 'answer');
  assert.ok(result.trace.appliedConstraints.includes('location:in'));
  assert.ok(result.trace.appliedConstraints.includes('maximum-price'));
  assert.equal(result.proof.status, 'proven');
  assert.ok(result.proof.witnesses.some((witness) => witness.constraint === 'location'));
  assert.ok(result.proof.witnesses.some((witness) => witness.constraint === 'maximum-price'));
  const returned = new Set(result.itemKeys);
  const items = data.menuItems.filter((item) => returned.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.price_value > 0 && item.price_value <= 15));
  const restaurants = new Map(data.restaurants.map((restaurant) => [restaurant.restaurant_id, restaurant]));
  assert.ok(items.every((item) => /animal kingdom/i.test(restaurants.get(item.restaurant_id)?.park ?? '')));
});

test('typed execution intersects restaurant features before listing', () => {
  const { result } = execute('What quick-service restaurants have Mobile Order?');
  assert.equal(result.kind, 'answer');
  const ids = new Set(result.restaurantIds);
  const matches = data.restaurants.filter((restaurant) => ids.has(restaurant.restaurant_id));
  assert.ok(matches.length > 0);
  assert.ok(matches.every((restaurant) => restaurant.service_style === 'Quick Service'));
  assert.ok(matches.every((restaurant) => restaurant.raw_facets.some((facet) => facet.id === 'mobile-orders' || /mobile order/i.test(facet.name))));
  assert.equal(result.proof.status, 'proven');
  assert.ok(result.proof.witnesses.some((witness) => witness.constraint === 'feature:mobile_order'));
});

test('typed allergy execution uses the exact Disney label taxonomy and acknowledgement', () => {
  const { plan, result } = execute('Where can I get gluten-free food near Magic Kingdom?');
  assert.deepEqual(plan.constraints.allergenKeys, ['gluten-wheat']);
  assert.equal(result.kind, 'answer');
  assert.deepEqual(result.safety?.allergenKeys, ['gluten-wheat']);
  assert.match(result.text, /^Disney lists/i);
  assert.match(result.trace.locationApproximation ?? '', /centroid/i);
  const ids = new Set(result.itemKeys);
  const items = data.menuItems.filter((item) => ids.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.is_allergy_friendly && item.allergens.includes('gluten-wheat')));
  assert.equal(result.proof.status, 'proven');
  assert.ok(result.proof.witnesses.some((witness) => witness.constraint === 'disney-allergen:gluten-wheat'));
});

test('typed allergy execution fails closed when no direct Disney label survives', () => {
  const { result } = execute("Does Sunshine Seasons have a dairy-free entree that isn't just a salad?");
  assert.equal(result.kind, 'no-match');
  assert.match(result.text, /Disney lists/i);
  assert.match(result.text, /Cast Member/i);
  assert.deepEqual(result.safety?.allergenKeys, ['milk']);
});

test('grouped character-breakfast hours return restaurants rather than loose menu rows', () => {
  const { plan, result } = execute('What character breakfasts are open this morning?');
  assert.deepEqual(plan.constraints.mealPeriods, ['breakfast']);
  assert.equal(result.kind, 'answer');
  assert.equal(result.itemIds, undefined);
  assert.match(result.text, /Open today/i);
  const ids = new Set(result.restaurantIds);
  const matches = data.restaurants.filter((restaurant) => ids.has(restaurant.restaurant_id));
  assert.ok(matches.length > 0);
  assert.ok(matches.every((restaurant) => restaurant.is_character_dining));
  assert.ok(matches.every((restaurant) => restaurant.meal_periods.some((period) => /breakfast/i.test(period))));
});

test('open-now location plans execute as scoped restaurant lists', () => {
  const { result } = execute('What restaurants are open right now near Tomorrowland?');
  assert.notEqual(result.kind, 'error');
  assert.ok(result.trace?.appliedConstraints.includes('location:near:0.75mi'));
  if (result.kind === 'answer') assert.match(result.text, /Open till/i);
});

test('dietary plus allergy intersections do not broaden either source label', () => {
  const { result } = execute('What vegetarian dishes at Animal Kingdom are also nut-free?');
  assert.notEqual(result.kind, 'error');
  assert.match(result.text, /Disney|Plant-Based/i);
  if (result.kind === 'answer') {
    const ids = new Set(result.itemKeys);
    const items = data.menuItems.filter((item) => ids.has(`${item.restaurant_id}:${item.item_id}`));
    assert.ok(items.every((item) => /plant[ -]based/i.test(`${item.category} ${item.category_group}`)));
    assert.ok(items.every((item) => item.is_allergy_friendly && item.allergens.includes('tree-nut')));
  }
});

test('feature phrases and soft adjectives do not leak into food matching', () => {
  const quickService = execute("What's the cheapest quick service meal in Hollywood Studios?");
  assert.deepEqual(quickService.plan.subject.foodTerms, ['meal']);
  assert.equal(quickService.result.kind, 'answer');
  assert.ok(quickService.result.trace.appliedConstraints.includes('feature:quick_service'));

  const priced = execute('Where can I get a decent meal under $15 at Animal Kingdom?');
  assert.deepEqual(priced.plan.subject.foodTerms, ['meal']);
  assert.equal(priced.result.kind, 'answer');
  assert.ok(priced.result.trace.appliedConstraints.includes('maximum-price'));
});

test('food-specific allergy matching retains direct-label visibility after prefiltering', () => {
  const dessert = execute('Show me dairy-free desserts in Epcot.');
  assert.notEqual(dessert.result.kind, 'error');
  assert.match(dessert.result.text, /Disney/i);
  assert.deepEqual(dessert.result.safety?.allergenKeys, ['milk']);

  const mobile = execute('Can I get gluten-free mobile order options at Docking Bay 7?');
  assert.equal(mobile.result.kind, 'answer');
  assert.ok(mobile.result.itemIds?.length > 0);
  assert.ok(mobile.result.trace.appliedConstraints.includes('feature:mobile_order'));
  assert.deepEqual(mobile.result.safety?.allergenKeys, ['gluten-wheat']);
});

test('casual discourse is consumed without weakening the dining request', () => {
  // Keep this parser/discourse regression independent of the wall clock;
  // the separate open-now tests cover the time constraint against the live
  // hours snapshot.
  const turkey = execute('yo where can i get a turkey leg');
  assert.deepEqual(turkey.plan.subject.foodTerms, ['turkey leg']);
  assert.equal(turkey.result.kind, 'answer');
  const rightNow = parse('yo where can i get a turkey leg rn').plan;
  assert.equal(rightNow.diagnostics.meaningfulUnconsumedText, '');

  const allergy = execute("we need gluten free asap my wife's celiac");
  assert.equal(allergy.plan.diagnostics.confidence, 'high');
  assert.deepEqual(allergy.plan.constraints.allergenKeys, ['gluten-wheat']);
  assert.notEqual(allergy.result.kind, 'error');
});

test('unverifiable venue and food attributes cannot execute as menu terms', () => {
  for (const question of [
    "i want something that isn't fried for once",
    'Where can I eat inside a giant aquarium surrounded by sea life at Epcot?',
    'Where can I get custom latte art with Disney characters printed on the foam?',
  ]) {
    const { result } = execute(question);
    assert.equal(result.kind, 'unsupported', question);
  }
});

test('landmark aliases and alternative locations remain typed constraints', () => {
  const landmark = execute('Where can I eat a meal under $15 near Space Mountain?');
  assert.equal(landmark.plan.constraints.location?.label, 'Tomorrowland');
  assert.equal(landmark.plan.constraints.location?.relation, 'near');

  const alternatives = parse('Where can I get a burger in Epcot or Magic Kingdom?').plan;
  assert.equal(alternatives.constraints.locationMode, 'any');
  assert.equal(alternatives.constraints.locations?.length, 2);
});

test('negated restaurant features are applied rather than inverted', () => {
  const { plan, result } = execute('Which resort lounges do not require advance dining reservations for walk-in seating?');
  assert.ok(plan.constraints.requiredFeatures.includes('resort_bar'));
  assert.deepEqual(plan.constraints.excludedFeatures, ['reservations']);
  assert.equal(result.kind, 'answer');
  assert.ok(result.trace.appliedConstraints.includes('excluded-feature:reservations'));
});

test('result proof rejects partial modifier matches before they become answers', () => {
  const plain = data.menuItems.find((item) => /^DOLE Whip® Pineapple Juice Float$/i.test(item.item));
  assert.ok(plain);
  assert.equal(itemProvesFoodTerm(plain, 'dole whip float with rum'), false);

  const rum = data.menuItems.find((item) => /DOLE Whip.*Float with.*Rum/i.test(item.item));
  assert.ok(rum);
  assert.equal(itemProvesFoodTerm(rum, 'dole whip float with rum'), true);

  const result = execute('Where can I get a Dole Whip float with rum?').result;
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.length > 0);
  assert.ok(returned.every((item) => itemProvesFoodTerm(item, 'dole whip float with rum')));
});

test('specific preparation terms require bounded item or category evidence', () => {
  const cheesePizza = data.menuItems.find((item) => /^Cheese Pizza$/i.test(item.item) && !/wood/i.test(item.category));
  assert.ok(cheesePizza);
  assert.equal(itemProvesFoodTerm(cheesePizza, 'wood-fired pizza'), false);

  const result = execute('Where can I get wood-fired pizza?').result;
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.every((item) => itemProvesFoodTerm(item, 'wood-fired pizza')));
});

test('all-four-parks scope excludes resorts and Disney Springs while representing each park', () => {
  const { plan, result } = execute('Where can I get a burger across all four parks?');
  assert.equal(plan.constraints.locationSet, 'theme_parks');
  assert.equal(result.kind, 'answer');
  assert.ok(result.trace.appliedConstraints.includes('location:set:theme-parks'));
  const ids = new Set(result.restaurantIds);
  const parks = new Set(data.restaurants.filter((restaurant) => ids.has(restaurant.restaurant_id)).map((restaurant) => restaurant.park));
  assert.deepEqual(parks, new Set(THEME_PARK_ORDER));
});

test('budget result lists exclude obvious modifiers, toppings, and add-ons', () => {
  const { result } = execute('Where can I get food under $10 at Magic Kingdom?');
  assert.equal(result.kind, 'answer');
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.length > 0);
  assert.ok(returned.every((item) => !/^(?:sprinkles?|whipped cream|syrups?|hot fudge|caramel(?: sauce| topping)?|flavored syrup|candy pieces?)$/i.test(item.item.trim())));
  assert.ok(returned.every((item) => !/\b(?:toppings?|add[- ]?ons?|condiments?|extras?)\b/i.test(`${item.category} ${item.category_group}`)));
});

test('temporal and location suffixes cannot leak into the food witness', () => {
  const { plan, result } = execute('Where is the closest place to buy a classic Dole Whip today in Magic Kingdom?');
  assert.deepEqual(plan.subject.foodTerms, ['dole whip']);
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
});

test('preparation modifiers are retained and partial style matches fail closed', () => {
  const { plan, result } = execute('Where can I get a quick wood-fired style pizza inside Hollywood Studios?');
  assert.deepEqual(plan.subject.foodTerms, ['wood-fired style pizza']);
  assert.equal(result.kind, 'no-match');
  assert.match(result.text, /couldn.t verify|doesn't match/i);
});

test('resort entity names do not become accidental cuisine filters', () => {
  const { plan, result } = execute('Where can I order a Dole Whip float with rum inside Animal Kingdom or Polynesian Resort?');
  assert.equal(plan.constraints.cuisine, undefined);
  assert.equal(plan.constraints.locationMode, 'any');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
});

test('cheapest food answers return only globally optimal proven rows', () => {
  const { result } = execute('What is the cheapest burger?');
  assert.equal(result.kind, 'answer');
  const witness = result.proof.witnesses.find((entry) => entry.constraint === 'global-cheapest');
  assert.ok(witness);
  const optimum = Number(witness.evidence.find((entry) => entry.startsWith('optimum='))?.split('=')[1]);
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.length > 0);
  assert.ok(returned.every((item) => item.price_value === optimum));
});

test('nearest named food is a food search with a global distance witness', () => {
  const { plan, result } = execute('What is the nearest burger?');
  assert.equal(plan.action, 'find');
  assert.equal(plan.claimType, 'menu_presence');
  assert.equal(plan.constraints.distanceOperation, 'nearest');
  assert.equal(result.kind, 'answer');
  assert.ok(result.proof.witnesses.some((entry) => entry.constraint === 'global-nearest'));
  assert.equal(result.restaurantIds.length, 1);
});

test('nearest-from-landmark language clarifies until exact landmark origins are modeled', () => {
  const { plan, result } = execute("Where's the nearest churro cart from Space Mountain?");
  assert.equal(plan.claimType, 'restaurant_location');
  assert.equal(plan.action, 'clarify');
  assert.equal(result.kind, 'clarification');
});

test('compound beer proof excludes beer-battered food and non-alcoholic ginger beer', () => {
  const { result } = execute('Where is the cheapest place to get a burger and a beer?');
  assert.equal(result.kind, 'answer');
  assert.ok(result.proof.witnesses.some((entry) => entry.constraint === 'global-cheapest'));
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.some((item) => itemProvesFoodTerm(item, 'burger')));
  const beer = returned.find((item) => itemProvesFoodTerm(item, 'beer'));
  assert.ok(beer);
  assert.doesNotMatch(beer.item, /beer[ -]battered|ginger beer|root beer/i);
  assert.match(`${beer.category} ${beer.category_group}`, /beer|cider|draft|alcoholic/i);
});

test('generic cheapest searches expose only tied global winners', () => {
  const { result } = execute('What is the cheapest food near Space Mountain that is not a hot dog?');
  assert.equal(result.kind, 'answer');
  const witness = result.proof.witnesses.find((entry) => entry.constraint === 'global-cheapest');
  assert.ok(witness);
  const optimum = Number(witness.evidence.find((entry) => entry.startsWith('optimum='))?.split('=')[1]);
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.length > 0);
  assert.ok(returned.every((item) => item.price_value === optimum));
  assert.ok(returned.every((item) => !/hot dog/i.test(`${item.item} ${item.category} ${item.category_group}`)));
});

test('ordinary hours and distance framing is consumed as grammar', () => {
  for (const question of [
    'when does cosmic rays open?',
    'what time does cosmic rays open?',
    'when does cosmic rays close?',
    'how far away is cosmic rays?',
  ]) {
    const { plan, result } = execute(question);
    assert.equal(plan.diagnostics.confidence, 'high', question);
    assert.equal(plan.diagnostics.meaningfulUnconsumedText, '', question);
    assert.equal(result.kind, 'answer', question);
    assert.equal(result.proof.status, 'proven', question);
  }
});

test('food words repeated inside a restaurant name bind to the trailing requested food', () => {
  const { plan, result } = execute('does the Plaza Ice Cream Parlor serve ice cream');
  assert.equal(plan.diagnostics.confidence, 'high');
  assert.deepEqual(plan.subject.foodTerms, ['ice cream']);
  const foodSpan = plan.diagnostics.consumedSpans.find((span) => span.text.toLowerCase() === 'ice cream');
  assert.equal(foodSpan?.start, 38);
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
});

test('restaurant-scoped negative menu checks return a clean current-data no-match', () => {
  const { result } = execute("does Cosmic Ray's Starlight Café serve ice cream?");
  assert.equal(result.kind, 'no-match');
  assert.match(result.text, /^No verified match:/);
  assert.match(result.text, /current menu data/i);
  assert.doesNotMatch(result.text, /partial match|couldn't verify/i);
});

test('restaurant-scoped ice-cream checks recognize scoop-service menu vocabulary', () => {
  const { plan, result } = execute('does salt and straw serve ice cream?');
  assert.equal(plan.subject.restaurantIds[0], 'salt-straw');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Salt & Straw/i);
  assert.match(result.text, /(?:Single|Double) Scoop/i);
  assert.equal(result.proof.status, 'proven');
});

test('corndog spelling resolves corn-dog menu categories', () => {
  const { plan, result } = execute('where can i get a corndog?');
  assert.deepEqual(plan.subject.foodTerms, ['corndog']);
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Blue Ribbon Corn Dogs/i);
  assert.doesNotMatch(result.text, /Street Corn Hot Dog/i);
  assert.equal(result.proof.status, 'proven');
});

test('named restaurant feature checks report yes or no without filtering the restaurant away', () => {
  const { plan, result } = execute('does cosmic rays have a walk up list?');
  assert.equal(plan.action, 'check_feature');
  assert.deepEqual(plan.subject.foodTerms, []);
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /does not appear to offer a Walk-Up List/i);
  assert.ok(result.proof.witnesses.some((entry) => entry.constraint === 'feature-check:walk_up_list' && entry.evidence.includes('feature absent')));
});

test('where-are and who-has grammar produce food searches', () => {
  const kids = execute('where are kids chicken fingers?');
  assert.deepEqual(kids.plan.subject.foodTerms, ['chicken fingers']);
  assert.deepEqual(kids.plan.constraints.dietaryKeys, ['kids']);
  assert.equal(kids.result.kind, 'answer');
  const kidsKeys = new Set(kids.result.itemKeys);
  const kidsItems = data.menuItems.filter((item) => kidsKeys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(kidsItems.length > 0);
  assert.ok(kidsItems.every((item) => item.is_kids && itemProvesFoodTerm(item, 'chicken fingers')));

  const coffee = execute('who has coffee?');
  assert.deepEqual(coffee.plan.subject.foodTerms, ['coffee']);
  assert.equal(coffee.result.kind, 'answer');
  assert.equal(coffee.result.proof.status, 'proven');
});

test('linked location plus bare food supports terse guest queries', () => {
  const { plan, result } = execute('animal kingdom ice cream sandwich');
  assert.deepEqual(plan.subject.foodTerms, ['ice cream sandwich']);
  assert.match(plan.constraints.location?.label ?? '', /Animal Kingdom/i);
  assert.equal(plan.diagnostics.confidence, 'high');
  assert.equal(result.kind, 'answer');
  const ids = new Set(result.restaurantIds);
  const restaurants = data.restaurants.filter((restaurant) => ids.has(restaurant.restaurant_id));
  assert.ok(restaurants.every((restaurant) => /Animal Kingdom/i.test(restaurant.park ?? '')));
});

test('hunger-only input asks a useful food and location follow-up', () => {
  const { plan, result } = execute("i'm hungry");
  assert.equal(plan.action, 'clarify');
  assert.equal(plan.diagnostics.meaningfulUnconsumedText, '');
  assert.equal(result.kind, 'clarification');
  assert.match(result.text, /what kind of food/i);
  assert.match(result.text, /where/i);
});

test('cuisine names inside protected foods do not become restaurant filters', () => {
  const { plan, result } = execute("does cosmic ray's serve french fries?");
  assert.equal(plan.constraints.cuisine, undefined);
  assert.deepEqual(plan.subject.foodTerms, ['french fries']);
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.match(result.text, /Fries/i);
});

test('canonical restaurant names can witness an under-tagged cuisine', () => {
  const { plan, result } = execute('where can i get bbq in Animal Kingdom');
  assert.equal(plan.constraints.cuisine, 'bbq');
  assert.match(plan.constraints.location?.label ?? '', /Animal Kingdom/i);
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.match(result.text, /Flame Tree Barbecue/i);
});

test('terminal close in a food request means nearest rather than closing hours', () => {
  const { plan, result } = execute('where can i get fried rice close');
  assert.equal(plan.claimType, 'menu_presence');
  assert.deepEqual(plan.subject.foodTerms, ['fried rice']);
  assert.equal(plan.constraints.distanceOperation, 'nearest');
  assert.equal(plan.diagnostics.meaningfulUnconsumedText, '');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.match(result.text, /^Nearest verified match for "fried rice"/i);
  assert.equal(result.restaurantIds.length, 1);
});

test('short mobile keyword queries preserve food, location, and GF semantics', () => {
  const coffee = execute('coffee near space mountain');
  assert.deepEqual(coffee.plan.subject.foodTerms, ['coffee']);
  assert.equal(coffee.plan.constraints.location?.label, 'Tomorrowland');
  assert.equal(coffee.plan.constraints.location?.relation, 'near');
  assert.equal(coffee.result.kind, 'answer');
  assert.equal(coffee.result.proof.status, 'proven');

  const waffles = execute('gf Mickey waffles near hollywood studios');
  assert.deepEqual(waffles.plan.constraints.allergenKeys, ['gluten-wheat']);
  assert.deepEqual(waffles.plan.subject.foodTerms, ['mickey waffles']);
  assert.equal(waffles.result.kind, 'answer');
  assert.equal(waffles.result.proof.status, 'proven');
});

test('mobile lookup scaffolding does not leak into the requested food', () => {
  for (const [question, expected] of [
    ['turkey leg location magic kingdom', 'turkey leg'],
    ['pongu lumpia location', 'pongu lumpia'],
    ['beignets disney world where to get', 'beignets'],
  ]) {
    const { plan, result } = execute(question);
    assert.deepEqual(plan.subject.foodTerms, [expected], question);
    assert.equal(result.kind, 'answer', question);
    assert.equal(result.proof.status, 'proven', question);
  }
});

test('unsupported kitchen, nutrition, and amenity constraints never execute as foods', () => {
  for (const [question, claim] of [
    ['dedicated gf fryer disney springs', 'kitchen_process'],
    ['keto options flame tree bbq', 'ingredient_content'],
    ['kid friendly food with outdoor seating animal kingdom', 'venue_amenity'],
  ]) {
    const { plan, capability } = parse(question);
    assert.equal(plan.claimType, claim, question);
    assert.notEqual(capability.disposition, 'execute', question);
  }
});

test('short logistics questions route to maintained Disney guidance', () => {
  for (const question of [
    'how does mobile order work',
    'can I bring outside food into magic kingdom',
    'cancel dining reservation fee deadline',
  ]) {
    const { plan, capability } = parse(question);
    assert.equal(plan.claimType, 'official_policy', question);
    assert.equal(capability.disposition, 'handoff', question);
  }
});

test('exact landmark nearest requests clarify while near-area searches can execute', () => {
  const exact = parse('closest coffee to rise of the resistance');
  assert.equal(exact.plan.action, 'clarify');
  assert.equal(exact.capability.disposition, 'clarify');

  const area = execute('coffee near tree of life');
  assert.equal(area.plan.constraints.location?.label, 'Discovery Island');
  assert.equal(area.result.kind, 'answer');
  assert.equal(area.result.proof.status, 'proven');
});

test('restaurant menu-list shorthand routes to the existing restaurant page', () => {
  const { plan, result } = execute('baseline taphouse draft list');
  assert.equal(plan.action, 'open_menu');
  assert.deepEqual(plan.subject.foodTerms, []);
  assert.equal(result.kind, 'answer');
  assert.ok(result.actions?.some((action) => action.kind === 'openRestaurant'));
});

test('duplicate menu ids retain a constraint-satisfying period witness', () => {
  const { result } = execute('allergy friendly character breakfast magic kingdom');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.match(result.text, /Disney lists/i);
});

test('french fries do not match explicitly non-potato fry dishes', () => {
  const { result } = execute('closest place for french fries in world showcase');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.doesNotMatch(result.text, /Hummus Fries|Home Fry Potatoes|Stir Fry/i);
});
