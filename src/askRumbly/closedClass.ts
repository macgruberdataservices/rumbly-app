// Closed-class grammar inventory.
//
// This replaces the parser's previous approach of listing every word that had
// ever caused a false "unconsumed meaning" report. That list had to grow once
// per unlucky query, and each addition weakened the confidence gate for every
// other question.
//
// The inventory here is closed in the linguistic sense: English does not add
// pronouns, determiners, or prepositions. It can be reviewed once and then
// left alone. A word that is not in one of these sets and was not consumed by
// entity linking, food matching, or a typed constraint is genuinely
// unexplained meaning, and lowering confidence is the correct response.

// Pronouns, determiners, auxiliaries, prepositions, conjunctions, wh-words,
// degree/quantity words, and politeness markers. None of these can name a
// food, a restaurant, or a constraint on their own.
const FUNCTION_WORDS = new Set([
  // pronouns and pro-forms
  'i', 'im', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'theirs', 'themselves', 'one', 'ones',
  'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything',
  'everyone', 'everybody', 'everything', 'nobody', 'nothing',
  'somewhere', 'anywhere', 'everywhere', 'nowhere', 'there', 'here',
  // determiners and quantifiers
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'each', 'every', 'either',
  'neither', 'both', 'all', 'any', 'some', 'no', 'none', 'other', 'others',
  'another', 'such', 'same', 'own', 'few', 'several', 'many', 'much', 'most',
  'more', 'less', 'least', 'enough', 'lot', 'lots', 'couple', 'bunch',
  // auxiliaries, modals, copula
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'done', 'have', 'has', 'had', 'having', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'ought', 'let', 'lets', 'get', 'got',
  // negation and contraction fragments
  'not', 'nt', 'dont', 'doesnt', 'didnt', 'cant', 'cannot', 'wont', 'isnt',
  'arent', 'wasnt', 'werent', 'havent', 'hasnt', 'hadnt', 'wouldnt', 'couldnt',
  'shouldnt', 'aint', 's', 're', 've', 'll', 'd', 't', 'm',
  // Contractions survive tokenization with the apostrophe stripped.
  'id', 'ill', 'ive', 'youd', 'youll', 'youve', 'wed', 'weve', 'well', 'theyd',
  'theyll', 'theyve', 'hed', 'shed', 'itd', 'thats', 'theres', 'lets',
  // wh-words and interrogative frames
  'what', 'whats', 'which', 'who', 'whos', 'whom', 'whose', 'where', 'wheres',
  'when', 'whens', 'why', 'how', 'hows', 'kind', 'kinds', 'sort', 'sorts',
  'type', 'types',
  // prepositions and particles
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
  'as', 'at', 'before', 'behind', 'below', 'beside', 'besides', 'between',
  'beyond', 'by', 'down', 'during', 'except', 'for', 'from', 'in', 'inside',
  'into', 'like', 'near', 'nearby', 'of', 'off', 'on', 'onto', 'out', 'outside',
  'over', 'past', 'per', 'since', 'through', 'throughout', 'to', 'toward',
  'towards', 'under', 'until', 'up', 'upon', 'via', 'with', 'within', 'without',
  // conjunctions and discourse glue
  'and', 'or', 'but', 'nor', 'so', 'yet', 'if', 'then', 'than', 'because',
  'though', 'although', 'while', 'whether', 'unless', 'also', 'too', 'just',
  'only', 'even', 'still', 'again', 'ever', 'never', 'always', 'maybe',
  'actually', 'really', 'very', 'quite', 'pretty', 'super', 'kinda', 'sorta',
  'well', 'ok', 'okay', 'plus',
  // politeness, greetings, and filler
  'please', 'thanks', 'thank', 'hi', 'hey', 'hello', 'yo', 'sup', 'rumbly',
  'wanna', 'gonna', 'gotta', 'want', 'wants', 'wanted', 'need', 'needs',
  'needed', 'looking', 'look', 'trying', 'try', 'help', 'know', 'think',
  'tell', 'say', 'go', 'going', 'heading', 'head', 'take', 'give', 'put',
]);

