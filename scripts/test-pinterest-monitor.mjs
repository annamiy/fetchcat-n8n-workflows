import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeWorkflow } from './lib.mjs';

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/pinterest-content-opportunity-research/workflow.json', import.meta.url)));
const code = (name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup) => new Function('$input', '$', source)(input, lookup);

for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
  assert.doesNotThrow(() => new Function('$input', '$', entry.parameters.jsCode), `${entry.name} must compile`);
}

assert.equal(workflow.name, 'Analyze Pinterest Content Opportunities with Apify, OpenAI and Google Sheets');
assert.equal(workflow.active, false);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.googleSheets').length, 3);
assert.equal(workflow.nodes.filter((entry) => entry.type === '@n8n/n8n-nodes-langchain.openAi').length, 1);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.scheduleTrigger').length, 0);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.dataTable').length, 0);
assert.equal(workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.notion').length, 0);

const sheetNodes = workflow.nodes.filter((entry) => entry.type === 'n8n-nodes-base.googleSheets');
assert.deepEqual(sheetNodes.map((entry) => entry.parameters.sheetName.cachedResultName), ['Pins', 'Sources', 'Research Brief']);
for (const sheet of sheetNodes) {
  assert.equal(sheet.parameters.operation, 'appendOrUpdate');
  assert.deepEqual(sheet.parameters.columns.matchingColumns, ['Research key']);
}

const fetchCatSearch = workflow.nodes.find((entry) => entry.name === '2. Collect Pinterest Results with FetchCat');
assert.equal(fetchCatSearch?.type, 'n8n-nodes-base.httpRequest');
assert.match(fetchCatSearch.parameters.url, /run-sync-get-dataset-items$/);
assert.equal(fetchCatSearch.parameters.queryParameters.parameters.find((entry) => entry.name === 'timeout')?.value, '300');

const config = { niche: 'female cycling', queries: ['female cycling', 'women road cycling'], maxResultsPerQuery: 100 };
const actorRows = Array.from({ length: 12 }, (_, index) => ({
  query: config.queries[index % 2],
  position: Math.floor(index / 2) + 1,
  pinId: `pin-${index + 1}`,
  pinUrl: `https://www.pinterest.com/pin/${100000000000000000 + index}/`,
  title: index < 6 ? `Women cycling outfit guide ${index + 1}` : `Beginner road cycling tips ${index + 1}`,
  description: index < 6 ? 'Practical jersey, bib shorts, and cycling outfit advice.' : 'Training, bike fit, safety, and beginner equipment advice.',
  imageUrl: `https://images.example.test/pin-${index + 1}.jpg`,
  creatorName: index % 3 === 0 ? 'Cycling Studio' : `Creator ${index % 4}`,
  boardName: index < 6 ? 'Cycling outfits' : 'Road cycling guides',
  domain: index % 2 === 0 ? 'cycling.example' : 'fitness.example',
  outboundUrl: `https://${index % 2 === 0 ? 'cycling.example' : 'fitness.example'}/article-${index + 1}`,
  isVideo: index % 4 === 0,
  saveCount: index % 3 === 0 ? 20 + index : null,
  repinCount: null
}));

const lookupConfig = (name) => {
  assert.equal(name, 'Build FetchCat Research Input');
  return { first: () => ({ json: { config } }) };
};
const normalized = runCode(
  code('Normalize and Deduplicate Pins'),
  { all: () => actorRows.map((json) => ({ json })) },
  lookupConfig
);
assert.equal(normalized.length, 12);
assert.equal(new Set(normalized.map((item) => item.json.pinId)).size, 12);
assert.equal(normalized[0].json.description.length > 0, true);

assert.throws(() => runCode(
  code('Normalize and Deduplicate Pins'),
  { all: () => actorRows.slice(0, 8).map((json) => ({ json })) },
  lookupConfig
), /fewer than ten usable pins/);

const evidence = runCode(
  code('Build Research Evidence'),
  { all: () => normalized },
  lookupConfig
)[0].json;
assert.equal(evidence.stats.totalPins, 12);
assert.equal(evidence.stats.niche, 'female cycling');
assert.equal(evidence.sourceRows.length, 12);
assert.ok(evidence.publicSources.length >= 2);
assert.ok(evidence.publicSources.some((row) => row.type === 'Creator' && row.name === 'Cycling Studio'));
assert.equal(new Set(evidence.sourceRows.map((row) => row.researchKey)).size, 12);
assert.ok(JSON.stringify(evidence.researchPacket).length < 120000);

const analysis = {
  executiveSummary: 'The supplied results emphasize apparel and beginner road-cycling guidance.',
  themes: Array.from({ length: 4 }, (_, index) => ({
    name: index % 2 === 0 ? 'Cycling outfits' : 'Beginner guidance',
    insight: 'This theme appears repeatedly in the supplied titles and descriptions.',
    matchTerms: index % 2 === 0 ? ['cycling outfit', 'bib shorts'] : ['beginner road', 'bike fit'],
    evidencePinIds: index % 2 === 0 ? ['pin-1', 'pin-3'] : ['pin-7', 'pin-9']
  })),
  underrepresentedAngles: Array.from({ length: 3 }, (_, index) => ({
    angle: `Underrepresented angle ${index + 1}`,
    sampleObservation: 'The supplied sample addresses the topic only broadly.',
    contentOpportunity: 'Publish a narrower practical guide.',
    evidencePinIds: ['pin-2', 'pin-8']
  })),
  contentTests: Array.from({ length: 5 }, (_, index) => ({
    proposedPinTitle: `Female cycling content test ${index + 1}`,
    visualConcept: 'A clear side-by-side equipment comparison with readable labels.',
    format: index % 2 === 0 ? 'Checklist pin' : 'Video guide',
    audienceProblem: 'Help beginners make a specific cycling decision.',
    differentiatingAngle: 'Use practical examples and clear comparisons.',
    destinationContent: 'A detailed beginner guide with a decision checklist.',
    observedPhrases: ['cycling outfit', 'bib shorts'],
    suggestedSearchExpansions: ['female cycling beginner checklist', 'women cycling comfort guide'],
    evidencePinIds: [`pin-${index + 1}`]
  }))
};

const filterAnalysis = (value) => runCode(
  code('Keep Only Supplied Evidence Citations'),
  { first: () => ({ json: { output_text: JSON.stringify(value) } }) },
  (name) => {
    assert.equal(name, 'Build Research Evidence');
    return { first: () => ({ json: evidence }) };
  }
)[0].json;

const filteredAnalysis = filterAnalysis(analysis);
assert.equal(filteredAnalysis.discardedInvalidCitations, 0);

const report = runCode(
  code('Validate Evidence and Build Report'),
  { first: () => ({ json: filteredAnalysis }) },
  (name) => {
    assert.equal(name, 'Build Research Evidence');
    return { first: () => ({ json: evidence }) };
  }
)[0].json;
assert.equal(report.briefRows.length, 13);
assert.equal(report.briefRows.filter((row) => row.section === 'Leading theme').length, 4);
assert.equal(report.briefRows.filter((row) => row.section === 'Underrepresented angle').length, 3);
assert.equal(report.briefRows.filter((row) => row.section === 'Content test').length, 5);
assert.ok(report.briefRows.some((row) => row.evidence.includes('https://www.pinterest.com/pin/')));
assert.ok(report.briefRows.some((row) => row.finding.includes('Unvalidated search-expansion ideas:')));
assert.ok(report.briefRows.some((row) => row.finding.includes('Destination content:')));

const mixedCitationAnalysis = structuredClone(analysis);
mixedCitationAnalysis.contentTests[0].evidencePinIds = ['pin-1', 'invented-pin'];
const filteredMixedAnalysis = filterAnalysis(mixedCitationAnalysis);
assert.equal(filteredMixedAnalysis.discardedInvalidCitations, 1);
assert.deepEqual(filteredMixedAnalysis.contentTests[0].evidencePinIds, ['pin-1']);

const invalidAnalysis = structuredClone(analysis);
invalidAnalysis.contentTests[0].evidencePinIds = ['invented-pin'];
assert.throws(() => filterAnalysis(invalidAnalysis), /cites no supplied pins/);

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

console.log('Pinterest content research passed source, aggregation, evidence, output, idempotency, and sanitization tests.');
