import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeWorkflow } from './lib.mjs';

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/pinterest-keyword-rank-tracker/workflow.json', import.meta.url)));
const code = (name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup) => new Function('$input', '$', source)(input, lookup);

for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
  assert.doesNotThrow(() => new Function('$input', '$', entry.parameters.jsCode), `${entry.name} must compile`);
}

assert.equal(workflow.name, 'Track Pinterest Keyword Rankings Weekly with Apify and Google Sheets');
assert.equal(workflow.active, false);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.googleSheets').length, 2);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.dataTable').length, 0);
assert.equal(workflow.nodes.filter((entry) => entry.type === '@n8n/n8n-nodes-langchain.openAi').length, 0);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.notion').length, 0);

const readSheet = workflow.nodes.find((entry) => entry.name === 'Read Earlier Rankings from Google Sheets');
assert.equal(readSheet.parameters.operation, 'read');
assert.equal(readSheet.alwaysOutputData, true);
assert.equal(readSheet.executeOnce, true);

const writeSheet = workflow.nodes.find((entry) => entry.name === '4. Save Rankings to Google Sheets');
assert.equal(writeSheet.parameters.operation, 'appendOrUpdate');
assert.deepEqual(writeSheet.parameters.columns.matchingColumns, ['Snapshot key']);
assert.deepEqual(writeSheet.parameters.options, {});

const fetchCatSearch = workflow.nodes.find((entry) => entry.name === '2. Search Pinterest with FetchCat');
assert.equal(fetchCatSearch?.type, 'n8n-nodes-base.httpRequest');
assert.match(fetchCatSearch.parameters.url, /run-sync-get-dataset-items$/);
assert.equal(fetchCatSearch.parameters.queryParameters.parameters.find((entry) => entry.name === 'timeout')?.value, '300');
assert.deepEqual(workflow.connections['2. Search Pinterest with FetchCat'].main[0].map((entry) => entry.node), ['Normalize Current Rankings']);

const config = {
  queries: ['small balcony garden ideas', 'balcony vegetable garden', 'apartment herb garden'],
  maxResultsPerQuery: 10
};
const actorRows = config.queries.flatMap((query, queryIndex) => Array.from({ length: 2 }, (_, index) => ({
  query,
  position: index + 1,
  pinId: `pin-${queryIndex}-${index}`,
  pinUrl: `https://www.pinterest.com/pin/${queryIndex + 1}${index + 1}000000000000/`,
  title: `${query} example ${index + 1}`,
  imageUrl: `https://images.example.test/${queryIndex}-${index}.jpg`
})));

const normalized = runCode(
  code('Normalize Current Rankings'),
  { all: () => actorRows.map((json) => ({ json })) },
  () => ({ first: () => ({ json: { config } }) })
);
assert.equal(normalized.length, 6);
assert.equal(new Set(normalized.map((item) => `${item.json.query}|${item.json.pinId}`)).size, 6);

assert.throws(() => runCode(
  code('Normalize Current Rankings'),
  { all: () => actorRows.filter((row) => row.query !== config.queries[2]).map((json) => ({ json })) },
  () => ({ first: () => ({ json: { config } }) })
), /returned no usable pins/);

const currentRows = normalized.map((item) => item.json);
const compare = (sheetRows) => runCode(
  code('3. Compare Weekly Rankings'),
  { all: () => sheetRows.map((json) => ({ json })) },
  () => ({ all: () => currentRows.map((json) => ({ json })) })
)[0].json;

const baseline = compare([{}]);
assert.equal(baseline.rows.length, 6);
assert.ok(baseline.rows.every((row) => row.status === 'First snapshot'));
assert.ok(baseline.rows.every((row) => row.previousPosition === null && row.movement === null));
assert.equal(new Set(baseline.rows.map((row) => row.snapshotKey)).size, 6);

const currentDate = currentRows[0].snapshotDate;
const previousDate = new Date(`${currentDate}T12:00:00Z`);
previousDate.setUTCDate(previousDate.getUTCDate() - 7);
const previousSerial = previousDate.getTime() / 86400000 + 25569;
const prior = [
  { 'Snapshot at': previousSerial, Query: config.queries[0], Position: 2, 'Pinterest pin ID': 'pin-0-0', Title: 'Prior pin 0' },
  { 'Snapshot at': previousSerial, Query: config.queries[0], Position: 3, 'Pinterest pin ID': 'missing-pin', Title: 'Previously visible pin' },
  { 'Snapshot at': previousSerial, Query: config.queries[1], Position: 1, 'Pinterest pin ID': 'pin-1-0', Title: 'Prior pin 1' },
  { 'Snapshot at': previousSerial, Query: config.queries[1], Position: 1, 'Pinterest pin ID': 'pin-1-1', Title: 'Prior pin 2' },
  { 'Snapshot at': previousSerial, Query: config.queries[2], Position: 2, 'Pinterest pin ID': 'pin-2-0', Title: 'Prior pin 3' },
  { 'Snapshot at': previousSerial, Query: config.queries[2], Position: 2, 'Pinterest pin ID': 'pin-2-1', Title: 'Prior pin 4' }
];
const comparison = compare(prior);
const statusById = new Map(comparison.rows.map((row) => [row.pinId, row.status]));
assert.equal(statusById.get('pin-0-0'), 'Moved up');
assert.equal(statusById.get('pin-0-1'), 'New in search results');
assert.equal(statusById.get('pin-1-0'), 'Unchanged');
assert.equal(statusById.get('pin-1-1'), 'Moved down');
assert.equal(statusById.get('pin-2-0'), 'Moved up');
assert.equal(statusById.get('pin-2-1'), 'Unchanged');
assert.equal(statusById.get('missing-pin'), 'No longer visible');
assert.equal(comparison.rows.find((row) => row.pinId === 'pin-0-0').movement, 1);
assert.equal(comparison.rows.find((row) => row.pinId === 'pin-1-1').movement, -1);
assert.equal(comparison.rows.find((row) => row.pinId === 'pin-0-1').previousPosition, null);
assert.equal(comparison.rows.find((row) => row.pinId === 'missing-pin').position, null);
assert.equal(comparison.rows.find((row) => row.pinId === 'missing-pin').movement, null);
assert.equal(comparison.counts.noLongerVisible, 1);

const liveLike = structuredClone(workflow);
for (const node of liveLike.nodes.filter((entry) => entry.type === 'n8n-nodes-base.googleSheets')) {
  node.parameters.documentId.value = 'private-sheet-id';
  node.parameters.sheetName.value = 'private-tab-id';
}
const sanitized = sanitizeWorkflow(liveLike);
for (const node of sanitized.nodes.filter((entry) => entry.type === 'n8n-nodes-base.googleSheets')) {
  assert.equal(node.parameters.documentId.value, '0000000000000000000000000000000000000000000');
  assert.equal(node.parameters.sheetName.value, '0');
}

console.log('Pinterest rank tracker passed baseline, movement, disappearance, idempotency, and sanitization tests.');
