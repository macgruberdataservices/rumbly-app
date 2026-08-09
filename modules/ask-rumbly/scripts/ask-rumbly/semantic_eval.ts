import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessPlanCapability, type CapabilityRule } from '../../../../src/askRumbly/capabilityRegistry.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import type { ClaimType } from '../../../../src/askRumbly/queryPlan.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';
import { compileQueryPlan } from './plan_compiler.ts';
import { executeQueryPlan } from './typed_plan_executor.ts';

type Expectation = [ClaimType, CapabilityRule['disposition']];
type Fixture = Record<'guest' | 'allergy', Expectation[]>;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(scriptDir, 'semantic-eval-expectations.json'), 'utf8')) as Fixture;
const sources = {
  guest: join(scriptDir, 'guest-eval-queries.txt'),
  allergy: join(scriptDir, 'allergy-eval-queries.txt'),
};
const data = await loadData();
const vocabulary = buildParserVocabulary(data);
const metrics = {
  total: 0,
  claimMatch: 0,
  dispositionMatch: 0,
  exactMatch: 0,
  unsafeExecute: 0,
  expectedExecuteButDeferred: 0,
  compiled: 0,
  typedExecutionEligible: 0,
  typedExecutionHandled: 0,
  typedAnswers: 0,
  typedNoMatch: 0,
  typedErrors: 0,
};

for (const group of ['guest', 'allergy'] as const) {
  const questions = readFileSync(sources[group], 'utf8')
    .split('\n')
    .map((line) => line.match(/^\d+\.\s+(.+)$/)?.[1])
    .filter((question): question is string => Boolean(question));
  if (questions.length !== fixture[group].length) {
    throw new Error(`${group}: ${questions.length} questions but ${fixture[group].length} expectations`);
  }
  questions.forEach((question, index) => {
    const [expectedClaim, expectedDisposition] = fixture[group][index];
    const plan = parseQueryPlan(question, vocabulary);
    const actualDisposition = assessPlanCapability(plan).disposition;
    const claimMatch = plan.claimType === expectedClaim;
    const dispositionMatch = actualDisposition === expectedDisposition;
    const compilation = compileQueryPlan(plan);
    const execution = actualDisposition === 'execute' ? executeQueryPlan(plan, data) : null;
    metrics.total += 1;
    if (claimMatch) metrics.claimMatch += 1;
    if (dispositionMatch) metrics.dispositionMatch += 1;
    if (claimMatch && dispositionMatch) metrics.exactMatch += 1;
    if (actualDisposition === 'execute' && expectedDisposition !== 'execute') metrics.unsafeExecute += 1;
    if (expectedDisposition === 'execute' && actualDisposition !== 'execute') metrics.expectedExecuteButDeferred += 1;
    if (compilation.kind === 'compiled') metrics.compiled += 1;
    if (execution) {
      metrics.typedExecutionEligible += 1;
      if (execution.kind === 'answer') metrics.typedAnswers += 1;
      if (execution.kind === 'no-match') metrics.typedNoMatch += 1;
      if (execution.kind === 'error') metrics.typedErrors += 1;
      else metrics.typedExecutionHandled += 1;
    }
    if (!claimMatch || !dispositionMatch) {
      console.log(JSON.stringify({
        id: `${group}-${String(index + 1).padStart(2, '0')}`,
        question,
        expected: { claim: expectedClaim, disposition: expectedDisposition },
        actual: { claim: plan.claimType, disposition: actualDisposition, confidence: plan.diagnostics.confidence },
      }));
    }
    if (execution?.kind === 'error') {
      console.log(JSON.stringify({
        id: `${group}-${String(index + 1).padStart(2, '0')}`,
        question,
        executionError: execution.text,
      }));
    }
  });
}

console.log('\n=== semantic evaluation ===');
console.table(metrics);
console.log(`claim accuracy: ${(metrics.claimMatch / metrics.total * 100).toFixed(1)}%`);
console.log(`disposition accuracy: ${(metrics.dispositionMatch / metrics.total * 100).toFixed(1)}%`);
console.log(`exact claim + disposition: ${(metrics.exactMatch / metrics.total * 100).toFixed(1)}%`);
