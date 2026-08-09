// End-to-end Ask Rumbly prototype, terminal-only: classify (pure TS,
// zero-cost rule-based classifier, see rule_classifier.ts) -> validate +
// execute against real live data (Node, reusing production search/hours/
// proximity logic) -> print an answer. No app build, no Simulator, no
// model call at all.
//
// This script is retained as a terminal-only legacy rule-baseline comparison.
// The app and the local web tester use the semantic parser/executor path; this
// command remains useful when diagnosing a rule-regression against that path.
//
// Usage: node --import ./register-loader.mjs ask.ts "where's the cheapest hamburger"
//        node --import ./register-loader.mjs ask.ts --refresh "..."   # bypass the 24h data cache

import { loadData } from './data.ts';
import { answerQuery } from './executor.ts';
import { classifyRuleBased } from './rule_classifier.ts';

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const query = args.filter((a) => a !== '--refresh').join(' ');

if (!query) {
  console.error('Usage: node ask.ts "<question>"');
  process.exit(1);
}

const data = await loadData({ refresh });
const classified = classifyRuleBased(query, data);
console.log(`classified: ${JSON.stringify(classified)}`);

const result = answerQuery(classified, data);
console.log(`[${result.kind}] ${result.text}`);
