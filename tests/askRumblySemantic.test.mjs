import assert from 'node:assert/strict';
import test from 'node:test';

import { assessPlanCapability } from '../src/askRumbly/capabilityRegistry.ts';
import { continueAskRumbly, runAskRumbly, runAskRumblyPlan } from '../src/askRumbly/appExecutor.ts';
import { buildAskRumblyPresentation } from '../src/askRumbly/presentation.ts';
import { applyQueryPlanRefinement } from '../src/askRumbly/queryRefinement.ts';
import { itemMatchesMenuItemKind, menuItemHasAlcohol, menuItemKind, preferredMenuItemVersion } from '../src/askRumbly/menuItemKind.ts';
import { resultListTitle, subjectiveResultTitle } from '../src/askRumbly/responseCopy.ts';
import { parseQueryPlan } from '../src/askRumbly/semanticParser.ts';
import { CLAIM_FEATURES, CLAIM_RULES } from '../src/askRumbly/claimRules.ts';
import { loadData } from '../modules/ask-rumbly/scripts/ask-rumbly/data.ts';
import { buildParserVocabulary } from '../modules/ask-rumbly/scripts/ask-rumbly/parser_vocabulary.ts';
import { compileQueryPlan } from '../modules/ask-rumbly/scripts/ask-rumbly/plan_compiler.ts';
import { answerQuery } from '../modules/ask-rumbly/scripts/ask-rumbly/executor.ts';
import { executeQueryPlan } from '../modules/ask-rumbly/scripts/ask-rumbly/typed_plan_executor.ts';
import { itemProvesFoodTerm, proveExecutionResult } from '../modules/ask-rumbly/scripts/ask-rumbly/result_proof.ts';
import { THEME_PARK_ORDER } from '../src/data/locationNames.ts';
import { DISTANCE_ANCHORS, DISTANCE_ANCHOR_SOURCE_VERSION } from '../src/askRumbly/distanceAnchors.ts';

const data = await loadData();
const vocabulary = buildParserVocabulary(data);

test('offline distance-anchor snapshot is versioned, unique, and guest-safe', () => {
  assert.ok(DISTANCE_ANCHOR_SOURCE_VERSION.length > 0);
  assert.ok(DISTANCE_ANCHORS.filter((anchor) => anchor.entityType === 'attraction').length >= 170);
  assert.ok(DISTANCE_ANCHORS.filter((anchor) => anchor.entityType === 'area').length >= 20);
  assert.equal(new Set(DISTANCE_ANCHORS.map((anchor) => anchor.id)).size, DISTANCE_ANCHORS.length);
  assert.ok(DISTANCE_ANCHORS.every((anchor) => Number.isFinite(anchor.latitude) && Number.isFinite(anchor.longitude)));
  assert.ok(DISTANCE_ANCHORS.every((anchor) => !/Theme Park Reservation|Disney Park Pass/i.test(anchor.label)));
  assert.ok(DISTANCE_ANCHORS.every((anchor) => !anchor.label.includes('—')));
});

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
  assert.equal(plan.constraints.location, undefined);
  assert.match(plan.constraints.distanceAnchor?.label ?? '', /Liberty Square/i);
  assert.equal(plan.constraints.distanceRadiusMiles, 0.25);
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

test('divergent menu-item meanings ask a typed clarification before returning cards', () => {
  const response = runAskRumbly('old fashioned', data);
  assert.equal(response.plan.diagnostics.confidence, 'high');
  assert.equal(response.result.kind, 'clarification');
  assert.equal(response.result.clarification?.kind, 'menu_item_kind');
  assert.ok(response.result.clarification?.options.some((option) => option.id === 'menu-item-kind:cocktail'));
  assert.ok(response.result.clarification?.options.some((option) => option.id === 'menu-item-kind:dessert'));
  assert.ok(response.result.clarification?.options.some((option) => option.id === 'menu-item-kind:savory'));

  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.match(presentation.title, /what kind of old fashioned/i);
  assert.match(presentation.message, /different kinds of menu items/i);
  assert.ok(presentation.suggestions.every((suggestion) => suggestion.kind === 'clarification'));

  for (const question of [
    'Where can I get an Old-Fashioned?',
    'OLD FASHIONED',
    'Could you find me an old fashioned?',
  ]) {
    const variant = runAskRumbly(question, data);
    assert.equal(variant.result.kind, 'clarification', question);
    assert.equal(variant.result.clarification?.kind, 'menu_item_kind', question);
    assert.deepEqual(variant.result.clarification?.options.map((option) => option.id),
      response.result.clarification?.options.map((option) => option.id), question);
  }

  const itemsByKey = new Map(data.menuItems.map((item) => [`${item.restaurant_id}:${item.item_id}`, item]));
  for (const option of response.result.clarification?.options ?? []) {
    const continued = continueAskRumbly(response.plan, option, data);
    assert.equal(continued.result.kind, 'answer', option.id);
    assert.equal(continued.result.proof.status, 'proven', option.id);
    assert.equal(continued.continuation?.optionId, option.id);
    assert.equal(continued.plan.constraints.menuItemKind, option.refinement.value);
    const returned = (continued.result.itemKeys ?? []).map((key) => itemsByKey.get(key)).filter(Boolean);
    assert.ok(returned.length > 0, option.id);
    assert.ok(returned.every((item) => itemMatchesMenuItemKind(item, option.refinement.value)), option.id);
    if (option.refinement.value === 'cocktail') {
      assert.match(returned[0].item, /^old[ -]fashioned$/i, 'an exact canonical cocktail leads after resolution');
    }
    const continuedPresentation = buildAskRumblyPresentation(continued.plan, continued.result, {
      linkedKind: 'item',
      totalPossibilities: continued.result.itemKeys?.length ?? 0,
      hasCurrentLocation: false,
    });
    assert.match(continuedPresentation.title, option.refinement.value === 'cocktail'
      ? /old fashioned cocktail matches/i
      : option.refinement.value === 'non_alcoholic_drink'
        ? /non-alcoholic old fashioned drink matches/i
        : option.refinement.value === 'dessert'
          ? /old fashioned dessert matches/i
          : /savory old fashioned matches/i);
  }
});

test('menu-item clarification options are scoped and refinements preserve the original plan', () => {
  const response = runAskRumbly('where can i get a good old fashioned in disney springs', data);
  assert.equal(response.result.kind, 'clarification');
  assert.equal(response.result.clarification?.kind, 'menu_item_kind');
  const cocktail = response.result.clarification?.options.find((option) => option.refinement.value === 'cocktail');
  assert.ok(cocktail);
  const continued = continueAskRumbly(response.plan, cocktail, data);
  assert.equal(continued.result.kind, 'answer');
  assert.equal(continued.plan.constraints.location?.label, 'Disney Springs');
  assert.equal(continued.plan.constraints.location?.relation, 'in');
  assert.equal(continued.plan.constraints.menuItemKind, 'cocktail');
  assert.equal(continued.adaptation, undefined, 'the caller preserves the original subjective adaptation alongside the typed continuation');
  assert.equal(continued.continuation?.basePlan.constraints.location?.label, 'Disney Springs');

  for (const question of [
    'Does the Boathouse have an old fashioned?',
    'Does 50s Prime Time Cafe have an old fashioned?',
    'old fashioned at Crocketts Tavern',
    'old fashioned in Hollywood Studios',
    'old fashioned in Grand Floridian Resort',
  ]) {
    const scoped = runAskRumbly(question, data);
    assert.equal(scoped.result.kind, 'clarification', question);
    assert.equal(scoped.result.clarification?.kind, 'menu_item_kind', question);
    assert.ok((scoped.result.clarification?.options.length ?? 0) >= 2, question);
  }
});

test('explicit generic role words refine a known phrase without weakening concrete foods', () => {
  for (const [question, kind] of [
    ['old fashioned cocktail', 'cocktail'],
    ['old fashioned dessert', 'dessert'],
    ['old fashioned entree', 'savory'],
    ['old fashioned savory dish', 'savory'],
    ['old-fashioned cocktail', 'cocktail'],
    ['old-fashioned dessert', 'dessert'],
    ['old-fashioned savory dish', 'savory'],
  ]) {
    const plan = parseQueryPlan(question, vocabulary);
    assert.deepEqual(plan.subject.foodTerms, ['old fashioned'], question);
    assert.equal(plan.constraints.menuItemKind, kind, question);
    const result = executeQueryPlan(plan, data);
    assert.equal(result.kind, 'answer', question);
    assert.equal(result.proof.status, 'proven', question);
  }
  const concrete = parseQueryPlan('old fashioned pot roast', vocabulary);
  assert.deepEqual(concrete.subject.foodTerms, ['old fashioned pot roast']);
  assert.equal(concrete.constraints.menuItemKind, undefined);
  const iceCream = parseQueryPlan('chocolate ice cream', vocabulary);
  assert.deepEqual(iceCream.subject.foodTerms, ['chocolate ice cream']);
  assert.equal(iceCream.constraints.menuItemKind, undefined);
  const synonym = parseQueryPlan('pop tart dessert', vocabulary);
  assert.deepEqual(synonym.subject.foodTerms, ['lunch box tart']);
  assert.equal(synonym.constraints.menuItemKind, 'dessert');
  for (const question of [
    'virgin old fashioned cocktail',
    'non-alcoholic old fashioned cocktail',
    'old fashioned cocktail without alcohol',
  ]) {
    const plan = parseQueryPlan(question, vocabulary);
    assert.equal(plan.constraints.alcohol, 'excluded', question);
    assert.equal(plan.constraints.menuItemKind, 'cocktail', question);
    const result = executeQueryPlan(plan, data);
    assert.equal(result.kind, 'no-match', question);
  }
});

