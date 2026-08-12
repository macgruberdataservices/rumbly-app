// Paraphrase-invariance report.
//
// The assertion suites prove that specific supported phrasings still work.
// This report measures something the assertion suites structurally cannot:
// whether the parser understands an *intent* or only the one phrasing that
// a rule was written for. Each intent is scored on how many of its equally
// natural phrasings reach the same disposition.
//
// This is a report, not a release gate. Read the aggregate; do not tune the
// parser against individual rows (see paraphrase-intents.json "discipline").

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessPlanCapability } from '../../../../src/askRumbly/capabilityRegistry.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';
import { runAskRumbly } from '../../../../src/askRumbly/appExecutor.ts';

interface Intent {
  id: string;
  expect: 'answer' | 'decline' | 'no-data';
  phrasings: string[];
}

const verbose = process.argv.includes('--verbose');
const failuresOnly = process.argv.includes('--failures');
const heldOut = process.argv.includes('--heldout');
const frozen = process.argv.includes('--frozen');
// Proximity questions legitimately ask the guest to turn on Near Me. Scoring
// them only with location off measures the permission prompt, not the parser,
// so the run can simulate an active location the way the app would have one.
const withLocation = process.argv.includes('--with-location');
const SIMULATED_ORIGIN = { latitude: 28.4177, longitude: -81.5812 };
const CORPUS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  frozen ? 'paraphrase-frozen.json' : heldOut ? 'paraphrase-heldout.json' : 'paraphrase-intents.json',
);
const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as { intents: Intent[] };

const data = await loadData();
const vocabulary = buildParserVocabulary(data);

interface Row {
  intent: Intent;
  query: string;
  outcome: string;
  ok: boolean;
  detail: string;
}

function evaluate(intent: Intent, query: string): Row {
  const plan = parseQueryPlan(query, vocabulary);
  const capability = assessPlanCapability(plan);
  let outcome: string = capability.disposition;
  try {
    // Go through the app entry point rather than the executor directly: the
    // subjective-options adaptation and the location/budget clarifications
    // live there, so calling executeQueryPlan would score a different system
    // than the one a guest uses.
    const execution = runAskRumbly(query, data, withLocation ? SIMULATED_ORIGIN : undefined).result;
    const proof = 'proof' in execution
      ? (execution as { proof?: { status: string } }).proof?.status
      : undefined;
    outcome = proof && proof !== 'proven' ? `${execution.kind}:${proof}` : execution.kind;
  } catch (error) {
    outcome = `throw:${(error as Error).message.slice(0, 40)}`;
  }
  // Three correct shapes, because "we checked and there is nothing" is a real
  // answer in a precision-first system, not a failure. A decline intent is
  // satisfied by any honest refusal; a no-data intent by an honest no-match or
  // a refusal; an answer intent only by a grounded, proof-passing answer.
  const declined = ['unsupported', 'handoff', 'clarify', 'clarification'].includes(outcome);
  const ok = intent.expect === 'decline'
    ? declined
    : intent.expect === 'no-data'
      ? declined || outcome.startsWith('no-match')
      : outcome === 'answer';
  const detail = [
    `${plan.claimType}/${plan.action}`,
    `conf=${plan.diagnostics.confidence}`,
    `food=[${plan.subject.foodTerms.join('|')}]`,
    plan.diagnostics.meaningfulUnconsumedText ? `left="${plan.diagnostics.meaningfulUnconsumedText}"` : '',
  ].filter(Boolean).join('  ');
  return { intent, query, outcome, ok, detail };
}

const rows = corpus.intents.flatMap((intent) => intent.phrasings.map((query) => evaluate(intent, query)));

if (verbose || failuresOnly) {
  let currentIntent = '';
  for (const row of rows) {
    if (failuresOnly && row.ok) continue;
    if (row.intent.id !== currentIntent) {
      currentIntent = row.intent.id;
      console.log(`\n### ${currentIntent} (expect ${row.intent.expect})`);
    }
    console.log([
      row.ok ? ' ok ' : 'MISS',
      row.query.padEnd(54).slice(0, 54),
      row.outcome.padEnd(14),
      row.detail,
    ].join(' '));
  }
  console.log('');
}

console.log('=== per-intent invariance ===');
for (const intent of corpus.intents) {
  const intentRows = rows.filter((row) => row.intent.id === intent.id);
  const passed = intentRows.filter((row) => row.ok).length;
  const shapes = new Set(intentRows.map((row) => row.outcome)).size;
  console.log([
    `${passed}/${intentRows.length}`.padEnd(7),
    `${shapes} outcome shape${shapes === 1 ? '' : 's'}`.padEnd(18),
    intent.expect.padEnd(9),
    intent.id,
  ].join(' '));
}

const total = rows.length;
const passing = rows.filter((row) => row.ok).length;
// Full invariance: every phrasing of the intent lands on the same outcome.
const invariant = corpus.intents.filter((intent) => {
  const intentRows = rows.filter((row) => row.intent.id === intent.id);
  return intentRows.every((row) => row.ok);
}).length;

console.log('\n=== totals ===');
console.table({
  phrasings: total,
  satisfied: passing,
  satisfiedPct: `${Math.round((passing / total) * 100)}%`,
  fullyInvariantIntents: `${invariant}/${corpus.intents.length}`,
  clarifications: rows.filter((row) => row.outcome === 'clarify' || row.outcome === 'clarification').length,
  noMatches: rows.filter((row) => row.outcome.startsWith('no-match')).length,
  proofFailures: rows.filter((row) => row.outcome.includes(':failed')).length,
  adapterErrors: rows.filter((row) => row.outcome === 'error' || row.outcome.startsWith('throw:')).length,
});
