// Replay real thumbs-down questions against the current runtime.
//
// The corpora in this directory are written by us; this one is not. Every
// question here is something a guest actually typed and then told us the
// answer was wrong, exported from the ask_rumbly_negative_feedback table.
// That makes it the only set with no authorship bias, and the only one that
// reports what shipped rather than what we imagined shipping.
//
// It is a report, not a gate: the recorded outcome came from whatever build
// the tester was running, so a row that no longer reproduces has usually been
// fixed since. The column that matters is `now`, not `then`.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAskRumbly } from '../../../../src/askRumbly/appExecutor.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';

interface FeedbackRow {
  day: string;
  question: string;
  then: string;
  reason: string | null;
  runtime: string | null;
}

const verbose = process.argv.includes('--verbose');
const withLocation = !process.argv.includes('--no-location');
const SIMULATED_ORIGIN = { latitude: 28.4177, longitude: -81.5812 };

const corpus = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'feedback-replay.json'), 'utf8'),
) as { rows: FeedbackRow[] };

const data = await loadData();
const vocabulary = buildParserVocabulary(data);

for (const row of corpus.rows) {
  const plan = parseQueryPlan(row.question, vocabulary);
  let now: string;
  try {
    const execution = runAskRumbly(row.question, data, withLocation ? SIMULATED_ORIGIN : undefined).result;
    const proof = 'proof' in execution
      ? (execution as { proof?: { status: string } }).proof?.status
      : undefined;
    now = proof && proof !== 'proven' ? `${execution.kind}:${proof}` : execution.kind;
  } catch (error) {
    now = `throw:${(error as Error).message.slice(0, 60)}`;
  }
  const changed = now !== row.then ? '  <-- CHANGED' : '';
  console.log(`\n${row.question}`);
  console.log(`  then=${row.then}${row.reason ? ` (${row.reason})` : ''}   now=${now}${changed}`);
  if (verbose) {
    console.log(`  ${plan.claimType}/${plan.action}  rule=${plan.diagnostics.claimRule ?? '-'}`);
    console.log(`  food=[${plan.subject.foodTerms.join('|')}]  conf=${plan.diagnostics.confidence}`);
    if (plan.diagnostics.meaningfulUnconsumedText) {
      console.log(`  left="${plan.diagnostics.meaningfulUnconsumedText}"`);
    }
  }
}