test('generic beverage wording refines or clarifies one item instead of creating a cross-row AND query', () => {
  for (const question of ['old fashioned drink', 'old fashioned beverage', 'old fashioned drink at The BOATHOUSE']) {
    const response = runAskRumbly(question, data);
    assert.deepEqual(response.plan.subject.foodTerms, ['old fashioned'], question);
    assert.equal(response.plan.constraints.beverageRole, 'unspecified', question);
    assert.equal(response.result.kind, 'clarification', question);
    assert.deepEqual(response.result.clarification?.options.map((option) => option.id), [
      'menu-item-kind:cocktail',
      'menu-item-kind:non_alcoholic_drink',
    ], question);
  }

  for (const question of ['old fashioned alcoholic drink', 'alcoholic old fashioned beverage']) {
    const response = runAskRumbly(question, data);
    assert.deepEqual(response.plan.subject.foodTerms, ['old fashioned'], question);
    assert.equal(response.plan.constraints.alcohol, 'required', question);
    assert.equal(response.plan.constraints.menuItemKind, 'cocktail', question);
    assert.equal(response.result.kind, 'answer', question);
    const keys = new Set(response.result.itemKeys ?? []);
    assert.ok(keys.size > 0, question);
    assert.ok([...keys].every((key) => data.menuItems.some((item) =>
      `${item.restaurant_id}:${item.item_id}` === key
      && itemProvesFoodTerm(item, 'old fashioned')
      && itemMatchesMenuItemKind(item, 'cocktail')
      && menuItemHasAlcohol(item))), question);
  }

  for (const question of [
    'old fashioned non-alcoholic drink',
    'non-alcoholic old fashioned beverage',
    'virgin old fashioned',
    'mocktail old fashioned',
  ]) {
    const response = runAskRumbly(question, data);
    assert.deepEqual(response.plan.subject.foodTerms, ['old fashioned'], question);
    assert.equal(response.plan.constraints.alcohol, 'excluded', question);
    assert.equal(response.plan.constraints.menuItemKind, 'non_alcoholic_drink', question);
    assert.equal(response.plan.constraints.beverageRole, 'zero_proof_cocktail', question);
    assert.equal(response.result.kind, 'no-match', question);
  }

  for (const [question, alcohol, kind] of [
    ['alcoholic drink', 'required', 'cocktail'],
    ['alcoholic beverages', 'required', 'cocktail'],
    ['non-alcoholic drink', 'excluded', 'non_alcoholic_drink'],
    ['non alcoholic beverages', 'excluded', 'non_alcoholic_drink'],
  ]) {
    const response = runAskRumbly(question, data);
    assert.deepEqual(response.plan.subject.foodTerms, ['drink'], question);
    assert.equal(response.plan.constraints.alcohol, alcohol, question);
    assert.equal(response.plan.constraints.menuItemKind, kind, question);
    assert.notEqual(response.result.kind, 'error', question);
  }

  for (const [question, kind] of [
    ['old fashioned dessert without alcohol', 'dessert'],
    ['old fashioned savory dish without alcohol', 'savory'],
  ]) {
    const response = runAskRumbly(question, data);
    assert.equal(response.plan.constraints.alcohol, 'excluded', question);
    assert.equal(response.plan.constraints.menuItemKind, kind, question);
  }

  assert.deepEqual(parse('old fashioned drink and fries').plan.subject.foodTerms, ['old fashioned drink', 'fries']);
  assert.deepEqual(parse('old fashioned beverage or burger').plan.subject.foodTerms, ['old fashioned beverage', 'burger']);
  assert.equal(runAskRumbly('what is the weather for an old fashioned drink', data).result.kind, 'unsupported');
});

test('food plus restaurant-feature misses fail closed without dropping the feature', () => {
  const miss = runAskRumbly('pizza with mobile order in Adventureland', data);
  assert.equal(miss.plan.constraints.requiredFeatures.includes('mobile_order'), true);
  assert.equal(miss.result.kind, 'no-match');
  assert.ok(miss.result.trace.appliedConstraints.includes('feature:mobile_order'));

  const match = runAskRumbly('burger with mobile order in Magic Kingdom', data);
  assert.equal(match.result.kind, 'answer');
  assert.equal(match.result.proof.status, 'proven');
  assert.ok(match.result.proof.witnesses.some((entry) => entry.constraint === 'feature:mobile_order'));
});

test('zero-proof Old Fashioned intent can match a future explicit cocktail-style row', () => {
  const template = data.menuItems.find((item) =>
    `${item.restaurant_id}:${item.item_id}` === 'citricos:411454275');
  assert.ok(template);
  const futureItem = {
    ...template,
    item_id: 'future-zero-proof-old-fashioned',
    item: 'Old Fashioned',
    category: 'Spirit-Free Cocktails',
    category_group: 'spirit-free-cocktails',
    description: 'Spirit-free whiskey alternative, aromatic spice, orange peel',
    is_alcoholic: false,
    norm_categories: ['non-alcoholic'],
  };
  const futureData = {
    ...data,
    menuItems: [...data.menuItems, futureItem],
  };
  const response = runAskRumbly('virgin old fashioned', futureData);
  assert.equal(response.plan.constraints.menuItemKind, 'non_alcoholic_drink');
  assert.equal(response.plan.constraints.beverageRole, 'zero_proof_cocktail');
  assert.equal(response.result.kind, 'answer');
  assert.equal(response.result.proof.status, 'proven');
  assert.ok(response.result.itemKeys?.includes('citricos:future-zero-proof-old-fashioned'));
  assert.ok(response.result.proof.witnesses.some((entry) =>
    entry.constraint === 'beverage-role:zero-proof-cocktail'));
});

