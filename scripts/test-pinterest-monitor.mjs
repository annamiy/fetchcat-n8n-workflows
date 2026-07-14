import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeWorkflow } from './lib.mjs';

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/pinterest-search-opportunities-brief/workflow.json', import.meta.url)));
const code = (name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup) => new Function('$input', '$', source)(input, lookup);

for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
  assert.doesNotThrow(() => new Function('$input', '$', entry.parameters.jsCode), `${entry.name} must compile`);
}
assert.match(code('Validate and Format Pinterest Brief'), /if \(!\/\[A-Za-z0-9\]\//);

const notionTypes = workflow.nodes
  .find((entry) => entry.name === '5. Create Pinterest Brief in Notion')
  .parameters.blockUi.blockValues.map((block) => block.type);
assert.equal(notionTypes.length, 59);
assert.deepEqual(notionTypes.slice(10, 16), ['heading_2', 'bulleted_list_item', 'bulleted_list_item', 'bulleted_list_item', 'bulleted_list_item', 'heading_2']);
assert.deepEqual(notionTypes.slice(35, 46), ['heading_2', 'to_do', 'to_do', 'to_do', 'to_do', 'heading_2', 'bulleted_list_item', 'bulleted_list_item', 'bulleted_list_item', 'bulleted_list_item', 'bulleted_list_item']);

const liveLike = structuredClone(workflow);
liveLike.nodes.find((entry) => entry.type === 'n8n-nodes-base.googleSheets').parameters.documentId.value = 'private-sheet-id';
liveLike.nodes.find((entry) => entry.type === 'n8n-nodes-base.googleSheets').parameters.sheetName.value = 'private-tab-id';
liveLike.nodes.find((entry) => entry.type === 'n8n-nodes-base.notion').parameters.databaseId.value = 'private-database-id';
const sanitized = sanitizeWorkflow(liveLike);
assert.equal(sanitized.nodes.find((entry) => entry.type === 'n8n-nodes-base.googleSheets').parameters.documentId.value, '0000000000000000000000000000000000000000000');
assert.equal(sanitized.nodes.find((entry) => entry.type === 'n8n-nodes-base.googleSheets').parameters.sheetName.value, '0');
assert.equal(sanitized.nodes.find((entry) => entry.type === 'n8n-nodes-base.notion').parameters.databaseId.value, '00000000-0000-0000-0000-000000000000');

const queries = [
  'small balcony garden ideas',
  'balcony vegetable garden',
  'vertical garden for balcony',
  'apartment herb garden',
  'small patio garden ideas'
];
const config = {
  researchName: 'Small-space gardening Pinterest monitor',
  decisionToMake: 'Which Pinterest topics and creative formats should we publish or test next?',
  offer: 'A practical small-space gardening publication with useful guides and recommendations.',
  targetAudience: 'Apartment renters who want productive gardens in very limited outdoor space.',
  brandStyle: 'Useful, achievable, bright, and specific, with clear instructional visuals.',
  constraints: 'Recommend original educational content and do not claim demand without trend data.',
  queries,
  locale: 'en-US',
  country: 'US',
  maxResultsPerQuery: 10,
  minRelevantPins: 7
};

const actorRows = queries.flatMap((query, queryIndex) => Array.from({ length: 7 }, (_, index) => ({
  query,
  position: index + 1,
  pinId: `pin-${queryIndex}-${index}`,
  pinUrl: `https://www.pinterest.com/pin/${queryIndex + 1}${index + 1}000000000000/`,
  title: `${query} example ${index + 1}`,
  imageUrl: `https://images.example.test/${queryIndex}-${index}.jpg`
})));

const normalizeLookup = (name) => ({
  first: () => ({ json: { config } })
});
const normalized = runCode(
  code('Normalize Pinterest Pins'),
  { all: () => actorRows.map((json) => ({ json })) },
  normalizeLookup
);
assert.equal(normalized.length, 35);

const incompleteRows = actorRows.filter((row) => row.query !== queries[4] || row.position <= 6);
assert.throws(() => runCode(
  code('Normalize Pinterest Pins'),
  { all: () => incompleteRows.map((json) => ({ json })) },
  normalizeLookup
), /Incomplete Pinterest dataset/);

const currentRows = normalized.map((item) => item.json);
const compare = (historical) => runCode(
  code('Compare Search Snapshots'),
  { all: () => historical.map((json) => ({ json })) },
  (name) => ({
    all: () => name === 'Normalize Pinterest Pins' ? currentRows.map((json) => ({ json })) : [],
    first: () => ({ json: { config } })
  })
)[0].json;

const baseline = compare([]);
assert.equal(baseline.monitorStage, 'baseline');
assert.equal(baseline.visionPins.length, 10);
assert.deepEqual(baseline.visionPins.map((pin) => pin.evidenceId), ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']);
assert.equal(baseline.queryStats.length, 5);

const historicalRows = (date, offset) => currentRows.map((row) => ({
  ...row,
  snapshotDate: date,
  snapshotKey: `${date}|${row.query.toLowerCase()}|${row.pinId}`,
  position: Math.min(20, row.position + offset)
}));
const comparison = compare(historicalRows('2026-06-30', 1));
assert.equal(comparison.monitorStage, 'comparison');
assert.ok(comparison.compared.some((row) => row.status === 'rising'));
const momentum = compare([
  ...historicalRows('2026-06-23', 2),
  ...historicalRows('2026-06-30', 1)
]);
assert.equal(momentum.monitorStage, 'momentum');
assert.ok(momentum.compared.every((row) => row.weeksObserved === 3));

console.log('Pinterest monitor logic passed completeness, stage, movement, and image-balance tests.');
