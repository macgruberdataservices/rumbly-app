// Blind guest-scenario report.
//
// The paraphrase corpora test whether one intent survives being reworded. This
// one tests something different: whether Rumbly handles the *spread* of what
// guests actually ask, including the large fraction it should refuse. Questions
// are written from guest language and annotated only against the product
// contract, so a miss here is either a real capability gap or a contract the
// implementation does not yet honour.
//
// Reported by persona because the two ask very differently: a first-time guest
// asks broad, uncertain questions and a frequent guest names specific items and
// venues. A system that only serves one of them is not finished.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAskRumbly } from '../../../../src/askRumbly/appExecutor.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';

interface Scenario {
  persona: string;
  expect: 'answer' | 'decline' | 'either';
  q: string;
}

const verbose = process.argv.includes('--verbose');
const failuresOnly = process.argv.includes('--failures');
const withLocation = process.argv.includes('--with-location');
const secondSet = process.argv.includes('--set2');
const SIMULATED_ORIGIN = { latitude: 28.4177, longitude: -81.5812 };

const corpus = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), secondSet ? 'guest-scenarios-2.json' : 'guest-scenarios.json'), 'utf8'),
) as { scenarios: Scenario[] };

const data = await loadData();
const vocabulary = buildParserVocabulary(data);

const DECLINE_SHAPES = new Set(['unsupported', 'handoff', 'clarify', 'clarification']);

interface Row extends Scenario { outcome: string; ok: boolean; detail: string }

const rows: Row[] = corpus.scenarios.map((scenario) => {
  const plan = parseQueryPlan(scenario.q, vocabulary);
  let outcome: string;
  try {
    const execution = runAskRumbly(scenario.q, data, withLocation ? SIMULATED_ORIGIN : undefined).result;
    const proof = 'proof' in execution
      ? (execution as { proof?: { status: string } }).proof?.status
      : undefined;
    outcome = proof && proof !== 'proven' ? `${execution.kind}:${proof}` : execution.kind;
  } catch (error) {
    outcome = `throw:${(error as Error).message.slice(0, 40)}`;
  }
  const ok = scenario.expect === 'answer'
    ? outcome === 'answer'
    : scenario.expect === 'decline'
      ? DECLINE_SHAPES.has(outcome)
      : outcome === 'answer' || outcome.startsWith('no-match');
  return {
    ...scenario,
    outcome,
    ok,
    detail: [
      `${plan.claimType}/${plan.action}`,
      plan.diagnostics.claimRule ?? '',
      `food=[${plan.subject.foodTerms.join('|')}]`,
      plan.diagnostics.meaningfulUnconsumedText ? `left="${plan.diagnostics.meaningfulUnconsumedText}"` : '',
    ].filter(Boolean).join('  '),
  };
});

if (verbose || failuresOnly) {
  for (const persona of [...new Set(rows.map((row) => row.persona))]) {
    const shown = rows.filter((row) => row.persona === persona && (!failuresOnly || !row.ok));
    if (shown.length === 0) continue;
    console.log(`\n### ${persona}`);
    for (const row of shown) {
      console.log([
        row.ok ? ' ok ' : 'MISS',
        row.expect.padEnd(8),
        row.outcome.padEnd(14),
        row.q.padEnd(54).slice(0, 54),
        row.detail,
      ].join(' '));
    }
  }
  console.log('');
}

console.log('=== by persona ===');
for (const persona of [...new Set(rows.map((row) => row.persona))]) {
  const group = rows.filter((row) => row.persona === persona);
  const passed = group.filter((row) => row.ok).length;
  console.log(`  ${persona.padEnd(12)} ${passed}/${group.length}  (${Math.round((passed / group.length) * 100)}%)`);
}

console.log('\n=== by contract expectation ===');
for (const expect of ['answer', 'decline', 'either'] as const) {
  const group = rows.filter((row) => row.expect === expect);
  if (group.length === 0) continue;
  const passed = group.filter((row) => row.ok).length;
  console.log(`  ${expect.padEnd(8)} ${passed}/${group.length}  (${Math.round((passed / group.length) * 100)}%)`);
}

const answered = rows.filter((row) => row.outcome === 'answer').length;
console.log('\n=== totals ===');
console.table({
  scenarios: rows.length,
  satisfied: rows.filter((row) => row.ok).length,
  satisfiedPct: `${Math.round((rows.filter((row) => row.ok).length / rows.length) * 100)}%`,
  answered,
  clarifications: rows.filter((row) => row.outcome === 'clarify' || row.outcome === 'clarification').length,
  noMatches: rows.filter((row) => row.outcome.startsWith('no-match')).length,
  declines: rows.filter((row) => row.outcome === 'unsupported' || row.outcome === 'handoff').length,
  // Answering something the contract says to refuse is the only failure here
  // that reaches a guest as a wrong answer rather than as a missing one.
  wrongAnswers: rows.filter((row) => row.expect === 'decline' && row.outcome === 'answer').length,
  proofFailures: rows.filter((row) => row.outcome.includes(':failed')).length,
  adapterErrors: rows.filter((row) => row.outcome === 'error' || row.outcome.startsWith('throw:')).length,
});
