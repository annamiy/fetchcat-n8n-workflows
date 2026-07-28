import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeWorkflow } from './lib.mjs';

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/telegram-competitor-intelligence/workflow.json', import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(new URL('../workflows/telegram-competitor-intelligence/fixtures/input.json', import.meta.url)));
const code = (name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup = () => { throw new Error('Unexpected node lookup'); }, json = {}) =>
  new Function('$input', '$', '$json', source)(input, lookup, json);

for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
  assert.doesNotThrow(() => new Function('$input', '$', '$json', entry.parameters.jsCode), `${entry.name} must compile`);
}

assert.deepEqual(runCode(code('Require Saved Configuration'), { first: () => ({ json: {} }) }), []);
const saved = {
  configKey: 'default',
  channels: '@sample_competitor\nhttps://t.me/sample_market_news',
  marketContext: 'Synthetic workflow-automation competitor market used for QA only.',
  lookbackHours: 24,
  maxPostsPerChannel: 10
};
assert.equal(runCode(code('Require Saved Configuration'), { first: () => ({ json: saved }) }).length, 1);

const actorInput = runCode(code('Build Telegram Actor Input'), { first: () => ({ json: saved }) })[0].json;
assert.deepEqual(actorInput.actorInput.channels, ['@sample_competitor', 'https://t.me/sample_market_news']);
assert.equal(actorInput.actorInput.maxPosts, 20);
assert.equal(actorInput.actorInput.includeComments, false);
assert.equal(actorInput.actorInput.includeMedia, false);
assert.equal(actorInput.actorInput.includeCommentCount, true);
assert.throws(() => runCode(code('Build Telegram Actor Input'), {
  first: () => ({ json: { ...saved, channels: 'https://example.com/not-telegram' } })
}), /t\.me or telegram\.me/);

const normalized = runCode(code('Normalize Recent Posts'), {
  all: () => fixture.items.map((json) => ({ json }))
}, (name) => {
  assert.equal(name, 'Build Telegram Actor Input');
  return { first: () => ({ json: { config: { lookbackHours: 87600 } } }) };
});
assert.equal(normalized.length, 2);
assert.equal(normalized[0].json.itemKey, 'sample_competitor:2002');

const batch = runCode(code('Build Telegram Post Batch'), { all: () => normalized })[0].json;
assert.deepEqual(new Set(batch.itemKeys), new Set(['sample_competitor:2001', 'sample_competitor:2002']));

const aiResult = {
  hasMaterialSignals: true,
  executiveSummary: 'The competitor launched a teams tier and is promoting annual plans.',
  launches: [{ launch: 'Teams plan', summary: 'Shared workspaces and audit logs.', postKeys: ['sample_competitor:2001'] }],
  promotions: [{ promotion: 'Annual discount', summary: 'Thirty percent off through Friday.', postKeys: ['sample_competitor:2002'] }],
  positioningChanges: [],
  topicShifts: [],
  topPosts: [{ postKey: 'sample_competitor:2001', reason: 'Strong engagement around the launch.' }],
  recommendedActions: [{ action: 'Compare collaboration claims', rationale: 'The competitor is moving upmarket.', postKeys: ['sample_competitor:2001'] }]
};
const validated = runCode(code('Validate Telegram Intelligence'), {
  first: () => ({ json: aiResult })
}, (name) => {
  assert.equal(name, 'Build Telegram Post Batch');
  return { first: () => ({ json: batch }) };
})[0].json;
assert.equal(validated.insightCount, 4);
assert.deepEqual(validated.allKeys, batch.itemKeys);

assert.throws(() => runCode(code('Validate Telegram Intelligence'), {
  first: () => ({ json: { ...aiResult, launches: [{ launch: 'Invented', summary: 'Not supplied.', postKeys: ['unknown:999'] }] } })
}, () => ({ first: () => ({ json: batch }) })), /outside the input batch/);

const slack = runCode(code('Build Slack Intelligence Digest'), { first: () => ({ json: validated }) }, undefined, validated)[0].json.slackMessage;
assert.match(slack, /Telegram Competitor Intelligence Digest/);
assert.match(slack, /t\.me\/sample_competitor/);
assert.match(slack, /Teams plan/);

const sanitized = sanitizeWorkflow(workflow);
assert.equal(sanitized.active, false);
assert.equal(JSON.stringify(sanitized).includes('"credentials"'), false);
assert.equal(sanitized.nodes.find((entry) => entry.name === 'Send Slack Intelligence Digest').parameters.channelId.value, 'C0000000000');

assert.equal(workflow.connections['Send Slack Intelligence Digest'].main[0][0].node, 'Prepare Telegram Ledger');
assert.equal(workflow.connections['Prepare Telegram Ledger'].main[0][0].node, 'Commit Delivered Telegram Posts');

console.log('Telegram competitor intelligence passed configuration, normalization, citation, Slack, ledger, and sanitization tests.');
