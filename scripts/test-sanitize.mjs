import assert from 'node:assert/strict';
import { sanitizeWorkflow } from './lib.mjs';

const expression = "={{ $('1. Set your brand search').first().json.sheetUrl.split('/')[5] }}";
const setup = {
  name: '1. Set your brand search', type: 'n8n-nodes-base.set',
  parameters: { assignments: { assignments: [{ name: 'sheetUrl', type: 'string', value: '' }] } },
};
const sheets = {
  name: 'Save audit', type: 'n8n-nodes-base.googleSheets',
  credentials: { googleSheetsOAuth2Api: { id: 'private-credential' } },
  parameters: {
    documentId: { __rl: true, mode: 'id', value: expression, cachedResultUrl: 'https://docs.google.com/spreadsheets/d/private-id/edit' },
    sheetName: { __rl: true, mode: 'name', value: 'Search audit', cachedResultName: 'private-cache' },
  },
};
const original = { id: 'private-workflow', active: true, pinData: { private: [{}] }, nodes: [setup, sheets] };
const before = structuredClone(original);
const imported = sanitizeWorkflow(original);
assert.deepEqual(original, before, 'sanitizer must not mutate source');
assert.equal(imported.nodes[1].parameters.documentId.value, expression);
assert.equal(imported.nodes[1].parameters.sheetName.value, 'Search audit');
assert.equal(imported.active, false);
assert.deepEqual(imported.pinData, {});
assert.equal(imported.id, undefined);
assert.equal(imported.nodes[1].credentials, undefined);
assert.equal(imported.nodes[1].parameters.documentId.cachedResultUrl, undefined);
assert.equal(imported.nodes[1].parameters.sheetName.cachedResultName, undefined);
assert.deepEqual(sanitizeWorkflow(imported), imported, 'import/export must be idempotent');

const zero = '0000000000000000000000000000000000000000000';
for (const value of ['private-document-id', 'https://docs.google.com/spreadsheets/d/private-id/edit',
  "={{ 'private-document-id' }}", expression.replace('sheetUrl.split', "sheetUrl + 'private-id' + ''.split"),
  expression.replace('1. Set your brand search', 'Unknown setup')]) {
  const w = structuredClone(original);
  w.nodes[1].parameters.documentId.value = value;
  assert.equal(sanitizeWorkflow(w).nodes[1].parameters.documentId.value, zero, value);
}
for (const fieldValue of ['private-id', 'https://docs.google.com/spreadsheets/d/private-id/edit', '={{ $env.SECRET }}']) {
  const w = structuredClone(original);
  w.nodes[0].parameters.assignments.assignments[0].value = fieldValue;
  assert.equal(sanitizeWorkflow(w).nodes[1].parameters.documentId.value, zero, 'non-public setup must not allow an expression');
}
for (const tab of [{ mode: 'id', value: '12345' }, { mode: 'url', value: 'https://example.com' }, { mode: 'name', value: '={{ $json.privateTab }}' }]) {
  const w = structuredClone(original);
  w.nodes[1].parameters.sheetName = tab;
  assert.equal(sanitizeWorkflow(w).nodes[1].parameters.sheetName.value, '0');
}
const missingSetup = sanitizeWorkflow({ nodes: [sheets] });
assert.equal(missingSetup.nodes[0].parameters.documentId.value, zero);
console.log('sanitize: public setup expression/tab roundtrip and private destination regressions PASS');
