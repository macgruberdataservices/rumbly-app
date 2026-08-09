import { assessPlanCapability } from '../../../../src/askRumbly/capabilityRegistry.ts';
import { parseQueryPlan } from '../../../../src/askRumbly/semanticParser.ts';
import { loadData } from './data.ts';
import { buildParserVocabulary } from './parser_vocabulary.ts';
import { classifyRuleBased } from './rule_classifier.ts';
import { answerQuery } from './executor.ts';
import { compileQueryPlan } from './plan_compiler.ts';

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: node --import ./register-loader.mjs semantic_shadow.ts "question"');
  process.exitCode = 1;
} else {
  const data = await loadData();
  const plan = parseQueryPlan(query, buildParserVocabulary(data));
  const legacy = classifyRuleBased(query, data);
  const compilation = compileQueryPlan(plan);
  const semanticAnswer = compilation.kind === 'compiled' ? answerQuery(compilation.query, data) : null;
  console.log(JSON.stringify({
    query,
    legacy: { classification: legacy, answer: answerQuery(legacy, data) },
    semantic: { plan, capability: assessPlanCapability(plan), compilation, answer: semanticAnswer },
  }, null, 2));
}
