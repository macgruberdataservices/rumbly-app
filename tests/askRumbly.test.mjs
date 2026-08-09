import assert from 'node:assert/strict';
import test from 'node:test';

import { loadData } from '../modules/ask-rumbly/scripts/ask-rumbly/data.ts';
import { answerQuery } from '../modules/ask-rumbly/scripts/ask-rumbly/executor.ts';
import { classifyRuleBased } from '../modules/ask-rumbly/scripts/ask-rumbly/rule_classifier.ts';
import { suggestEntities } from '../modules/ask-rumbly/scripts/ask-rumbly/entity_suggestions.ts';
import { itemMatchesDietary } from '../src/search/filters.ts';

const data = await loadData();

function ask(question) {
  const classified = classifyRuleBased(question, data);
  return { classified, result: answerQuery(classified, data) };
}

test('core cheapest query requires burger evidence', () => {
  const { result } = ask('where is the cheapest hamburger');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /burger/i);
  assert.doesNotMatch(result.text, /hashbrown/i);
  assert.ok(result.restaurantIds?.length === 1);
  assert.ok(result.itemIds?.length === 1);
});

test('nearest and cheapest compare every evidence-backed burger candidate', () => {
  const nearest = ask('whats the closest place to get a burger?');
  assert.equal(nearest.classified.item, 'burger');
  assert.equal(nearest.result.kind, 'answer');
  assert.match(nearest.result.text, /Bacon Cheeseburger at The Plaza Restaurant \(140 ft away\)/i);

  const cheapest = ask('whats the cheapest burger?');
  assert.equal(cheapest.classified.item, 'burger');
  assert.equal(cheapest.result.kind, 'answer');
  assert.match(cheapest.result.text, /Lil' Shroom Cheeseburger & Truffle Fries \(\$6\.00\) at STK® Steakhouse/i);
});

test('domain nouns such as drink survive residual extraction', () => {
  const { classified, result } = ask('what is the cheapest drink');
  assert.equal(classified.item, 'drink');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /drink/i);
});

test('or compounds execute as a union instead of a literal menu phrase', () => {
  const { classified, result } = ask('where can I get pizza or burgers');
  assert.equal(classified.compoundMode, 'or');
  assert.deepEqual(classified.items, ['pizza', 'burgers']);
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /\[pizza\]|\[burgers\]/i);
  assert.doesNotMatch(result.text, /^"pizza or" is available/i);
});

test('and compounds require one restaurant serving every requested item', () => {
  const { classified, result } = ask('where can I get a burger and a beer');
  assert.equal(classified.compoundMode, 'and');
  assert.deepEqual(classified.items, ['burger', 'beer']);
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /burger" and "beer/i);
  assert.doesNotMatch(result.text, /"burger and"/i);
  assert.ok(result.restaurantIds.includes('plaza-restaurant'));
});

test('restaurant item checks only return items with direct food evidence', () => {
  const { result } = ask('does cosmic rays have fries?');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Black Garlic, Truffle, and Parmesan Fries/i);
  assert.doesNotMatch(result.text, /Chicken Sandwich/i);
});

test('fuzzy edit distance cannot add unrelated Pancho matches', () => {
  const { result } = ask('where can i get a pancho?');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Jock Lindsey's Hangar Bar[^;]*Pancho's Margarita/i);
  assert.doesNotMatch(result.text, /California Grill|Frontera Cocina/i);
});

test('singular place-serves phrasing resolves item synonyms', () => {
  const { classified, result } = ask('what place serves chicken fingers?');
  assert.equal(classified.queryType, 'list');
  assert.equal(classified.item, 'chicken fingers');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /chicken fingers/i);
});

test('qualified menu categories retain branded corn-dog venues', () => {
  const { result } = ask('where can i get a corndog?');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Blue Ribbon Corn Dogs/i);
  assert.ok(result.restaurantIds.includes('boardwalk-blue-ribbon-corn-dogs'));
});

test('restaurant connectors and structured scoop vocabulary resolve Salt & Straw', () => {
  const { classified, result } = ask('does salt and straw serve ice cream?');
  assert.equal(classified.restaurantName, 'salt & straw');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /^Yes, Salt & Straw has:/i);
  assert.match(result.text, /Single Scoop/i);
});