test('no-match recovery preserves alcohol, recency, and meal intent when widening scope', () => {
  const alcoholic = runAskRumbly('Where can I get a Dole Whip with alcohol in Magic Kingdom?', data);
  assert.equal(alcoholic.result.kind, 'no-match');
  const alcoholPresentation = buildAskRumblyPresentation(alcoholic.plan, alcoholic.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  const allDisney = alcoholPresentation.suggestions.find((suggestion) =>
    suggestion.kind === 'query' && suggestion.label === 'Search all Disney World');
  assert.ok(allDisney && allDisney.kind === 'query');
  const widenedAlcohol = parseQueryPlan(allDisney.query, vocabulary);
  assert.equal(widenedAlcohol.constraints.alcohol, 'required');
  assert.deepEqual(widenedAlcohol.subject.foodTerms, alcoholic.plan.subject.foodTerms);

  const recent = runAskRumbly('What snacks are new in Liberty Square?', data);
  assert.equal(recent.result.kind, 'no-match');
  const recentPresentation = buildAskRumblyPresentation(recent.plan, recent.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.ok(recentPresentation.suggestions.length > 0);
  for (const suggestion of recentPresentation.suggestions) {
    if (suggestion.kind !== 'query') continue;
    const recovered = parseQueryPlan(suggestion.query, vocabulary);
    assert.deepEqual(recovered.constraints.recency, recent.plan.constraints.recency, suggestion.query);
    assert.deepEqual(recovered.constraints.mealPeriods, recent.plan.constraints.mealPeriods, suggestion.query);
  }
});

test('resolved menu-item kind is independently required by result proof', () => {
  const response = runAskRumbly('old fashioned', data);
  assert.equal(response.result.kind, 'clarification');
  const cocktail = response.result.clarification?.options.find((option) => option.refinement.value === 'cocktail');
  const dessert = response.result.clarification?.options.find((option) => option.refinement.value === 'dessert');
  assert.ok(cocktail && dessert);
  const cocktailPlan = applyQueryPlanRefinement(response.plan, cocktail.refinement);
  const dessertResult = continueAskRumbly(response.plan, dessert, data).result;
  assert.equal(dessertResult.kind, 'answer');
  const wrongKey = dessertResult.itemKeys[0];
  const wrongItem = data.menuItems.find((item) => `${item.restaurant_id}:${item.item_id}` === wrongKey);
  assert.ok(wrongItem);
  const proof = proveExecutionResult(cocktailPlan, data, {
    restaurantIds: [wrongItem.restaurant_id],
    itemIds: [wrongItem.item_id],
    itemKeys: [wrongKey],
  });
  assert.equal(proof.status, 'failed');
  assert.ok(proof.failures.some((failure) => /menu-item kind/i.test(failure)));
});

test('competing global orderings use typed continuations and do not lose other constraints', () => {
  const origin = { latitude: 28.4177, longitude: -81.5812 };
  const response = runAskRumbly('cheapest and closest burger', data, origin);
  assert.equal(response.plan.action, 'clarify');
  assert.equal(response.result.kind, 'clarification');
  assert.equal(response.result.clarification?.kind, 'ordering');
  assert.deepEqual(response.result.clarification?.options.map((option) => option.id), [
    'ordering:cheapest',
    'ordering:nearest',
  ]);
  for (const option of response.result.clarification?.options ?? []) {
    const continued = continueAskRumbly(response.plan, option, data, origin);
    assert.equal(continued.result.kind, 'answer', option.id);
    assert.equal(continued.result.proof.status, 'proven', option.id);
    if (option.refinement.value === 'cheapest') {
      assert.equal(continued.plan.constraints.priceOperation, 'cheapest');
      assert.equal(continued.plan.constraints.distanceOperation, undefined);
    } else {
      assert.equal(continued.plan.constraints.priceOperation, undefined);
      assert.equal(continued.plan.constraints.distanceOperation, 'nearest');
    }
  }

  const rich = parseQueryPlan('cheapest and closest dairy-free burger in epcot under $20 open now', vocabulary);
  const nearest = applyQueryPlanRefinement(rich, { kind: 'ordering', value: 'nearest' });
  assert.deepEqual(nearest.subject, rich.subject);
  assert.deepEqual(nearest.constraints.allergenKeys, rich.constraints.allergenKeys);
  assert.deepEqual(nearest.constraints.location, rich.constraints.location);
  assert.equal(nearest.constraints.maxPrice, 20);
  assert.equal(nearest.constraints.time, 'now');
  assert.equal(nearest.constraints.distanceOperation, 'nearest');
  assert.equal(nearest.constraints.priceOperation, undefined);

  const anchored = parseQueryPlan('cheapest and closest burger to Space Mountain', vocabulary);
  assert.ok(anchored.constraints.distanceAnchor);
  const anchoredCheapest = applyQueryPlanRefinement(anchored, { kind: 'ordering', value: 'cheapest' });
  assert.equal(anchoredCheapest.constraints.distanceAnchor, undefined);

  const nearScoped = runAskRumbly('cheapest and closest burger near Epcot', data);
  assert.equal(nearScoped.result.kind, 'clarification');
  assert.match(nearScoped.result.clarification?.options.find((option) => option.refinement.value === 'nearest')?.label ?? '', /closest near epcot/i);

  const boundedNearest = runAskRumbly('closest burger under $15', data, origin);
  assert.notEqual(boundedNearest.result.kind, 'clarification');
  assert.equal(boundedNearest.plan.constraints.priceOperation, 'maximum');
  assert.equal(boundedNearest.plan.constraints.distanceOperation, 'nearest');

  const withoutLocation = runAskRumbly('cheapest and closest burger', data);
  assert.equal(withoutLocation.result.kind, 'clarification');
  assert.equal(withoutLocation.result.clarification?.kind, 'ordering');
  const nearestOption = withoutLocation.result.clarification?.options.find((option) => option.refinement.value === 'nearest');
  assert.ok(nearestOption);
  const needsLocation = continueAskRumbly(withoutLocation.plan, nearestOption, data);
  assert.equal(needsLocation.result.kind, 'clarification');
  assert.match(needsLocation.result.text, /location/i);
  const afterLocation = runAskRumblyPlan(needsLocation.plan, data, origin);
  assert.equal(afterLocation.result.kind, 'answer');
  assert.equal(afterLocation.plan.constraints.priceOperation, undefined);
  assert.equal(afterLocation.plan.constraints.distanceOperation, 'nearest');

  const unsupported = runAskRumbly('where is the cheapest and closest bathroom', data, origin);
  assert.equal(unsupported.result.kind, 'unsupported');
});

test('menu-kind coherence generalizes beyond old fashioned without over-clarifying canonical terms', () => {
  const ambiguous = runAskRumbly('blood orange', data);
  assert.equal(ambiguous.result.kind, 'clarification');
  assert.equal(ambiguous.result.clarification?.kind, 'menu_item_kind');

  const expected = [
    ['espresso martini', 'cocktail'],
    ['cold brew', 'non_alcoholic_drink'],
    ['st louis', 'savory'],
  ];
  const itemsByKey = new Map(data.menuItems.map((item) => [`${item.restaurant_id}:${item.item_id}`, item]));
  for (const [question, kind] of expected) {
    const response = runAskRumbly(question, data);
    assert.equal(response.result.kind, 'answer', question);
    const returned = (response.result.itemKeys ?? []).map((key) => itemsByKey.get(key)).filter(Boolean);
    assert.ok(returned.length > 0, question);
    assert.ok(returned.every((item) => menuItemKind(item) === kind), question);
    if (question === 'st louis') assert.ok(returned.every((item) => /ribs?/i.test(item.item)));
  }

  for (const question of [
    'Does Planet Hollywood have ice cream?',
    "Does Chef Art Smith's Homecomin' have coffee?",
    'coffee at Muddy Rivers',
    'coffee at Stir',
  ]) {
    const response = runAskRumbly(question, data);
    assert.equal(response.result.kind, 'no-match', question);
  }

  const pizza = data.menuItems.find((item) => /margherita pizza/i.test(item.item) && /thin crust pies/i.test(item.category));
  assert.ok(pizza);
  assert.equal(menuItemKind(pizza), 'savory');
  const handLabeled = [
    [/^churro iced latte$/i, 'non_alcoholic_drink'],
    [/^coffee cake$/i, 'dessert'],
    [/^beer cheese flatbread$/i, 'savory'],
    [/^crab cake$/i, 'savory'],
    [/^pizza margarita$/i, 'savory'],
  ];
  for (const [name, kind] of handLabeled) {
    const item = data.menuItems.find((candidate) => name.test(candidate.item));
    assert.ok(item, String(name));
    assert.equal(menuItemKind(item), kind, item.item);
  }

  const cocktail = runAskRumbly('cocktail', data);
  assert.equal(cocktail.result.kind, 'answer');
  const cocktailKeys = new Set(cocktail.result.itemKeys ?? []);
  const cocktailRows = [...cocktailKeys].map((key) => data.menuItems.find((item) =>
    `${item.restaurant_id}:${item.item_id}` === key && itemMatchesMenuItemKind(item, 'cocktail'))).filter(Boolean);
  assert.ok(cocktailRows.length > 0);
  assert.equal(cocktailRows.length, cocktailKeys.size);
  assert.ok(cocktailRows.every((item) => !/shrimp|prawn|cocktail sauce/i.test(item.item)));

  const pie = runAskRumbly('pie', data);
  assert.equal(pie.result.kind, 'clarification');
  assert.ok(pie.result.clarification?.options.some((option) => option.refinement.value === 'dessert'));
  assert.ok(pie.result.clarification?.options.some((option) => option.refinement.value === 'savory'));
  for (const pattern of [/shepherd'?s pie/i, /lobster pot pie/i]) {
    const item = data.menuItems.find((candidate) => pattern.test(candidate.item));
    assert.ok(item, String(pattern));
    assert.equal(menuItemKind(item), 'savory', item.item);
  }

  for (const question of [
    'kentucky coffee',
    'long island iced tea',
    'bourbon lemonade',
    'vodka lemonade',
    'electric lemonade',
    'hard root beer',
  ]) {
    const response = runAskRumbly(question, data);
    assert.notEqual(response.result.kind, 'no-match', question);
  }

  const cheese = runAskRumbly('cheese', data);
  assert.equal(cheese.result.kind, 'clarification');
  assert.ok(!cheese.result.clarification?.options.some((option) => option.refinement.value === 'cocktail'));

  const apple = runAskRumbly('apple', data);
  assert.equal(apple.result.kind, 'clarification');
  assert.equal(apple.result.clarification?.options.length, 4);

  for (const question of [
    'croissant at Sunshine Seasons',
    'chocolate croissant at Sunshine Seasons',
    'fresh fruit bowl at Kusafiri Coffee Shop and Bakery',
  ]) {
    assert.notEqual(runAskRumbly(question, data).result.kind, 'clarification', question);
  }
});

test('hand-labeled item identities guard against classifier and duplicate-row circularity', () => {
  const versions = (key) => data.menuItems.filter((item) => `${item.restaurant_id}:${item.item_id}` === key);
  const cocktailPlan = runAskRumbly('cocktail', data).plan;
  const cocktailAnswer = runAskRumbly('cocktail', data);
  assert.equal(cocktailAnswer.result.kind, 'answer');
  assert.ok(cocktailAnswer.result.itemKeys?.includes('hollywood-and-vine:19464892'));
  const longIsland = preferredMenuItemVersion(
    cocktailPlan,
    versions('hollywood-and-vine:19464892'),
    itemProvesFoodTerm,
  );
  assert.equal(longIsland?.category, 'Cocktails');
  assert.equal(longIsland?.is_alcoholic, true);

  const pie = runAskRumbly('pie', data);
  assert.equal(pie.result.kind, 'clarification');
  const dessertOption = pie.result.clarification?.options.find((option) => option.refinement.value === 'dessert');
  const cocktailOption = pie.result.clarification?.options.find((option) => option.refinement.value === 'cocktail');
  assert.ok(dessertOption && cocktailOption);
  const dessert = continueAskRumbly(pie.plan, dessertOption, data);
  const cocktail = continueAskRumbly(pie.plan, cocktailOption, data);
  assert.equal(dessert.result.kind, 'answer');
  assert.ok(dessert.result.itemKeys?.includes('wine-bar-george:19039758'));
  assert.equal(cocktail.result.kind, 'answer');
  assert.ok(!cocktail.result.itemKeys?.includes('wine-bar-george:19039758'));

  const alcoholicShake = runAskRumbly('alcoholic milkshake', data);
  assert.equal(alcoholicShake.result.kind, 'answer');
  assert.ok(!alcoholicShake.result.itemKeys?.includes('the-cake-bake-shop-restaurant-by-gwendolyn-rogers:412252166'));

  const alcoholicCheese = runAskRumbly('alcoholic cheese at Wine Bar George', data);
  assert.equal(alcoholicCheese.result.kind, 'no-match');
});

test('hand-labeled Old Fashioned branches stay mutually exclusive', () => {
  const response = runAskRumbly('old fashioned', data);
  assert.equal(response.result.kind, 'clarification');
  const expected = {
    cocktail: 'belle-vue-lounge:18431661',
    dessert: 'beaches-and-cream-soda-shop:17081902',
    non_alcoholic_drink: 'citricos:411454275',
    savory: '50s-prime-time-cafe:17015224',
  };
  const allWitnesses = Object.values(expected);
  for (const [kind, requiredKey] of Object.entries(expected)) {
    const option = response.result.clarification?.options.find((candidate) => candidate.refinement.value === kind);
    assert.ok(option, kind);
    const continued = continueAskRumbly(response.plan, option, data);
    assert.equal(continued.result.kind, 'answer', kind);
    assert.equal(continued.result.proof.status, 'proven', kind);
    assert.ok(continued.result.itemKeys?.includes(requiredKey), kind);
    assert.ok(allWitnesses.filter((key) => key !== requiredKey).every((key) =>
      !continued.result.itemKeys?.includes(key)), kind);
  }
});

test('zero-proof cocktail wording returns crafted zero-proof rows, not commodity beverages', () => {
  for (const question of ['mocktail', 'zero proof cocktail', 'spirit-free cocktail', 'virgin cocktail', 'non-alcoholic cocktail']) {
    const response = runAskRumbly(question, data);
    assert.deepEqual(response.plan.subject.foodTerms, ['mocktail'], question);
    assert.equal(response.plan.constraints.alcohol, 'excluded', question);
    assert.equal(response.plan.constraints.menuItemKind, 'non_alcoholic_drink', question);
    assert.equal(response.result.kind, 'answer', question);
    assert.equal(response.result.proof.status, 'proven', question);
    assert.ok(response.result.itemKeys?.includes('geo-82:412382726'), question);
    for (const forbidden of [
      'chill:411345770',
      'energy-bytes:412651742',
      'energy-bytes:412651745',
      'rosa-mexicano:411952667',
    ]) assert.ok(!response.result.itemKeys?.includes(forbidden), `${question}: ${forbidden}`);
  }
});

test('suggest phrasing is treated as objective food discovery', () => {
  for (const question of [
    'Suggest a place get a burger',
    'Suggest a place to get a burger',
    'Suggest a burger place',
  ]) {
    const { plan, result } = execute(question);
    assert.equal(plan.action, 'find', question);
    assert.equal(plan.claimType, 'menu_presence', question);
    assert.deepEqual(plan.subject.foodTerms, ['burger'], question);
    assert.equal(plan.diagnostics.confidence, 'high', question);
    assert.equal(result.kind, 'answer', question);
    assert.match(result.text, /burger/i, question);
  }
});

test('known food names own meal words and retain every verified menu variant', () => {
  const response = runAskRumbly('Where can I get a lunch box tart', data);
  assert.deepEqual(response.plan.subject.foodTerms, ['lunch box tart']);
  assert.deepEqual(response.plan.constraints.mealPeriods, []);
  assert.equal(response.result.kind, 'answer');
  assert.deepEqual(new Set(response.result.itemKeys), new Set([
    'woodys-lunchbox:411801523',
    'woodys-lunchbox:19014923',
  ]));

  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemKeys?.length ?? 0,
    hasCurrentLocation: false,
  });
  assert.ok(presentation.title.length > 0);
  assert.doesNotMatch(presentation.title, /verified|data|query|result kind/i);
  assert.equal(presentation.message, 'Tap one to see it on the menu.');

  const explicitMeal = runAskRumbly('Where can I get a lunch box tart for lunch?', data);
  assert.deepEqual(explicitMeal.plan.subject.foodTerms, ['lunch box tart']);
  assert.deepEqual(explicitMeal.plan.constraints.mealPeriods, ['lunch']);
  assert.equal(explicitMeal.result.kind, 'answer');
  assert.equal(explicitMeal.result.itemKeys?.length, 2);
});

test('single linked results use singular conversational copy', () => {
  const response = runAskRumbly('Where can I get a pumpkin lunch box tart?', data);
  assert.equal(response.result.kind, 'answer');
  assert.equal(response.result.itemKeys?.length, 1);
  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemKeys?.length ?? 0,
    hasCurrentLocation: false,
  });
  assert.match(presentation.title, /one.*match|found one/i);
});

