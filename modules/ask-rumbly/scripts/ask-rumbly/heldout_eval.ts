import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessPlanCapability, type CapabilityRule } from '../../../../src/askRumbly/capabilityRegistry.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';
import { executeQueryPlan } from './typed_plan_executor.ts';

type Disposition = CapabilityRule['disposition'];
interface FixtureGroup { sha256: string; expected: Disposition[] }

const [casualPath, structuredPath] = process.argv.slice(2);
if (!casualPath || !structuredPath) throw new Error('Usage: heldout_eval.ts casual.txt structured.txt');
const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'heldout-disposition-expectations.json'), 'utf8')) as Record<'casual' | 'structured', FixtureGroup>;
const data = await loadData();
const vocabulary = buildParserVocabulary(data);

function questions(text: string): string[] {
  return text.split('\n').map((line) => line.trim().match(/^\d+\.\s+(.+?)\s*$/)?.[1]).filter((line): line is string => Boolean(line));
}

for (const [group, path] of [['casual', casualPath], ['structured', structuredPath]] as const) {
  const raw = readFileSync(path);
  const hash = createHash('sha256').update(raw).digest('hex');
  if (hash !== fixture[group].sha256) throw new Error(`${group} corpus hash changed: ${hash}`);
  const items = questions(raw.toString('utf8'));
  if (items.length !== fixture[group].expected.length) throw new Error(`${group}: ${items.length} questions, ${fixture[group].expected.length} expectations`);
  const metrics = {
    total: items.length, dispositionCorrect: 0, expectedExecute: 0, executeCorrect: 0,
    unsafeExecute: 0, answerableDeferred: 0, actualExecute: 0, executionAnswers: 0,
    executionNoMatch: 0, executionErrors: 0,
  };
  const errors: Array<Record<string, unknown>> = [];
  const executionOutcomes: Array<Record<string, unknown>> = [];
  items.forEach((question, index) => {
    const expected = fixture[group].expected[index];
    const plan = parseQueryPlan(question, vocabulary);
    const actual = assessPlanCapability(plan).disposition;
    if (actual === expected) metrics.dispositionCorrect += 1;
    if (expected === 'execute') metrics.expectedExecute += 1;
    if (expected === 'execute' && actual === 'execute') metrics.executeCorrect += 1;
    let execution: ReturnType<typeof executeQueryPlan> | null = null;
    if (actual === 'execute') {
      metrics.actualExecute += 1;
      execution = executeQueryPlan(plan, data);
      if (execution.kind === 'answer') metrics.executionAnswers += 1;
      if (execution.kind === 'no-match') metrics.executionNoMatch += 1;
      if (execution.kind === 'error') metrics.executionErrors += 1;
      executionOutcomes.push({
        id: index + 1,
        question,
        kind: execution.kind,
        text: execution.text.slice(0, 260),
        trace: 'trace' in execution ? execution.trace : undefined,
      });
    }
    if (actual === 'execute' && expected !== 'execute') metrics.unsafeExecute += 1;
    if (expected === 'execute' && actual !== 'execute') metrics.answerableDeferred += 1;
    if (actual !== expected || execution?.kind === 'error') errors.push({
      id: index + 1, question, expected, actual, claim: plan.claimType,
      confidence: plan.diagnostics.confidence,
      unconsumed: plan.diagnostics.meaningfulUnconsumedText,
      food: plan.subject.foodTerms,
      restaurants: plan.subject.restaurantIds,
      location: plan.constraints.location?.label,
      features: plan.constraints.requiredFeatures,
      ...(execution ? { execution: execution.kind, executionText: execution.text.slice(0, 180) } : {}),
    });
  });
  console.log(`\n=== ${group} held-out evaluation ===`);
  console.table(metrics);
  console.log(`disposition accuracy: ${(metrics.dispositionCorrect / metrics.total * 100).toFixed(1)}%`);
  console.log(`answerable-query recall: ${(metrics.executeCorrect / metrics.expectedExecute * 100).toFixed(1)}%`);
  console.log('\nmisrouted questions:');
  errors.forEach((error) => console.log(JSON.stringify(error)));
  console.log('\nexecution outcomes:');
  executionOutcomes.forEach((outcome) => console.log(JSON.stringify(outcome)));
}