test('restaurant item checks only return items with direct food evidence', () => {
  const { result } = ask('does cosmic rays have fries?');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Black Garlic, Truffle, and Parmesan Fries/i);
  assert.doesNotMatch(result.text, /Chicken Sandwich/i);
});

test('fuzzy edit distance cannot add unrelated Pancho matches', () => {
  const { result } = ask('where can i get a pancho?');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Jock Lindsey's Hangar Bar[^;]*Pancho's Margarita/i);
  assert.doesNotMatch(result.text, /California Grill|Frontera Cocina/i);
});

test('singular place-serves phrasing resolves item synonyms', () => {
  const { classified, result } = ask('what place serves chicken fingers?');
  assert.equal(classified.queryType, 'list');
  assert.equal(classified.item, 'chicken fingers');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /chicken fingers/i);
});

test('qualified menu categories retain branded corn-dog venues', () => {
  const { result } = ask('where can i get a corndog?');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Blue Ribbon Corn Dogs/i);
  assert.ok(result.restaurantIds.includes('boardwalk-blue-ribbon-corn-dogs'));
});

test('restaurant connectors and structured scoop vocabulary resolve Salt & Straw', () => {
  const { classified, result } = ask('does salt and straw serve ice cream?');
  assert.equal(classified.restaurantName, 'salt & straw');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /^Yes, Salt & Straw has:/i);
  assert.match(result.text, /Single Scoop/i);
});

test('bare compound food phrases default to a multi-location list', () => {
  const { classified, result } = ask('beer and a pretzel');
  assert.equal(classified.queryType, 'list');
  assert.equal(classified.compoundMode, 'and');
  assert.equal(result.kind, 'answer');
});

test('restaurant-scoped item answers never cite description-only items', () => {
  const { result } = ask('does caseys corner have hot dogs');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /^Yes,/);
  assert.match(result.text, /hot dog/i);
  assert.doesNotMatch(result.text, /brownie|lemonade/i);
});

test('explicit non-dining questions decline even when words overlap menu data', () => {
  for (const question of [
    'whats the weather today',
    'what time does the park open',
    'when does Epcot close',
    'is Magic Kingdom open',
    'who is Mickey Mouse',
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'unsupported', question);
    assert.equal(result.kind, 'unsupported', question);
  }
});

test('common desire and restaurant-list phrasings remain in domain', () => {
  assert.equal(ask("I'd like a beer").classified.queryType, 'list');
  assert.equal(ask('what restaurants serve burgers').classified.queryType, 'list');
});

test('food names containing open are not stolen by hours intent', () => {
  const { classified } = ask('where can I get an open faced sandwich');
  assert.equal(classified.queryType, 'list');
  assert.equal(classified.item, 'open faced sandwich');
});

test('the most specific location wins over a park-name substring', () => {
  const { classified, result } = ask('where can I get chicken at Animal Kingdom Lodge');
  assert.equal(classified.park, "Disney's Animal Kingdom Lodge");
  assert.equal(classified.item, 'chicken');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /Animal Kingdom Lodge/);
});

