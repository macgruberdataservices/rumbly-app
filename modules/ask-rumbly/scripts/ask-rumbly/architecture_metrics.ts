import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

interface Footprint {
  files: number;
  lines: number;
  bytes: number;
  gzipBytes: number;
}

function measure(urls: URL[]): Footprint {
  const buffers = urls.map((url) => readFileSync(fileURLToPath(url)));
  const combined = Buffer.concat(buffers);
  return {
    files: buffers.length,
    lines: buffers.reduce((sum, buffer) => sum + buffer.toString('utf8').split('\n').length, 0),
    bytes: combined.byteLength,
    gzipBytes: gzipSync(combined).byteLength,
  };
}

const legacy = measure([new URL('./rule_classifier.ts', import.meta.url)]);
const semanticCore = measure([
  new URL('../../../../src/askRumbly/queryPlan.ts', import.meta.url),
  new URL('../../../../src/askRumbly/capabilityRegistry.ts', import.meta.url),
  new URL('../../../../src/askRumbly/semanticParser.ts', import.meta.url),
]);
const semanticWithDataAdapter = measure([
  new URL('../../../../src/askRumbly/queryPlan.ts', import.meta.url),
  new URL('../../../../src/askRumbly/capabilityRegistry.ts', import.meta.url),
  new URL('../../../../src/askRumbly/semanticParser.ts', import.meta.url),
  new URL('./parser_vocabulary.ts', import.meta.url),
  new URL('./plan_compiler.ts', import.meta.url),
]);
const semanticWithExecution = measure([
  new URL('../../../../src/askRumbly/queryPlan.ts', import.meta.url),
  new URL('../../../../src/askRumbly/capabilityRegistry.ts', import.meta.url),
  new URL('../../../../src/askRumbly/semanticParser.ts', import.meta.url),
  new URL('../../../../src/askRumbly/execution.ts', import.meta.url),
  new URL('./parser_vocabulary.ts', import.meta.url),
  new URL('./plan_compiler.ts', import.meta.url),
  new URL('./typed_plan_executor.ts', import.meta.url),
]);

console.table({
  legacy_classifier: legacy,
  semantic_core: semanticCore,
  semantic_with_adapter: semanticWithDataAdapter,
  semantic_with_execution: semanticWithExecution,
});
console.log('These are source/gzip footprint proxies, not final Metro or App Store binary measurements.');