test('ordinary food discovery mentions proximity when results are distance-ranked', () => {
  const origin = { latitude: 28.4177, longitude: -81.5812 };
  const response = runAskRumbly(
    'I want ice cream',
    data,
    origin,
  );
  assert.equal(response.result.kind, 'answer');
  assert.ok(Object.keys(response.result.distanceMilesByRestaurant ?? {}).length > 0);
  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemKeys?.length ?? 0,
    hasCurrentLocation: true,
  });
  assert.match(presentation.title, /nearby|closest|close by|closer/i);
  assert.equal(presentation.message, 'Tap one to see it on the menu.');

  const pizza = runAskRumbly('I want pizza', data, origin);
  assert.equal(pizza.result.kind, 'answer');
  const pizzaPresentation = buildAskRumblyPresentation(pizza.plan, pizza.result, {
    linkedKind: 'item',
    totalPossibilities: pizza.result.itemKeys?.length ?? 0,
    hasCurrentLocation: true,
  });
  assert.match(pizzaPresentation.title, /nearby|closest|close by|closer/i);
});

test('terse Dole Whip proximity requests retain the food and return the nearest proven options', () => {
  const origin = { latitude: 28.4177, longitude: -81.5812 };
  for (const [question, operation] of [
    ['Find a Dole Whip near me', 'nearby'],
    ['Dole Whip nearby?', 'nearby'],
    ["What's the closest Dole Whip?", 'nearest'],
  ]) {
    const response = runAskRumbly(question, data, origin);
    assert.deepEqual(response.plan.subject.foodTerms, ['dole whip'], question);
    // Only the superlative is a single-winner request; "near me" and "nearby"
    // ask for options near the guest.
    assert.equal(response.plan.constraints.distanceOperation, operation, question);
    assert.equal(response.plan.diagnostics.confidence, 'high', question);
    assert.equal(response.result.kind, 'answer', question);
    assert.ok((response.result.itemKeys?.length ?? 0) > 0, question);
    const presentation = buildAskRumblyPresentation(response.plan, response.result, {
      linkedKind: 'item',
      totalPossibilities: response.result.itemKeys?.length ?? 0,
      hasCurrentLocation: true,
    });
    // The superlative names one winner; "near me" is a ranked list, and its
    // label says so rather than implying a single answer.
    assert.match(presentation.eyebrow, operation === 'nearest' ? /^Closest match$/ : /closest first|Closest match/i, question);
    assert.match(presentation.title, /Dole Whip|pineapple/i, question);
    assert.doesNotMatch(presentation.title, /could verify|menu items/i, question);
  }
});

test('companion copy is deterministic, varied, proximity-aware, and em-dash-free', () => {
  const questions = [
    'I want pizza',
    'Where can I get pizza?',
    'Show me pizza nearby',
    'Find pizza for us',
    'Any pizza around?',
    'Pizza please',
  ];
  const titles = questions.map((question) => resultListTitle(question, ['pizza'], true, 5));
  assert.equal(resultListTitle(questions[0], ['pizza'], true, 5), titles[0]);
  assert.ok(new Set(titles).size > 1);
  assert.ok(titles.every((title) => /nearby|closest|close by|closer/i.test(title)));
  assert.ok(titles.every((title) => !title.includes('—')));

  const subjective = questions.map((question) => subjectiveResultTitle(question, true));
  assert.ok(new Set(subjective).size > 1);
  assert.ok(subjective.every((title) => /nearby|distance|close|around/i.test(title)));
  assert.ok(subjective.every((title) => !title.includes('—')));
});

test('v2 companion pools cover common family-food phrasing', () => {
  const titlesFor = (food) => Array.from({ length: 40 }, (_, index) =>
    resultListTitle(`Find ${food} nearby variation ${index}`, [food], true, 4));
  assert.ok(titlesFor('chicken tenders').some((title) => /kid-approved|crispy|safe bet|tenders/i.test(title)));
  assert.ok(titlesFor('pretzel').some((title) => /pretzel|warm, salty|classic snack/i.test(title)));
  assert.ok(titlesFor('mac and cheese').some((title) => /comfort food|creamy, cheesy|good stuff/i.test(title)));
});

test('companion wrappers preserve the same bounded food request', () => {
  for (const question of [
    'Hey Rumbly, can you help me find a burger in Magic Kingdom?',
    'Hi, could you help us get a burger in Magic Kingdom?',
    'Okay Rumbly, would you please show me a burger in Magic Kingdom?',
  ]) {
    const { plan, result } = execute(question);
    assert.equal(plan.claimType, 'menu_presence', question);
    assert.deepEqual(plan.subject.foodTerms, ['burger'], question);
    // Disney publishes "Magic Kingdom Park"; hand-coded venues carry the bare
    // "Magic Kingdom". Which one a query links to depends on the data, not on
    // the wrapper being tested here, so accept either -- the same tolerance
    // the park-alias test below already applies.
    assert.match(plan.constraints.location?.label ?? '', /^Magic Kingdom(?: Park)?$/i, question);
    assert.equal(plan.diagnostics.confidence, 'high', question);
    assert.equal(result.kind, 'answer', question);
  }
});

test('park aliases use the same scope across downloaded and hand-coded restaurant records', () => {
  for (const question of [
    'Where can I get churros in Magic Kingdom',
    'Churros in Magic Kingdom',
  ]) {
    const response = runAskRumbly(question, data);
    assert.deepEqual(response.plan.subject.foodTerms, ['churros'], question);
    assert.equal(response.plan.constraints.location?.entityType, 'park', question);
    assert.match(response.plan.constraints.location?.label ?? '', /^Magic Kingdom(?: Park)?$/i, question);
    assert.equal(response.result.kind, 'answer', question);
    assert.ok((response.result.itemKeys?.length ?? 0) > 0, question);
    assert.ok(response.result.trace.appliedConstraints.includes('location:in'), question);
  }
});

test('in-app distance questions require the shared current location or an explicit area', () => {
  const withoutLocation = runAskRumbly("What's the closest burger?", data);
  assert.equal(withoutLocation.plan.action, 'clarify');
  assert.equal(withoutLocation.result.kind, 'clarification');
  assert.match(withoutLocation.result.text, /turn on the location button/i);

  const withLocation = runAskRumbly(
    "What's the closest burger?",
    data,
    { latitude: 28.4177, longitude: -81.5812 },
  );
  assert.equal(withLocation.plan.action, 'find');
  assert.equal(withLocation.result.kind, 'answer');

  const parkScopeIsNotAnOrigin = runAskRumbly("What's the closest burger in Magic Kingdom?", data);
  assert.equal(parkScopeIsNotAnOrigin.result.kind, 'clarification');

  const areaAnchor = runAskRumbly('coffee near tree of life', data);
  assert.equal(areaAnchor.result.kind, 'answer');
  assert.equal(areaAnchor.plan.constraints.distanceRadiusMiles, 0.25);
  assert.ok(areaAnchor.result.trace.appliedConstraints.includes('distance-radius:0.25mi'));
  assert.ok(areaAnchor.result.trace.locationApproximation);

  const genericLandmark = runAskRumbly('food near Space Mountain', data);
  assert.equal(genericLandmark.result.kind, 'answer');
  assert.equal(genericLandmark.plan.constraints.distanceRadiusMiles, 0.25);
  assert.ok((genericLandmark.result.restaurantIds?.length ?? 0) > 0);
});

