import { readFileSync } from 'node:fs';
import { assessPlanCapability } from '../../../../src/askRumbly/capabilityRegistry.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';
import { classifyRuleBased } from './rule_classifier.ts';
import { executeQueryPlan } from './typed_plan_executor.ts';

const args = process.argv.slice(2);
const executePlans = args.includes('--execute');
const summaryOnly = args.includes('--summary');
const resultsOnly = args.includes('--results-only');
const nonAnswersOnly = args.includes('--non-answers-only');
const paths = args.filter((arg) => !['--execute', '--summary', '--results-only', '--non-answers-only'].includes(arg));
if (paths.length === 0) {
  console.error('Usage: node --import ./register-loader.mjs semantic_batch.ts queries.txt [...]');
  process.exitCode = 1;
} else {
  const data = await loadData();
  const vocabulary = buildParserVocabulary(data);
  const totals = {
    queries: 0, execute: 0, handoff: 0, clarify: 0, unsupported: 0, lowConfidence: 0,
    executionAnswers: 0, executionNoMatch: 0, executionErrors: 0,
  };

  for (const path of paths) {
    const questions = readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim().match(/^\d+\.\s+(.+?)\s*$/)?.[1])
      .filter((line): line is string => Boolean(line));
    console.log(`\n=== ${path} (${questions.length}) ===`);
    for (const question of questions) {
      const legacy = classifyRuleBased(question, data);
      const plan = parseQueryPlan(question, vocabulary);
      const capability = assessPlanCapability(plan);
      totals.queries += 1;
      totals[capability.disposition] += 1;
      if (plan.diagnostics.confidence === 'low') totals.lowConfidence += 1;
      const execution = executePlans && capability.disposition === 'execute' ? executeQueryPlan(plan, data) : null;
      if (execution?.kind === 'answer') totals.executionAnswers += 1;
      else if (execution?.kind === 'no-match') totals.executionNoMatch += 1;
      else if (execution?.kind === 'error') totals.executionErrors += 1;
      if (!summaryOnly && (!resultsOnly || execution) && (!nonAnswersOnly || (execution && execution.kind !== 'answer'))) console.log(JSON.stringify({
        question,
        legacyType: legacy.queryType,
        action: plan.action,
        claim: plan.claimType,
        disposition: capability.disposition,
        confidence: plan.diagnostics.confidence,
        ...(execution ? {
          resultKind: execution.kind,
          resultText: execution.text,
          proof: 'proof' in execution ? execution.proof?.status : undefined,
        } : {}),
      }));
    }
  }
  console.log('\n=== totals ===');
  console.table(totals);
}