test('short resort aliases constrain results instead of leaking into the item phrase', () => {
  const { classified, result } = ask('where can i get ice cream at coronado');
  assert.equal(classified.park, "Disney's Coronado Springs Resort");
  assert.equal(classified.item, 'ice cream');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /in Disney's Coronado Springs Resort/i);
  assert.ok(result.restaurantIds.length > 0);
  const coronadoIds = new Set(
    data.restaurants
      .filter((restaurant) => restaurant.resort === "Disney's Coronado Springs Resort")
      .map((restaurant) => restaurant.restaurant_id)
  );
  assert.ok(result.restaurantIds.every((restaurantId) => coronadoIds.has(restaurantId)));
  assert.doesNotMatch(result.text, /Plaza Ice Cream Parlor|Tony's Town Square/i);
});

test('natural resort aliases are generated from the published resort names', () => {
  const cases = [
    ['poly', /Polynesian/],
    ['polynesian', /Polynesian/],
    ['french quarter', /French Quarter/],
    ['all star sports', /All-Star Sports/],
    ['swan', /Swan Hotel/],
    ['dolphin', /Dolphin Hotel/],
    ['kidani', /Kidani Village/],
    ['beach club', /Beach Club/],
    ['boardwalk', /BoardWalk/],
    ['carribean beach', /Caribbean Beach/],
    ['contemporary', /Contemporary/],
  ];
  for (const [alias, expected] of cases) {
    const classified = classifyRuleBased(`where can i get ice cream at the ${alias}`, data);
    assert.match(classified.park ?? '', expected, alias);
    assert.equal(classified.item, 'ice cream', alias);
  }
});

test('guest-facing resort families include split hotel and villa records', () => {
  for (const [alias, familyPattern] of [
    ['poly', /Polynesian/],
    ['boardwalk', /BoardWalk/],
  ]) {
    const { result } = ask(`where can i get ice cream at ${alias}`);
    assert.equal(result.kind, 'answer', alias);
    const resultResorts = result.restaurantIds.map(
      (restaurantId) => data.restaurants.find((restaurant) => restaurant.restaurant_id === restaurantId)?.resort ?? ''
    );
    assert.ok(resultResorts.length > 0, alias);
    assert.ok(resultResorts.every((resort) => familyPattern.test(resort)), alias);
  }
});

test('specific resort wings do not expand to a shared parent complex', () => {
  for (const [alias, expectedResort] of [
    ['french quarter', "Disney's Port Orleans Resort - French Quarter"],
    ['kidani', "Disney's Animal Kingdom Villas - Kidani Village"],
  ]) {
    const { result } = ask(`where can i get ice cream at ${alias}`);
    assert.equal(result.kind, 'answer', alias);
    const resultResorts = result.restaurantIds.map(
      (restaurantId) => data.restaurants.find((restaurant) => restaurant.restaurant_id === restaurantId)?.resort
    );
    assert.ok(resultResorts.length > 0, alias);
    assert.ok(resultResorts.every((resort) => resort === expectedResort), alias);
  }
});

test('entity suggestions use canonical local-data names and replacement ranges', () => {
  const resortQuery = 'where can i get ice cream at coro';
  const resort = suggestEntities(resortQuery, data).find((suggestion) => /Coronado Springs/.test(suggestion.label));
  assert.ok(resort);
  assert.equal(resort.type, 'Resort');
  assert.equal(
    resortQuery.slice(0, resort.replaceStart) + resort.label + resortQuery.slice(resort.replaceEnd),
    "where can i get ice cream at Disney's Coronado Springs Resort"
  );

  const restaurant = suggestEntities('does cosmic', data)[0];
  assert.equal(restaurant.label, "Cosmic Ray's Starlight Café");
  assert.equal(restaurant.type, 'Restaurant');

  const area = suggestEntities('food in fantasy', data).find((suggestion) => suggestion.label === 'Fantasyland');
  assert.ok(area);
  assert.equal(area.type, 'Area');
});

test('selected canonical resort suggestions remain executable scopes', () => {
  const query = "where can i get ice cream at Disney's Coronado Springs Resort";
  const classified = classifyRuleBased(query, data);
  assert.equal(classified.park, "Disney's Coronado Springs Resort");
  assert.equal(classified.item, 'ice cream');
});

test('menu questions route to the existing restaurant page', () => {
  for (const question of [
    "What's on the menu at Sci-Fi Dine-In right now?",
    'What does Cosmic Rays have on the menu?',
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'menu', question);
    assert.equal(result.kind, 'answer', question);
    assert.equal(result.actions?.[0]?.kind, 'openRestaurant', question);
    assert.ok(result.restaurantIds?.length === 1, question);
    assert.doesNotMatch(result.text, /open today|open now|open till/i, question);
  }
});

test('reservation questions expose support and a truthful Disney handoff', () => {
  for (const question of [
    "Can I still get a reservation for Cinderella's Royal Table today?",
    'Can I still book a same-day reservation for Le Cellier?',
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'attribute', question);
    assert.equal(classified.attribute, 'reservations', question);
    assert.equal(result.kind, 'answer', question);
    assert.match(result.text, /accepts reservations/i, question);
    assert.match(result.text, /can't see live availability/i, question);
    assert.ok(result.actions?.some((action) => action.kind === 'openDisney'), question);
  }
});

test('walk-up questions expose support without claiming live availability', () => {
  for (const question of [
    "Is Trader Sam's Grog Grotto walk-up only right now?",
    "Is there a wait list option for Oga's Cantina today?",
    'Does Nomad Lounge have a walk-up list?',
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'attribute', question);
    assert.equal(classified.attribute, 'walkup_list', question);
    assert.equal(result.kind, 'answer', question);
    assert.match(result.text, /offers a Walk-Up List/i, question);
    assert.ok(result.actions?.some((action) => action.kind === 'openDisney'), question);
  }
});

test('global restaurant-feature questions return app-card ids', () => {
  for (const question of [
    'What quick service places have mobile order available right now?',
    'What restaurants near me have walk-up availability?',
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'attributeList', question);
    assert.equal(result.kind, 'answer', question);
    assert.ok(result.restaurantIds?.length > 0, question);
    assert.match(result.text, /not current slot or ordering availability/i, question);
  }
});

test('smart punctuation and natural Mobile Order phrasing normalize at the boundary', () => {
  const menu = ask('What’s on the menu at Cosmic Ray’s?');
  assert.equal(menu.classified.queryType, 'menu');
  assert.equal(menu.result.kind, 'answer');
  assert.equal(menu.result.actions?.[0]?.kind, 'openRestaurant');

  for (const question of [
    'What quick-service restaurants have Mobile Order?',
    'where can i mobile order in Magic Kingdom',
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'attributeList', question);
    assert.equal(classified.attribute, 'mobile_order', question);
    assert.equal(result.kind, 'answer', question);
    assert.ok(result.restaurantIds?.length > 0, question);
  }
});

test('suggestions deduplicate raw parks that share one display name', () => {
  const suggestions = suggestEntities('food in magic', data);
  const labels = suggestions.map((suggestion) => `${suggestion.type}:${suggestion.label}`);
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(labels.filter((label) => label === 'Park:Magic Kingdom').length, 1);
  assert.equal(suggestions[0]?.label, 'Magic Kingdom');
  assert.ok(!labels.includes('Area:TTC'));
});

test('a guest duration is not interpreted as restaurant hours', () => {
  const { classified, result } = ask("I have an hour and I'm near Test Track, surprise me with something good.");
  assert.notEqual(classified.queryType, 'hours');
  assert.notEqual(result.kind, 'answer');
});

test('competing cheapest and nearest intents ask a structured follow-up', () => {
  const { classified, result } = ask('cheapest and closest burger');
  assert.equal(classified.queryType, 'clarification');
  assert.equal(result.kind, 'clarification');
  assert.deepEqual(result.clarification.options.map((option) => option.value), ['cheapest', 'nearest']);
  const cheapest = result.clarification.options[0].nextQuery;
  assert.ok(cheapest);
  assert.equal(answerQuery(cheapest, data).kind, 'answer');
});

test('ambiguous restaurant names ask which restaurant was intended', () => {
  const { result } = ask('does the plaza have fries');
  assert.equal(result.kind, 'clarification');
  assert.equal(result.clarification.kind, 'restaurant');
  assert.ok(result.clarification.options.length >= 2);
  const selected = result.clarification.options.find((option) => option.label === 'The Plaza Restaurant');
  assert.ok(selected?.nextQuery);
  assert.equal(answerQuery(selected.nextQuery, data).kind, 'answer');
});

test('open-now intent is distinct from a schedule request', () => {
  const live = ask('is Cosmic Rays open right now');
  const schedule = ask('what time does Cosmic Rays close');
  assert.equal(live.classified.hoursMode, 'openNow');
  assert.equal(schedule.classified.hoursMode, 'schedule');
  assert.match(live.result.text, /open now|not open now/i);
});

test('tomorrow hours preserve the restaurant name and day offset', () => {
  const { classified, result } = ask('when does Be Our Guest open tomorrow');
  assert.equal(classified.restaurantName?.toLowerCase(), 'be our guest');
  assert.equal(classified.dayOffset, 1);
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /^Tomorrow,/);
});

test('multiple explicit allergen requirements combine with AND semantics', () => {
  const { classified } = ask('where can I get gluten free dairy free pizza');
  assert.deepEqual(new Set(classified.allergenKeys), new Set(['gluten-wheat', 'milk']));
});

test('Find dietary filtering requires every selected Disney allergen label', () => {
  const milkOnly = { is_kids: false, is_allergy_friendly: true, allergens: ['milk'] };
  const milkAndEgg = { is_kids: false, is_allergy_friendly: true, allergens: ['milk', 'egg'] };

  assert.equal(itemMatchesDietary(milkOnly, new Set(['milk', 'egg'])), false);
  assert.equal(itemMatchesDietary(milkAndEgg, new Set(['milk', 'egg'])), true);
  assert.equal(itemMatchesDietary(milkOnly, new Set(['allergy-friendly', 'egg'])), false);
  assert.equal(
    itemMatchesDietary(
      { is_kids: false, is_allergy_friendly: true, allergens: undefined },
      new Set(['milk'])
    ),
    false
  );
});

test('allergy answers attribute affirmative results to Disney and keep the caveat', () => {
  const { result } = ask('does Cosmic Rays have a peanut free burger');
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /^Disney lists (this|these) as /);
  assert.match(result.text, /not a guarantee/i);
  assert.match(result.text, /confirm with a Cast Member/i);
  assert.equal(result.safety?.kind, 'allergy');
  assert.equal(result.safety?.acknowledgementVersion, 1);
  assert.deepEqual(new Set(result.safety?.allergenKeys), new Set(['peanut']));
});