test('named-origin distances answer restaurant, area, and nearest-food questions offline', () => {
  const caseys = runAskRumbly("How far is Casey's Corner from Space Mountain?", data);
  assert.equal(caseys.plan.action, 'distance');
  assert.equal(caseys.plan.constraints.distanceAnchor?.label, 'Space Mountain');
  assert.equal(caseys.result.kind, 'answer');
  assert.match(caseys.result.text, /Casey's Corner is about \d+ ft from Space Mountain/i);
  assert.ok(caseys.result.proof.witnesses.some((entry) => entry.constraint === 'distance-anchor:attraction:80010190'));

  const cosmicRays = runAskRumbly('How far is Cosmic Rays from Fantasyland?', data);
  assert.equal(cosmicRays.plan.constraints.distanceAnchor?.approximation, 'central-area');
  assert.equal(cosmicRays.result.kind, 'answer');
  assert.match(cosmicRays.result.text, /about \d+ ft from central Fantasyland/i);

  const cornDog = runAskRumbly("What's the nearest corn dog to Living with the Land?", data);
  assert.deepEqual(cornDog.plan.subject.foodTerms, ['corn dog']);
  assert.equal(cornDog.plan.constraints.distanceAnchor?.label, 'Living with the Land');
  assert.equal(cornDog.result.kind, 'answer');
  assert.match(cornDog.result.text, /Blue Ribbon Corn Dogs/i);
  assert.ok(cornDog.result.proof.witnesses.some((entry) => entry.constraint === 'global-nearest'));
  const presentation = buildAskRumblyPresentation(cornDog.plan, cornDog.result, {
    linkedKind: 'item',
    totalPossibilities: cornDog.result.itemKeys?.length ?? 0,
    hasCurrentLocation: false,
  });
  assert.match(presentation.title, /closest corn dog.*Living with the Land/i);
  assert.match(presentation.message, /straight-line estimate/i);
  assert.doesNotMatch(`${presentation.title} ${presentation.message}`, /—/);
});

test('area wording keeps strict scopes separate from central-area distance anchors', () => {
  for (const question of ['churros in Fantasyland', 'where can I get a churro in Fantasyland']) {
    const inside = runAskRumbly(question, data);
    assert.equal(inside.plan.constraints.location?.relation, 'in', question);
    assert.equal(inside.plan.constraints.location?.label, 'Fantasyland', question);
    assert.equal(inside.plan.constraints.distanceAnchor, undefined, question);
    assert.equal(inside.result.kind, 'no-match', question);
    assert.ok(inside.result.trace.appliedConstraints.includes('location:in'), question);
    const presentation = buildAskRumblyPresentation(inside.plan, inside.result, {
      linkedKind: null,
      totalPossibilities: 0,
      hasCurrentLocation: false,
    });
    assert.match(presentation.title, /current menu matches.*churros?.*Fantasyland/i, question);
    assert.match(presentation.message, /near Fantasyland.*all of Disney World/i, question);
    assert.ok(presentation.suggestions.some((suggestion) => suggestion.kind === 'query'
      && suggestion.label === 'Search near Fantasyland'
      && /churros? near Fantasyland/i.test(suggestion.query)), question);
    assert.ok(presentation.suggestions.some((suggestion) => suggestion.kind === 'query'
      && suggestion.label === 'Search all Disney World'
      && !/Fantasyland/i.test(suggestion.query)), question);
  }

  const nearby = runAskRumbly('coffee near Tomorrowland', data);
  assert.equal(nearby.plan.constraints.location, undefined);
  assert.equal(nearby.plan.constraints.locations, undefined);
  assert.equal(nearby.plan.constraints.distanceAnchor?.label, 'Tomorrowland');
  assert.equal(nearby.plan.constraints.distanceAnchor?.approximation, 'central-area');
  assert.equal(nearby.plan.constraints.distanceRadiusMiles, 0.25);
  assert.equal(nearby.result.kind, 'answer');
  assert.ok(nearby.result.trace.appliedConstraints.includes('distance-radius:0.25mi'));
  assert.ok(!nearby.result.trace.appliedConstraints.some((constraint) => constraint.startsWith('location:near:')));
  assert.doesNotMatch(nearby.result.trace.locationApproximation ?? '', /dining-location centroid/i);

  const nearest = runAskRumbly('What is the nearest coffee to World Celebration?', data);
  assert.equal(nearest.plan.constraints.location, undefined);
  assert.equal(nearest.plan.constraints.distanceAnchor?.label, 'World Celebration');
  assert.equal(nearest.plan.constraints.distanceRadiusMiles, undefined);
  assert.equal(nearest.result.kind, 'answer');
  assert.ok(nearest.result.proof.witnesses.some((entry) => entry.constraint === 'global-nearest'));
  assert.ok(!nearest.result.trace.appliedConstraints.some((constraint) => constraint.startsWith('location:near:')));

  const distance = runAskRumbly('How far is Connections Eatery from World Celebration?', data);
  assert.equal(distance.plan.constraints.location, undefined);
  assert.equal(distance.plan.constraints.distanceAnchor?.label, 'World Celebration');
  assert.equal(distance.result.kind, 'answer');

  const compound = runAskRumbly('coffee in Epcot near World Celebration', data);
  assert.equal(compound.plan.constraints.location?.entityType, 'park');
  assert.match(compound.plan.constraints.location?.label ?? '', /Epcot/i);
  assert.equal(compound.plan.constraints.distanceAnchor?.label, 'World Celebration');
  assert.equal(compound.plan.constraints.distanceRadiusMiles, 0.25);
  assert.equal(compound.result.kind, 'answer');
  assert.ok(compound.result.trace.appliedConstraints.includes('location:in'));
  assert.ok(compound.result.trace.appliedConstraints.includes('distance-radius:0.25mi'));
});

test('the in-app path never inherits the terminal harness origin', () => {
  const { result } = runAskRumbly('Where can I get ice cream in Epcot?', data);
  assert.equal(result.kind, 'answer');
  assert.doesNotMatch(result.text, /\b(?:ft|mi) away\b/i);
});

test('broad budget searches ask for useful context instead of dumping thousands of rows', () => {
  const broad = runAskRumbly("I'm broke, what can I get for under $10", data);
  assert.equal(broad.result.kind, 'clarification');
  assert.match(broad.result.text, /food or an area|location button/i);
  const presentation = buildAskRumblyPresentation(broad.plan, broad.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.ok(presentation.suggestions.some((suggestion) => suggestion.kind === 'enable_location'));
  assert.ok(presentation.suggestions.some((suggestion) =>
    suggestion.kind === 'query' && /\$10 or less/i.test(suggestion.query)));

  const scoped = runAskRumbly('What food is under $10 in Magic Kingdom?', data);
  assert.equal(scoped.result.kind, 'answer');
});

test('direct restaurant answers keep the actual answer in the guest presentation', () => {
  for (const question of [
    'When does Cosmic Rays open?',
    'Does Cosmic Rays have Mobile Order?',
    "What's on the menu at Cosmic Rays?",
  ]) {
    const response = runAskRumbly(question, data);
    assert.equal(response.result.kind, 'answer', question);
    const presentation = buildAskRumblyPresentation(response.plan, response.result, {
      linkedKind: 'restaurant',
      totalPossibilities: response.result.restaurantIds?.length ?? 0,
      hasCurrentLocation: false,
    });
    assert.equal(presentation.message, response.result.text, question);
    assert.notEqual(presentation.message, 'Verified against the current Rumbly dining data.', question);
  }
});

test('guest presentation explains boundaries without exposing internal failure prose', () => {
  const outside = runAskRumbly("What's the weather today?", data);
  const outsidePresentation = buildAskRumblyPresentation(outside.plan, outside.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.match(outsidePresentation.title, /dining lane/i);
  assert.match(outsidePresentation.message, /food and restaurants/i);
  assert.ok(outsidePresentation.suggestions.length > 0);
  assert.doesNotMatch(`${outsidePresentation.title} ${outsidePresentation.message}`, /unconsumed|not answering|missing proof/i);

  const noMatch = runAskRumbly('gf beer epcot', data);
  assert.equal(noMatch.result.kind, 'no-match');
  const noMatchPresentation = buildAskRumblyPresentation(noMatch.plan, noMatch.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.match(noMatchPresentation.message, /Disney.*labels/i);
  assert.ok(noMatchPresentation.suggestions.some((suggestion) =>
    suggestion.kind === 'query' && /gluten-free/i.test(suggestion.query)));
  assert.doesNotMatch(`${noMatchPresentation.title} ${noMatchPresentation.message}`, /not answering|missing proof/i);

  const tooSpecific = runAskRumbly('wood fired pizza hollywood studios', data);
  assert.equal(tooSpecific.result.kind, 'no-match');
  const recovery = buildAskRumblyPresentation(tooSpecific.plan, tooSpecific.result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.ok(recovery.suggestions.some((suggestion) =>
    suggestion.kind === 'query'
      && /search for pizza instead/i.test(suggestion.label)
      && /pizza in (?:Disney's )?Hollywood Studios/i.test(suggestion.query)));

  const restaurantScoped = runAskRumbly(
    "I want some ice cream near Casey's Corner",
    data,
    { latitude: 28.4177, longitude: -81.5812 },
  );
  assert.equal(restaurantScoped.result.kind, 'no-match');
  const restaurantRecovery = buildAskRumblyPresentation(
    restaurantScoped.plan,
    restaurantScoped.result,
    { linkedKind: null, totalPossibilities: 0, hasCurrentLocation: true },
  );
  assert.equal(restaurantRecovery.title, "Sorry, I couldn't find what you're looking for.");
  assert.match(restaurantRecovery.message, /without the restaurant name|different way/i);
  assert.ok(restaurantRecovery.suggestions.some((suggestion) =>
    suggestion.kind === 'query'
      && suggestion.label === 'Search all Disney World'
      && suggestion.query === 'Where can I get ice cream?'));
  assert.ok(`${restaurantRecovery.title} ${restaurantRecovery.message}`.length < 180);
});

test('subjective food rankings transparently return verified options instead of a dead end', () => {
  const response = runAskRumbly("Where's the best corn dog?", data);
  assert.equal(response.adaptation?.kind, 'subjective_options');
  assert.equal(response.adaptation?.originalPlan.claimType, 'editorial_judgment');
  assert.equal(response.plan.claimType, 'menu_presence');
  assert.deepEqual(response.plan.subject.foodTerms, ['corn dog']);
  assert.equal(response.result.kind, 'answer');
  assert.ok((response.result.itemKeys?.length ?? 0) > 1);

  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemKeys?.length ?? 0,
    hasCurrentLocation: false,
    subjectiveOptions: true,
  });
  assert.match(presentation.title, /taste buds|best|rank flavor|stars/i);
  assert.match(presentation.message, /not a ranking/i);
  assert.deepEqual(presentation.suggestions, []);

  for (const question of [
    "What's your favorite corn dog?",
    'What corn dog do you recommend?',
    'Recommend a corn dog',
    'Recommend a place to get a corn dog',
  ]) {
    const variant = runAskRumbly(question, data);
    assert.equal(variant.adaptation?.kind, 'subjective_options', question);
    assert.deepEqual(variant.plan.subject.foodTerms, ['corn dog'], question);
    assert.equal(variant.result.kind, 'answer', question);
  }

  for (const question of [
    'Best place for a pretzel',
    "Where's the best place to get a pretzel?",
    'Best pretzel place',
    'Where is your favorite spot for a pretzel?',
  ]) {
    const placeVariant = runAskRumbly(question, data);
    assert.equal(placeVariant.adaptation?.kind, 'subjective_options', question);
    assert.deepEqual(placeVariant.plan.subject.foodTerms, ['pretzel'], question);
    assert.equal(placeVariant.result.kind, 'answer', question);
    assert.ok((placeVariant.result.itemKeys?.length ?? 0) > 0, question);
  }

  const nearby = runAskRumbly(
    'What is the best cinnamon roll?',
    data,
    { latitude: 28.4177, longitude: -81.5812 },
  );
  assert.equal(nearby.result.kind, 'answer');
  const nearbyPresentation = buildAskRumblyPresentation(nearby.plan, nearby.result, {
    linkedKind: 'item',
    totalPossibilities: nearby.result.itemKeys?.length ?? 0,
    hasCurrentLocation: true,
    subjectiveOptions: true,
  });
  assert.match(nearbyPresentation.title, /nearby|distance|close|around/i);
  assert.ok(Object.keys(nearby.result.distanceMilesByRestaurant ?? {}).length > 0);

  const ungrounded = runAskRumbly("i want to try something weird i've never had before", data);
  assert.equal(ungrounded.result.kind, 'unsupported');
  assert.equal(ungrounded.adaptation, undefined);
});

test('official and live handoffs carry a usable Disney action', () => {
  const { result } = runAskRumbly('how does mobile order work', data);
  assert.equal(result.kind, 'handoff');
  assert.ok(result.actions?.some((action) => action.kind === 'openDisney' && /^https:\/\/disneyworld\.disney\.go\.com\//.test(action.url)));
});

test('same question produces the same plan and result repeatedly', () => {
  const runs = Array.from({ length: 5 }, () => runAskRumbly('Where can I get a burger and a beer in Epcot?', data));
  runs.slice(1).forEach((run) => assert.deepEqual(run, runs[0]));
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

  const compactSafety = parse('shellfish safe food epcot mexico');
  assert.equal(compactSafety.plan.claimType, 'allergy_safety');
  assert.deepEqual(compactSafety.plan.constraints.allergenKeys, ['shellfish']);
  assert.equal(compactSafety.capability.disposition, 'clarify');
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

  const resolvedKind = compile('old fashioned cocktail');
  assert.equal(resolvedKind.plan.constraints.menuItemKind, 'cocktail');
  assert.equal(resolvedKind.compilation.kind, 'not_compiled');
  assert.match(resolvedKind.compilation.reason, /menu-item kind/i);
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
  const presentation = buildAskRumblyPresentation(plan, result, {
    linkedKind: 'item',
    totalPossibilities: result.itemKeys.length,
    hasCurrentLocation: false,
  });
  assert.equal(presentation.eyebrow, 'Disney allergy labels');
  assert.match(`${presentation.title} ${presentation.message}`, /Disney-labeled|Disney lists/i);
  assert.doesNotMatch(`${presentation.title} ${presentation.message}`, /taste buds|go forth|choose wisely|—/i);
});

test('generic allergy lists do not present guidance rows as orderable food', () => {
  const { result } = execute('allergy friendly character breakfast magic kingdom');
  assert.equal(result.kind, 'answer');
  const keys = new Set(result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.length > 0);
  assert.ok(returned.every((item) => !/^(?:guests? must|allergen guide|allergy guide|please (?:ask|speak)|speak to (?:a )?cast member)/i.test(item.item.trim())));
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
  const { plan, result } = execute('What restaurants are open right now near Tomorrowland?');
  assert.equal(plan.constraints.location, undefined);
  assert.equal(plan.constraints.distanceAnchor?.label, 'Tomorrowland');
  assert.notEqual(result.kind, 'error');
  assert.ok(result.trace?.appliedConstraints.includes('distance-radius:0.25mi'));
  assert.ok(!result.trace?.appliedConstraints.some((constraint) => constraint.startsWith('location:near:')));
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

test('exact landmarks use measured anchors while alternative locations remain typed constraints', () => {
  const landmark = execute('Where can I eat a meal under $15 near Space Mountain?');
  assert.equal(landmark.plan.constraints.distanceAnchor?.label, 'Space Mountain');
  assert.equal(landmark.plan.constraints.distanceAnchor?.entityType, 'attraction');
  assert.equal(landmark.result.kind, 'answer');
  assert.equal(landmark.result.proof.status, 'proven');

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

test('verified list answers retain the full linked result set for native expansion', () => {
  const { result } = execute('Where can I get ice cream?');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.ok(result.itemKeys.length > 12);
  assert.ok(result.restaurantIds.length > 12);
  const firstTenRestaurants = result.itemKeys.slice(0, 10).map((key) => key.split(':')[0]);
  assert.equal(new Set(firstTenRestaurants).size, firstTenRestaurants.length);
  assert.match(result.text, /and \d+ more/i);
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

test('nearest-from-landmark language uses the exact attraction point', () => {
  const { plan, result } = execute("Where's the nearest churro cart from Space Mountain?");
  assert.equal(plan.action, 'find');
  assert.equal(plan.constraints.distanceOperation, 'nearest');
  assert.equal(plan.constraints.distanceAnchor?.label, 'Space Mountain');
  assert.deepEqual(plan.subject.foodTerms, ['churro']);
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.ok(result.proof.witnesses.some((entry) => entry.constraint === 'distance-anchor:attraction:80010190'));
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
  // A terminal "close" is "near me", not the superlative.
  assert.equal(plan.constraints.distanceOperation, 'nearby');
  assert.equal(plan.diagnostics.meaningfulUnconsumedText, '');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  // A terminal "close" now returns proximity-ranked options rather than a
  // single winner, so a guest can weigh distance against what is on offer.
  assert.match(result.text, /verified locations for "fried rice"/i);
  assert.match(result.text, /ft away|mi away/i);
  assert.ok(result.restaurantIds.length > 1, 'a nearby request returns options, not one winner');
  // Ordered closest first, which is the property that makes the list useful.
  const distances = result.restaurantIds.map((id) => result.distanceMilesByRestaurant[id]);
  assert.ok(distances.every((value) => typeof value === 'number'));
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
});

test('short mobile keyword queries preserve food, location, and GF semantics', () => {
  const coffee = execute('coffee near space mountain');
  assert.deepEqual(coffee.plan.subject.foodTerms, ['coffee']);
  assert.equal(coffee.plan.constraints.distanceAnchor?.label, 'Space Mountain');
  assert.equal(coffee.plan.constraints.distanceAnchor?.entityType, 'attraction');
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

test('exact landmark nearest requests and near-landmark searches execute from measured points', () => {
  const exact = parse('closest coffee to rise of the resistance');
  assert.equal(exact.plan.action, 'find');
  assert.equal(exact.plan.constraints.distanceAnchor?.label, 'Star Wars: Rise of the Resistance');
  assert.equal(exact.capability.disposition, 'execute');

  const area = execute('coffee near tree of life');
  assert.equal(area.plan.constraints.distanceAnchor?.label, 'Tree of Life');
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

test('everyday pop tart wording resolves to Disney Lunch Box Tarts with concise subjective copy', () => {
  const response = runAskRumbly('Who has the best pop tart?', data);
  assert.equal(response.adaptation?.kind, 'subjective_options');
  assert.deepEqual(response.plan.subject.foodTerms, ['lunch box tart']);
  assert.equal(response.result.kind, 'answer');
  assert.equal(response.result.proof.status, 'proven');
  assert.equal(response.result.itemKeys.length, 2);
  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemKeys.length,
    hasCurrentLocation: false,
    subjectiveOptions: true,
  });
  assert.equal(presentation.title, 'Disney calls these Lunch Box Tarts.');
  assert.match(presentation.message, /can't rank|verified options/i);
  assert.ok(`${presentation.title} ${presentation.message}`.length < 150);
});

test('hungry-for-a-snack phrasing returns Disney-categorized snack options instead of every snack-period row', () => {
  const { plan, result } = execute("I'm hungry for a snack");
  assert.equal(plan.diagnostics.confidence, 'high');
  assert.deepEqual(plan.constraints.mealPeriods, ['snack']);
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
  assert.ok(result.itemKeys.length > 0);
  assert.ok(result.itemKeys.length < 1000);
  const keys = new Set(result.itemKeys);
  const rows = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(rows.every((item) => !item.is_alcoholic));
  assert.ok(rows.every((item) => !/^(?:assorted fountain beverages|dasani)/i.test(item.item)));
});

test('what-place-has grammar retains compound chicken and beer requirements', () => {
  const { plan, result } = execute('What place has chicken and beer?');
  assert.deepEqual(plan.subject.foodTerms, ['chicken', 'beer']);
  assert.equal(plan.diagnostics.confidence, 'high');
  assert.equal(result.kind, 'answer');
  assert.equal(result.proof.status, 'proven');
});

test('tomorrow restaurant hours use tomorrow data and proof', () => {
  const { plan, result } = execute("What time does Casey's Corner open tomorrow?");
  assert.equal(plan.constraints.time, 'tomorrow');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Tomorrow: Open/i);
  assert.doesNotMatch(result.text, /Open today/i);
  assert.ok(result.proof.witnesses.some((witness) => witness.constraint === 'time:tomorrow'));
});

test('how-close restaurant phrasing is distance intent rather than closing-hours intent', () => {
  const { plan, result } = runAskRumbly(
    'How close is Terra Treats?',
    data,
    { latitude: 28.4177, longitude: -81.5812 },
  );
  assert.equal(plan.action, 'distance');
  assert.equal(plan.claimType, 'restaurant_location');
  assert.equal(plan.diagnostics.meaningfulUnconsumedText, '');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /away/i);
  assert.doesNotMatch(result.text, /hours|open today/i);
  const presentation = buildAskRumblyPresentation(plan, result, {
    linkedKind: 'restaurant',
    totalPossibilities: result.restaurantIds?.length ?? 0,
    hasCurrentLocation: true,
  });
  assert.equal(presentation.eyebrow, 'Distance from you');
  assert.equal(presentation.title, result.text);
  assert.equal(presentation.message, 'Straight-line distance from your current location.');
  assert.doesNotMatch(`${presentation.title} ${presentation.message}`, /place I found|possibilit/i);
});

test('specific food proof keeps Coke nonalcoholic, chili dish-shaped, and corn dogs named', () => {
  const coke = execute('Who has Coke?').result;
  assert.equal(coke.kind, 'answer');
  const cokeKeys = new Set(coke.itemKeys);
  assert.ok(data.menuItems.filter((item) => cokeKeys.has(`${item.restaurant_id}:${item.item_id}`)).every((item) => !item.is_alcoholic));

  const chili = execute('Who has chili?').result;
  assert.equal(chili.kind, 'answer');
  assert.doesNotMatch(chili.text, /chili[- ](?:lime|rub|crisp|spice|sauce)/i);

  const cornDog = execute('Where can I get a corn dog?').result;
  assert.equal(cornDog.kind, 'answer');
  assert.match(cornDog.text, /Blue Ribbon Corn Dogs/i);
  assert.doesNotMatch(cornDog.text, /Giant Mozzarella/i);
});

test('unverified pita-pocket wording offers a useful broader recovery', () => {
  const { plan, result } = execute('Where can I get a pita pocket?');
  assert.equal(result.kind, 'no-match');
  const presentation = buildAskRumblyPresentation(plan, result, {
    linkedKind: null,
    totalPossibilities: 0,
    hasCurrentLocation: false,
  });
  assert.ok(presentation.suggestions.some((suggestion) => suggestion.kind === 'query'
    && suggestion.query === 'Where can I get pita?'));
});

test('claim rule table is well formed and independently addressable', () => {
  const names = CLAIM_RULES.map((rule) => rule.name);
  assert.equal(new Set(names).size, names.length, 'rule names must be unique so a test can target one');
  const known = new Set(CLAIM_FEATURES);
  for (const rule of CLAIM_RULES) {
    for (const feature of [...(rule.all ?? []), ...(rule.any ?? []), ...(rule.none ?? [])]) {
      assert.ok(known.has(feature), `${rule.name} references unknown feature ${feature}`);
    }
    assert.ok((rule.all?.length ?? 0) + (rule.any?.length ?? 0) > 0, `${rule.name} needs a positive condition`);
    assert.ok(rule.why.length > 0, `${rule.name} must state why it exists`);
  }
  const signatures = CLAIM_RULES.map((rule) => JSON.stringify([
    [...(rule.all ?? [])].sort(), [...(rule.any ?? [])].sort(), [...(rule.none ?? [])].sort(),
  ]));
  assert.equal(new Set(signatures).size, signatures.length, 'duplicate conditions make the later rule unreachable');
});

test('safety claims outrank menu claims regardless of table edits', () => {
  // These orderings are the reason the evidence gate exists. A reordering that
  // let disney-allergy-label win any of them would answer a safety, process, or
  // cross-contact question out of menu rows.
  const mustOutrankLabel = [
    'allergy-safety', 'cross-contact', 'kitchen-equipment', 'allergy-trained-staff',
    'allergy-kitchen-conversation', 'allergy-ordering-process',
  ];
  const labelIndex = CLAIM_RULES.findIndex((rule) => rule.name === 'disney-allergy-label');
  assert.ok(labelIndex >= 0);
  for (const name of mustOutrankLabel) {
    const index = CLAIM_RULES.findIndex((rule) => rule.name === name);
    assert.ok(index >= 0, `missing rule ${name}`);
    assert.ok(index < labelIndex, `${name} must be resolved before disney-allergy-label`);
  }
});

test('claim resolution reports the deciding rule and its evidence', () => {
  for (const [question, rule, claim] of [
    ['Is the chicken at Cosmic Rays safe for a peanut allergy?', 'allergy-safety', 'allergy_safety'],
    ['Does Be Our Guest have a dedicated allergy-friendly kitchen?', 'kitchen-equipment', 'kitchen_process'],
    ['What time does Magic Kingdom open?', 'park-hours-subject', 'live_park_operations'],
    ['Where can I get a burger in Magic Kingdom?', 'default-menu-presence', 'menu_presence'],
  ]) {
    const { plan } = parse(question);
    assert.equal(plan.claimType, claim, question);
    assert.equal(plan.diagnostics.claimRule, rule, question);
    assert.ok(Array.isArray(plan.diagnostics.claimFeatures), question);
  }

  // A park named as a scope stays a restaurant question; only a park standing
  // as the subject of open/close becomes park operations.
  const scoped = parse("What restaurants are open right now in Epcot?").plan;
  assert.equal(scoped.claimType, 'restaurant_hours');
  assert.notEqual(scoped.diagnostics.claimRule, 'park-hours-subject');
});

test('whats-new answers from first-seen dates without claiming Disney added them', () => {
  const response = runAskRumbly("what's new at Epcot", data);
  assert.equal(response.plan.claimType, 'menu_recency');
  assert.equal(response.plan.diagnostics.claimRule, 'whats-new');
  assert.deepEqual(response.plan.constraints.recency, { withinDays: 30 });
  // "New" is grammar here, not a food request.
  assert.deepEqual(response.plan.subject.foodTerms, []);
  assert.equal(response.plan.diagnostics.meaningfulUnconsumedText, '');
  assert.equal(response.result.kind, 'answer');
  assert.equal(response.result.proof.status, 'proven');

  // Rumbly cannot see before its own first collection, so every row imported
  // on that first day has an unknown age and can never count as new.
  const earliest = data.menuItems
    .map((item) => (item.first_seen ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()[0];
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const keys = new Set(response.result.itemKeys);
  const returned = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(returned.length > 0);
  assert.ok(returned.every((item) => (item.first_seen ?? '').slice(0, 10) > earliest), 'no birth-import rows');
  assert.ok(returned.every((item) => (item.first_seen ?? '').slice(0, 10) >= cutoff), 'inside the window');

  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemKeys.length,
    hasCurrentLocation: false,
  });
  assert.match(presentation.title, /new to Rumbly/i);
  // The note must attribute the date to Rumbly's own observation and must not
  // imply Disney recently added the item. Kept short deliberately: each card
  // carries its own "Added <date>", so the note only holds the boundary.
  assert.match(presentation.trustNote ?? '', /Rumbly/);
  assert.match(presentation.trustNote ?? '', /first se(?:en|aw)/i);
  assert.doesNotMatch(presentation.trustNote ?? '', /Disney (?:added|introduced|released)/i);
  assert.ok((presentation.trustNote ?? '').length < 120, 'the note stays short');
});

test('new as part of a dish name is not a recency request', () => {
  for (const question of ['I want a new york strip', 'new orleans style food', 'where can I get new england clam chowder']) {
    const { plan } = parse(question);
    assert.equal(plan.constraints.recency, undefined, question);
    assert.notEqual(plan.claimType, 'menu_recency', question);
  }
});

// The pavilion field is published from 2026-08-12 and is absent from the cached
// snapshot these tests load, so the behaviour is proven against injected
// records. Ids and pavilion names come from Backend/world_showcase_pavilions.py
// via Docs/WORLD_SHOWCASE_PAVILION_DATA.md.
const PAVILION_FIXTURE = {
  'teppan-edo': 'Japan',
  'katsura-grill': 'Japan',
  biergarten: 'Germany',
  'spice-road-table': 'Morocco',
  'le-cellier': 'Canada',
  'san-angel-restaurante': 'Mexico',
  'nine-dragons': 'China',
  'regal-eagle-smokehouse': 'The American Adventure',
  'africa-refreshment-outpost': 'Outpost',
};

const pavilionData = {
  ...data,
  restaurants: data.restaurants.map((restaurant) => PAVILION_FIXTURE[restaurant.restaurant_id]
    ? { ...restaurant, world_showcase_pavilion: PAVILION_FIXTURE[restaurant.restaurant_id] }
    : restaurant),
};
const pavilionVocabulary = buildParserVocabulary(pavilionData);

test('World Showcase pavilions link as locations once the field is published', () => {
  for (const [question, label] of [
    ['restaurants in Japan at Epcot', 'Japan'],
    ['where can I eat in Morocco', 'Morocco'],
    ['food in the Germany pavilion', 'Germany'],
    ['restaurants in Mexico', 'Mexico'],
  ]) {
    const plan = parseQueryPlan(question, pavilionVocabulary);
    assert.equal(plan.constraints.location?.entityType, 'pavilion', question);
    assert.equal(plan.constraints.location?.label, label, question);
    // The whole point: no unexplained text, so capability is not downgraded.
    assert.equal(plan.diagnostics.meaningfulUnconsumedText, '', question);
    assert.notEqual(plan.diagnostics.confidence, 'low', question);
  }
});

test('a bare pavilion name and its "pavilion" form link the same entity', () => {
  // `pavilion` is dining scaffolding, so "Japan pavilion" strips to a bare
  // "japan" unless the longer alias exists for longest-span linking to claim.
  const bare = parseQueryPlan('sushi in Japan', pavilionVocabulary);
  const withNoun = parseQueryPlan('sushi in the Japan pavilion', pavilionVocabulary);
  assert.equal(bare.constraints.location?.entityId, withNoun.constraints.location?.entityId);
  assert.equal(withNoun.diagnostics.meaningfulUnconsumedText, '');

  // Disney's own headings, which no guest says out loud.
  const outpost = parseQueryPlan('snacks in the African Outpost', pavilionVocabulary);
  assert.equal(outpost.constraints.location?.label, 'Outpost');
  const america = parseQueryPlan('food in the American Adventure', pavilionVocabulary);
  assert.equal(america.constraints.location?.label, 'The American Adventure');
});

test('a pavilion scope only matches venues carrying that pavilion', () => {
  const plan = parseQueryPlan('where can I eat in Japan', pavilionVocabulary);
  const result = executeQueryPlan(plan, pavilionData);
  assert.equal(result.kind, 'answer');
  const returned = new Set(result.restaurantIds ?? []);
  assert.ok(returned.size > 0);
  // Never matches an unmapped venue: absent and null both mean "unknown".
  for (const id of returned) {
    assert.equal(PAVILION_FIXTURE[id], 'Japan', `${id} is not a Japan pavilion venue`);
  }
});

test('pavilion copy reads as a place and widens to World Showcase', () => {
  // A food the pavilion does not carry, so the recovery path runs.
  const plan = parseQueryPlan('where can I get haggis in Japan', pavilionVocabulary);
  const result = executeQueryPlan(plan, pavilionData);
  const presentation = buildAskRumblyPresentation(plan, result, {
    linkedKind: result.kind === 'answer' ? 'item' : null,
    totalPossibilities: result.kind === 'answer' ? (result.itemKeys?.length ?? 0) : 0,
    hasCurrentLocation: false,
  });
  const rendered = `${presentation.title} ${presentation.message}`;
  assert.doesNotMatch(rendered, /\bin Japan\b/, 'reads as a pavilion, not a country');
  const widen = presentation.suggestions.find((suggestion) =>
    suggestion.kind === 'query' && /World Showcase/i.test(suggestion.label));
  assert.ok(widen, 'offers World Showcase rather than all of EPCOT');
});

test('country phrasing scopes to World Showcase', () => {
  for (const question of ['which country has beer', 'what countries have vegetarian food']) {
    const plan = parseQueryPlan(question, pavilionVocabulary);
    assert.match(plan.constraints.location?.label ?? '', /World Showcase/i, question);
    assert.equal(plan.diagnostics.meaningfulUnconsumedText, '', question);
  }
  // A scope the guest named themselves is never overridden.
  const scoped = parseQueryPlan('which country in Epcot has beer', pavilionVocabulary);
  assert.match(scoped.constraints.location?.label ?? '', /EPCOT/i);
});

// --- Regressions found in real thumbs-down feedback (ask_rumbly_negative_feedback).
// Every question below is one a guest actually typed and then told us was
// wrong. Replay them with `feedback_replay.ts`; these lock in the fixes.

test('an explicit alcohol request narrows the drink instead of becoming the dish name', () => {
  const response = runAskRumbly('Where can I get a dole whip with alcohol', data, { latitude: 28.4177, longitude: -81.5812 });
  // "with alcohol" used to be swallowed into the food term, so Rumbly searched
  // for a dish literally named "dole whip with alcohol" and missed the real
  // spiked ones.
  assert.deepEqual(response.plan.subject.foodTerms, ['dole whip']);
  assert.equal(response.plan.constraints.alcohol, 'required');
  assert.equal(response.result.kind, 'answer');
  const returned = new Set(response.result.itemKeys ?? []);
  const items = data.menuItems.filter((item) => returned.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(items.length > 0);
  assert.ok(items.every(menuItemHasAlcohol), 'every returned row has redundant alcohol evidence');
  assert.ok(items.some((item) => !item.is_alcoholic), 'known false-negative booleans do not hide otherwise proven matches');

  const excluded = runAskRumbly('dole whip without alcohol', data).result;
  assert.equal(excluded.kind, 'answer');
  const excludedKeys = new Set(excluded.itemKeys ?? []);
  const excludedRows = data.menuItems.filter((item) => excludedKeys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(excludedRows.every((item) => !menuItemHasAlcohol(item)));
  assert.ok(excludedRows.every((item) => !/angry orchard|hard cider/i.test(`${item.item} ${item.description ?? ''}`)));
});

test('a virgin request excludes alcohol rather than requiring it', () => {
  const plan = parseQueryPlan('non-alcoholic dole whip', vocabulary);
  assert.equal(plan.constraints.alcohol, 'excluded');
  assert.equal(plan.diagnostics.meaningfulUnconsumedText, '');

  for (const question of [
    'mocktail at GEO-82',
    'non-alcoholic cocktail at GEO-82',
    'zero-proof cocktail at GEO-82',
  ]) {
    const response = runAskRumbly(question, data);
    assert.equal(response.plan.constraints.alcohol, 'excluded', question);
    assert.equal(response.result.kind, 'answer', question);
    const keys = new Set(response.result.itemKeys ?? []);
    const rows = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
    assert.ok(rows.some((item) => itemMatchesMenuItemKind(item, 'non_alcoholic_drink')), question);
    assert.ok(rows.every((item) => !menuItemHasAlcohol(item)), question);
  }
});

test('semantic admission excludes a weaker nearby food before proximity sorting', () => {
  const response = runAskRumbly('Where can I get chicken nuggets', data, { latitude: 28.4177, longitude: -81.5812 });
  assert.equal(response.result.kind, 'answer');
  const keys = new Set(response.result.itemKeys ?? []);
  const items = data.menuItems.filter((item) => keys.has(`${item.restaurant_id}:${item.item_id}`));
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => /chicken/i.test(`${item.item} ${item.category}`)));
  assert.ok(!keys.has('block-and-hans:412387005'), 'Pretzel Nuggets are not chicken nuggets');
});

test('a cocktail named after a food never leads a plain food request', () => {
  const response = runAskRumbly('How much are churros in Epcot', data);
  assert.equal(response.result.kind, 'answer');
  const ids = response.result.itemIds ?? [];
  const items = ids.map((id) => data.menuItems.find((item) => item.item_id === id)).filter(Boolean);
  const firstAlcoholic = items.findIndex((item) => item.is_alcoholic);
  // A Churro Margarita is a real churro row and stays in the results; it just
  // cannot be the answer a guest sees first.
  if (firstAlcoholic !== -1) {
    assert.ok(items.slice(0, firstAlcoholic).some((item) => !item.is_alcoholic));
    assert.equal(firstAlcoholic, items.length - 1, 'alcoholic rows sort last');
  }
});

test('"what is new" works with the adjective on either side of the noun', () => {
  for (const question of [
    'What snacks are new at EPCOT?',
    'any new snacks at EPCOT',
    'which items are new at Magic Kingdom',
  ]) {
    const plan = parseQueryPlan(question, vocabulary);
    assert.equal(plan.constraints.recency?.withinDays, 30, question);
    assert.equal(plan.diagnostics.meaningfulUnconsumedText, '', question);
  }
});

test('the guest’s own distance to an attraction is out of scope, with a dining redirect', () => {
  for (const question of ['How close am I to space mountain', 'How far am I from Space Mountain']) {
    const response = runAskRumbly(question, data, { latitude: 28.4177, longitude: -81.5812 });
    // Answering with every restaurant ranked by distance to the ride was a
    // confident answer to a question nobody asked.
    assert.equal(response.result.kind, 'unsupported', question);
    const presentation = buildAskRumblyPresentation(response.plan, response.result, {
      linkedKind: null,
      totalPossibilities: 0,
      hasCurrentLocation: true,
    });
    assert.ok(presentation.suggestions.some((suggestion) =>
      suggestion.kind === 'query' && /Space Mountain/i.test(suggestion.query)), question);
  }
  // Distance to a restaurant is still a dining question.
  const restaurant = runAskRumbly('How close is Terra treats?', data, { latitude: 28.4177, longitude: -81.5812 });
  assert.equal(restaurant.result.kind, 'answer');
  // So is searching around the same landmark.
  const nearby = runAskRumbly('snacks near space mountain', data, { latitude: 28.4177, longitude: -81.5812 });
  assert.equal(nearby.result.kind, 'answer');
});

test('venue names Disney runs together are recognised spaced out, and vice versa', () => {
  for (const [question, expected] of [
    ['What time does Base Line Tap House open', 'BaseLine Tap House'],
    ['Is Board Walk Deli open', 'BoardWalk Deli'],
    ['menu for Abracada Bar', 'AbracadaBar'],
    ['Where is Ye Sake', 'YeSake Kiosk'],
  ]) {
    const plan = parseQueryPlan(question, vocabulary);
    const linked = plan.linkedEntities.filter((entity) => entity.type === 'restaurant').map((entity) => entity.label);
    assert.ok(linked.includes(expected), `${question} -> ${linked.join(', ') || 'nothing'}`);
  }
  // A shortened camel split must not swallow the resort area of the same name.
  const area = parseQueryPlan('restaurants on the Board Walk', vocabulary);
  assert.ok(!area.linkedEntities.some((entity) => entity.type === 'restaurant' && entity.label === 'BoardWalk Deli'));
});

test('guests asking for pizza are shown the flatbreads Disney renamed', () => {
  const response = runAskRumbly('Pizza in Magic kingdom', data);
  assert.equal(response.result.kind, 'answer');
  const ids = new Set(response.result.itemIds ?? []);
  const items = data.menuItems.filter((item) => ids.has(item.item_id));
  // Pinocchio's publishes All-Meat/Pepperoni/Gourmet Cheese *Flatbread*; its
  // only row still named "pizza" is the plant-based one, which was the whole
  // answer a guest used to get for "pizza in Magic Kingdom".
  assert.ok(items.some((item) => /flatbread/i.test(item.item)), 'flatbreads count as pizza');
  assert.ok(items.length > 2);
});

test('a list only claims to be closest-first when it actually is', () => {
  const response = runAskRumbly('Where can I get chicken nuggets', data, { latitude: 28.4177, longitude: -81.5812 });
  const presentation = buildAskRumblyPresentation(response.plan, response.result, {
    linkedKind: 'item',
    totalPossibilities: response.result.itemIds?.length ?? 0,
    hasCurrentLocation: true,
  });
  const distances = response.result.distanceMilesByRestaurant ?? {};
  const ordered = [...new Set(response.result.restaurantIds ?? [])]
    .map((id) => distances[id])
    .filter((value) => value != null);
  const ascending = ordered.every((value, index) => index === 0 || value >= ordered[index - 1]);
  assert.equal(ascending, true);
  assert.match(presentation.eyebrow, /closest (?:first|match)/i);
});