// Words that are about the act of finding somewhere to eat rather than about
// naming a food, a place, or a constraint. They carry no residual meaning once
// the typed plan has captured the request, so leaving them unconsumed should
// not lower confidence.
//
// Unlike the previous stopword list this set is deliberately small and
// domain-shaped: adding to it is a product decision about search scaffolding,
// not a way to rescue one unlucky query.
const DINING_SCAFFOLDING = new Set([
  // venue nouns
  'place', 'places', 'restaurant', 'restaurants', 'spot', 'spots', 'stand',
  'stands', 'cart', 'carts', 'location', 'locations', 'venue', 'venues',
  'kiosk', 'kiosks', 'counter', 'window', 'shop', 'shops', 'dining', 'resort',
  'park', 'parks', 'area', 'areas', 'pavilion', 'disney',
  // the act of eating or acquiring
  'eat', 'eats', 'eating', 'ate', 'drink', 'drinks', 'drinking', 'grab',
  'grabbing', 'buy', 'buying', 'order', 'ordering', 'orders', 'find', 'finds',
  'serve', 'serves', 'serving', 'served', 'sell', 'sells', 'selling', 'sold',
  'offer', 'offers', 'offering', 'have', 'has', 'carry', 'carries', 'available',
  'availability', 'show', 'shows', 'see', 'view', 'list', 'lists', 'listed',
  'suggest', 'suggests', 'suggested', 'recommend', 'recommends', 'recommended',
  // the objects of a dining search
  'food', 'foods', 'meal', 'meals', 'dish', 'dishes', 'item', 'items',
  'option', 'options', 'choice', 'choices', 'menu', 'menus', 'bite', 'bites',
  // constraint scaffolding already represented in the typed plan
  'allergy', 'allergies', 'allergic', 'allergen', 'allergens', 'label',
  'labels', 'labeled', 'labelled', 'free', 'friendly', 'safe', 'safely',
  'safest', 'safety', 'open', 'opens', 'closed', 'close', 'closes', 'closing',
  'hour', 'hours', 'time', 'times', 'now', 'today', 'tonight', 'tomorrow',
  'morning', 'afternoon', 'evening', 'night', 'late', 'early', 'currently',
  'right', 'rn', 'asap', 'soon', 'later', 'cheap', 'cheapest', 'cheaper',
  'price', 'prices', 'priced', 'expensive', 'budget', 'broke', 'affordable',
  'pricey', 'splurge', 'deal', 'deals', 'closest', 'nearest',
  'far', 'close', 'distance', 'walk', 'walking', 'best', 'better', 'good',
  'decent', 'solid', 'amazing', 'awesome', 'worst', 'value', 'quality',
  'great', 'top', 'favorite', 'worth', 'family', 'kid', 'kids', 'child',
  'children', 'childrens', 'toddler', 'adult', 'adults',
  // Who the guest is asking on behalf of. These narrow nothing the dataset can
  // act on, but they appear constantly in real questions ("my daughter is
  // celiac", "somewhere my kids will eat").
  'wife', 'husband', 'partner', 'spouse', 'son', 'daughter', 'mom', 'mother',
  'dad', 'father', 'grandma', 'grandpa', 'friend', 'friends', 'group', 'party',
  'people', 'guest', 'guests', 'stop', 'stops', 'moment',
  // Wanting something is the frame of the question, not a constraint on it.
  'love', 'loves', 'craving', 'crave', 'fancy', 'feel', 'feeling', 'mood',
  'hungry', 'starving', 'thirsty', 'grabbing', 'pick', 'picking',
  // Generic nouns and verbs about a venue's ability to serve the guest. They
  // describe the request rather than narrowing it.
  'accommodate', 'accommodates', 'accommodation', 'accommodations', 'booth',
  'booths', 'unique', 'year', 'years', 'standing', 'still', 'anymore',
  'service', 'services', 'counter', 'quick', 'table', 'cuisine', 'cuisines',
  'pavilion', 'pavilions', 'country', 'countries', 'picky', 'simple', 'easy',
  'basic', 'plain',
  'normal', 'regular', 'quiet', 'busy', 'accept', 'accepts', 'require',
  'requires', 'required', 'join', 'joining', 'reserve', 'book', 'booking',
  'thing', 'things', 'stuff',
]);

export type WordClass = 'function' | 'scaffolding' | 'content';

// Memoized for the same reason as singularize: a large number of occurrences
// over a small vocabulary.
const CLASS_CACHE = new Map<string, WordClass>();

export function classifyWord(word: string): WordClass {
  const cached = CLASS_CACHE.get(word);
  if (cached !== undefined) return cached;
  const result = computeWordClass(word);
  CLASS_CACHE.set(word, result);
  return result;
}

function computeWordClass(word: string): WordClass {
  const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return 'function';
  if (FUNCTION_WORDS.has(normalized)) return 'function';
  if (DINING_SCAFFOLDING.has(normalized)) return 'scaffolding';
  // Manner adverbs are productive, so they cannot be enumerated the way the
  // sets above can — but an -ly adverb never names a dish, a venue, or a
  // constraint. Recognising them morphologically keeps "clearly", "actually",
  // and "quickly" from reading as unexplained meaning. Food words that happen
  // to end in -ly ("philly") are claimed by the lexicon before this runs.
  if (normalized.length > 4 && normalized.endsWith('ly')) return 'function';
  return 'content';
}

export function isFunctionWord(word: string): boolean {
  return classifyWord(word) === 'function';
}

/** True when a word carries no residual meaning for the confidence gate. */
export function isExplainedWord(word: string): boolean {
  return classifyWord(word) !== 'content';
}

/**
 * Trim leading and trailing function words from a captured phrase.
 *
 * This is what keeps the unknown-food fallback honest. A capture such as
 * "burger while we are" or "dole whip to me" loses its grammatical tail
 * instead of being handed to the item matcher as if it were a dish name.
 */
export function stripFunctionWordEdges(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  let start = 0;
  let end = words.length;
  while (start < end && isFunctionWord(words[start])) start += 1;
  while (end > start && isFunctionWord(words[end - 1])) end -= 1;
  return words.slice(start, end).join(' ');
}
