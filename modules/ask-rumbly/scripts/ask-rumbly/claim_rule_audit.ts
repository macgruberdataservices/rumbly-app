// Claim-rule shadowing audit.
//
// The claim table resolves ties by order, so a new rule placed above an older
// one silently changes questions the older rule used to win. That is invisible
// in an ordered cascade — you only find out when a regression is reported.
//
// This report makes it visible. For every question in the checked-in corpora it
// collects *all* rules that match, then reports:
//
//   - dead rules, which never win anything and may be unreachable;
//   - shadowing pairs, where one rule consistently outranks another that would
//     have produced a different claim.
//
// Run it after adding or moving a rule. A new shadowing pair is not
// automatically wrong, but it should be a decision rather than a surprise.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLAIM_RULES,
  matchingClaimRules,
  type ClaimRule,
} from '../../../../src/askRumbly/claimRules.ts';
import { extractAllergens, linkQueryEntities } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

function readNumberedQueries(file: string): string[] {
  try {
    return readFileSync(join(HERE, file), 'utf8')
      .split('\n')
      .map((line) => line.trim().match(/^\d+\.\s+(.+?)\s*$/)?.[1])
      .filter((line): line is string => Boolean(line));
  } catch {
    return [];
  }
}

function readParaphraseQueries(file: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(join(HERE, file), 'utf8')) as {
      intents: Array<{ phrasings: string[] }>;
    };
    return parsed.intents.flatMap((intent) => intent.phrasings);
  } catch {
    return [];
  }
}

function readExpectationQueries(file: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(join(HERE, file), 'utf8')) as unknown;
    const rows = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>).flat();
    return rows
      .map((row) => (row as { question?: string })?.question)
      .filter((question): question is string => typeof question === 'string');
  } catch {
    return [];
  }
}

const questions = Array.from(new Set([
  ...readNumberedQueries('guest-eval-queries.txt'),
  ...readNumberedQueries('allergy-eval-queries.txt'),
  ...readParaphraseQueries('paraphrase-intents.json'),
  ...readParaphraseQueries('paraphrase-heldout.json'),
  ...readExpectationQueries('semantic-eval-expectations.json'),
  ...readExpectationQueries('heldout-disposition-expectations.json'),
]));

const data = await loadData();
const vocabulary = buildParserVocabulary(data);

// Reproduce exactly what the parser hands to claim detection: entity spans
// blanked so a restaurant's own name cannot trigger a pattern, plus the same
// allergen and entity inputs. Feeding neutral values instead would make every
// allergy-gated rule look unreachable.
function claimInput(question: string) {
  const entities = linkQueryEntities(question, vocabulary);
  const chars = Array.from(question);
  for (const entity of entities) {
    for (let index = entity.start; index < Math.min(chars.length, entity.end); index += 1) chars[index] = ' ';
  }
  const allergens = extractAllergens(question);
  return {
    text: chars.join('').replace(/\s+/g, ' '),
    allergenKeys: allergens.keys,
    hasAllergyContext: allergens.hasAllergyContext,
    hasRestaurantEntity: entities.some((entity) => entity.type === 'restaurant'),
    locationIsHoursSubject: entities.some((entity) => entity.type !== 'restaurant'
      && /\b(?:does|do|is|are|will|did)\s+(?:the\s+)?$/i.test(question.slice(Math.max(0, entity.start - 24), entity.start))),
  };
}

const wins = new Map<string, number>();
const shadowed = new Map<string, { winner: ClaimRule; loser: ClaimRule; count: number; example: string }>();

for (const question of questions) {
  const matches = matchingClaimRules(claimInput(question));
  if (matches.length === 0) continue;
  const [winner, ...rest] = matches;
  wins.set(winner.name, (wins.get(winner.name) ?? 0) + 1);
  for (const loser of rest) {
    if (loser.claim === winner.claim) continue;
    const key = `${winner.name} > ${loser.name}`;
    const existing = shadowed.get(key);
    if (existing) existing.count += 1;
    else shadowed.set(key, { winner, loser, count: 1, example: question });
  }
}

console.log(`questions analyzed: ${questions.length}`);
console.log(`rules in table: ${CLAIM_RULES.length}\n`);

const dead = CLAIM_RULES.filter((rule) => !wins.has(rule.name));
console.log('=== rules that never win on the current corpora ===');
if (dead.length === 0) console.log('(none)');
for (const rule of dead) console.log(`  ${rule.name.padEnd(30)} -> ${rule.claim}`);

console.log('\n=== shadowing pairs (winner outranks a rule with a different claim) ===');
const pairs = Array.from(shadowed.values()).sort((a, b) => b.count - a.count);
if (pairs.length === 0) console.log('(none)');
for (const pair of pairs) {
  console.log(`  ${String(pair.count).padStart(3)}x  ${pair.winner.name} (${pair.winner.claim})`);
  console.log(`        over ${pair.loser.name} (${pair.loser.claim})`);
  console.log(`        e.g. ${pair.example}`);
}