test('generic scoped allergy questions list only Disney-labeled options', () => {
  for (const [question, expectedKey, expectedPark] of [
    ['Where can I get gluten-free food near Magic Kingdom?', 'gluten-wheat', 'Magic Kingdom'],
    ['what milk free options are in Epcot', 'milk', 'EPCOT'],
  ]) {
    const { classified, result } = ask(question);
    assert.equal(classified.queryType, 'allergyList', question);
    assert.equal(classified.park, expectedPark, question);
    assert.ok(classified.allergenKeys.includes(expectedKey), question);
    assert.equal(result.kind, 'answer', question);
    assert.match(result.text, /^Disney lists these as /, question);
    assert.match(result.text, /not a guarantee/i, question);
    assert.ok(result.restaurantIds?.length > 0, question);
    assert.equal(result.restaurantIds?.length, result.itemIds?.length, question);
  }
});

test('restaurant accommodation language is never promoted to an item name', () => {
  const { classified, result } = ask('What restaurants can accommodate a shellfish allergy?');
  assert.equal(classified.queryType, 'allergyList');
  assert.equal(classified.item, null);
  assert.deepEqual(classified.allergenKeys, ['shellfish']);
  assert.equal(result.kind, 'answer');
  assert.match(result.text, /^Disney lists these as Shellfish Allergy-Friendly/);
  assert.doesNotMatch(result.text, /"accommodate"/i);
});

test('anything-at-restaurant allergy phrasing routes to the restaurant label list', () => {
  const { classified, result } = ask('Is there anything nut-free at Be Our Guest?');
  assert.equal(classified.queryType, 'allergyList');
  assert.equal(classified.restaurantName, 'be our guest');
  assert.deepEqual(new Set(classified.allergenKeys), new Set(['peanut', 'tree-nut']));
  assert.match(result.text, /Be Our Guest Restaurant/);
  assert.doesNotMatch(result.text, /menu item labeled .*"be our guest"/i);
});

test('missing allergen-labeled items use a hedged Disney-label answer', () => {
  const { result } = ask('does Cosmic Rays have a peanut free unicorn burger');
  assert.equal(result.kind, 'no-match');
  assert.match(result.text, /Disney doesn't publish/i);
  assert.match(result.text, /Cast Member/i);
  assert.doesNotMatch(result.text, /^No,/);
});

test('nonexistent entities never produce a fabricated answer', () => {
  const { result } = ask('cheapest unicorn burger');
  assert.equal(result.kind, 'no-match');
});
