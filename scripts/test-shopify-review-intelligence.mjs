import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeWorkflow } from './lib.mjs';

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/shopify-app-review-intelligence/workflow.json', import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL('../workflows/shopify-app-review-intelligence/fixtures/input.json', import.meta.url)));
const code = (name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup = () => { throw new Error('Unexpected node lookup'); }, json = {}) =>
  new Function('$input', '$', '$json', source)(input, lookup, json);

for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
  assert.doesNotThrow(() => new Function('$input', '$', '$json', entry.parameters.jsCode), `${entry.name} must compile`);
}

assert.deepEqual(runCode(code('Require Saved Configuration'), { first: () => ({ json: {} }) }), []);
const saved = {
  configKey: 'default',
  appTargets: 'https://apps.shopify.com/sample-subscriptions\nsample-bundles',
  productContext: 'Synthetic subscription and bundle app market used for QA only.',
  ratings: '1,2,3',
  lookbackDays: 30,
  maxReviewsPerApp: 10
};
assert.equal(runCode(code('Require Saved Configuration'), { first: () => ({ json: saved }) }).length, 1);

const actorInput = runCode(code('Build Shopify Actor Input'), { first: () => ({ json: saved }) })[0].json;
assert.deepEqual(actorInput.actorInput.appUrls, ['https://apps.shopify.com/sample-subscriptions']);
assert.deepEqual(actorInput.actorInput.appHandles, ['sample-bundles']);
assert.deepEqual(actorInput.actorInput.ratings, ['1', '2', '3']);
assert.equal(actorInput.actorInput.maxReviewsPerApp, 10);
assert.throws(() => runCode(code('Build Shopify Actor Input'), {
  first: () => ({ json: { ...saved, appTargets: 'https://example.com/not-shopify' } })
}), /apps.shopify.com/);

const normalized = runCode(code('Normalize Recent Reviews'), {
  all: () => fixture.items.map((json) => ({ json }))
}, (name) => {
  assert.equal(name, 'Build Shopify Actor Input');
  return { first: () => ({ json: { config: { lookbackDays: 3650 } } }) };
});
assert.equal(normalized.length, 2);
assert.equal(normalized[0].json.itemKey, 'sample-subscriptions:review-1002');

const batch = runCode(code('Build Review Batch'), { all: () => normalized })[0].json;
assert.deepEqual(new Set(batch.reviewIds), new Set(['review-1001', 'review-1002']));

const aiResult = {
  hasActionableInsights: true,
  executiveSummary: 'Bulk changes need safer previews and recovery.',
  recurringComplaints: [{ theme: 'Bulk update reliability', summary: 'Updates can fail.', reviewIds: ['review-1001'] }],
  featureRequests: [{ feature: 'Audit log', reason: 'Merchants need traceability.', reviewIds: ['review-1002'] }],
  positiveSignals: [],
  urgentIssues: [{ issue: 'Recovery path', reason: 'Failed updates cannot be recovered.', reviewIds: ['review-1001'] }],
  recommendedActions: [{ action: 'Add previews', rationale: 'Reduce destructive mistakes.', reviewIds: ['review-1002'] }]
};
const validated = runCode(code('Validate Review Intelligence'), {
  first: () => ({ json: aiResult })
}, (name) => {
  assert.equal(name, 'Build Review Batch');
  return { first: () => ({ json: batch }) };
})[0].json;
assert.equal(validated.insightCount, 4);
assert.deepEqual(validated.allKeys, batch.itemKeys);

assert.throws(() => runCode(code('Validate Review Intelligence'), {
  first: () => ({ json: { ...aiResult, urgentIssues: [{ issue: 'Invented', reason: 'Not supplied.', reviewIds: ['unknown-review'] }] } })
}, () => ({ first: () => ({ json: batch }) })), /outside the input batch/);

const slack = runCode(code('Build Slack Review Digest'), { first: () => ({ json: validated }) }, undefined, validated)[0].json.slackMessage;
assert.match(slack, /Shopify App Review Intelligence/);
assert.match(slack, /apps\.shopify\.com/);
assert.match(slack, /review-1001|Sample Subscriptions/);

const sanitized = sanitizeWorkflow(workflow);
assert.equal(sanitized.active, false);
assert.equal(JSON.stringify(sanitized).includes('"credentials"'), false);
assert.equal(sanitized.nodes.find((entry) => entry.name === 'Send Slack Review Digest').parameters.channelId.value, 'C0000000000');

const slackTarget = workflow.connections['Send Slack Review Digest'].main[0][0].node;
assert.equal(slackTarget, 'Prepare Review Ledger');
assert.equal(workflow.connections['Prepare Review Ledger'].main[0][0].node, 'Commit Delivered Reviews');

console.log('Shopify review intelligence passed configuration, normalization, citation, Slack, ledger, and sanitization tests.');
