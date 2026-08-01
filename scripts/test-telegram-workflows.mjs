import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../workflows/', import.meta.url);
const simple = JSON.parse(fs.readFileSync(new URL('telegram-channel-posts-to-google-sheets/workflow.json', root)));
const monitor = JSON.parse(fs.readFileSync(new URL('telegram-channel-intelligence-monitor/workflow.json', root)));
const code = (workflow, name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup = () => { throw new Error('Unexpected node lookup'); }, json = {}) =>
  new Function('$input', '$', '$json', source)(input, lookup, json);

for (const workflow of [simple, monitor]) {
  for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => new Function('$input', '$', '$json', entry.parameters.jsCode), `${entry.name} must compile`);
  }
  assert.equal(workflow.active, false);
  assert.ok(workflow.nodes.some((entry) => entry.type === 'n8n-nodes-base.scheduleTrigger'));
  assert.equal(workflow.nodes.some((entry) => entry.type === '@apify/n8n-nodes-apify.apify'), false);
}

const simpleConfig = runCode(code(simple, 'Validate Channels and Build Actor Input'), {
  first: () => ({ json: {
    channels: 'durov\n@telegram\ndurov',
    'Maximum Posts Per Channel': 10,
    'Maximum Posts Per Run': 20
  } })
})[0].json;
assert.deepEqual(simpleConfig.channels, ['durov', 'telegram']);
assert.equal(simpleConfig.actorInput.maxPostsPerChannel, 10);
assert.equal(simpleConfig.actorInput.maxPosts, 20);
assert.equal(Object.hasOwn(simpleConfig.actorInput, 'proxyConfiguration'), false);

const simpleFixture = JSON.parse(fs.readFileSync(new URL('telegram-channel-posts-to-google-sheets/fixtures/input.json', root)));
const simpleRows = runCode(code(simple, 'Prepare Human-Readable Post Rows'), {
  all: () => simpleFixture.items.map((json) => ({ json }))
}, (name) => {
  if (name === 'Validate Channels and Build Actor Input') return { first: () => ({ json: simpleConfig }) };
  throw new Error(`Unexpected node lookup: ${name}`);
});
assert.equal(simpleRows.length, 1);
assert.equal(simpleRows[0].json.itemKey, 'example_news:412');
assert.equal(simpleRows[0].json.channel, '@example_news');
assert.equal(simpleRows[0].json.mediaCount, 1);
assert.ok(Number.isFinite(simpleRows[0].json.postDate));
assert.match(simpleRows[0].json.postLink, /HYPERLINK/);
assert.equal(simple.nodes.find((entry) => entry.name === '3. Save Posts to Google Sheets').parameters.operation, 'appendOrUpdate');

const monitorConfig = runCode(code(monitor, 'Validate Channels and Build Actor Input'), {
  first: () => ({ json: {
    channels: 'durov\ntelegram',
    'Intelligence Goal': 'Track material product launches, partnerships, risks, and competitor moves.',
    'Minimum Relevance Score': 70,
    'Maximum Posts Per Channel': 10,
    'Maximum Posts Per Run': 20,
    'Maximum Alerts Per Digest': 5
  } })
})[0].json;
assert.equal(monitorConfig.minimumRelevanceScore, 70);
assert.equal(monitorConfig.maxAlerts, 5);
assert.equal(Object.hasOwn(monitorConfig.actorInput, 'proxyConfiguration'), false);

const sourcePosts = [simpleRows[0].json];
const batch = runCode(code(monitor, 'Build One Intelligence Batch'), {
  all: () => sourcePosts.map((json) => ({ json: { ...json, intelligenceGoal: monitorConfig.intelligenceGoal, minimumRelevanceScore: 70, maxAlerts: 5 } }))
})[0].json;
const nestedOpenAiOutput = {
  output: [{ content: [{ text: { results: [{
    itemKey: 'example_news:412', qualified: true, relevanceScore: 91,
    urgency: 'high', topic: 'Product launch', sentiment: 'positive',
    summary: 'A material automation product launched.',
    whyItMatters: 'It may change competitor positioning.'
  }] } }] }]
};
const validated = runCode(code(monitor, 'Validate Intelligence Results'), {
  first: () => ({ json: nestedOpenAiOutput })
}, (name) => {
  if (name === 'Build One Intelligence Batch') return { first: () => ({ json: batch }) };
  throw new Error(`Unexpected node lookup: ${name}`);
})[0].json;
assert.equal(validated.allKeys.length, 1);
assert.equal(validated.qualifiedPosts.length, 1);
assert.equal(validated.qualifiedPosts[0].relevanceScore, 91);

const digest = runCode(code(monitor, 'Build Telegram Intelligence Digest'), {
  first: () => ({ json: {} })
}, (name) => {
  if (name === 'Validate Intelligence Results') return { first: () => ({ json: validated }) };
  throw new Error(`Unexpected node lookup: ${name}`);
})[0].json.telegramMessage;
assert.match(digest, /Product launch/);
assert.match(digest, /HIGH \| 91\/100/);
assert.match(digest, /Why it matters:/);

const branches = monitor.connections['Has Relevant Intelligence'].main;
assert.equal(branches[0][0].node, 'Expand Intelligence Rows');
assert.equal(branches[1][0].node, 'Prepare Delivered Post Keys');
assert.equal(monitor.connections['5. Send Intelligence Digest to Telegram'].main[0][0].node, 'Prepare Delivered Post Keys');
assert.equal(monitor.connections['Prepare Delivered Post Keys'].main[0][0].node, 'Commit Delivered Posts');
assert.equal(monitor.nodes.find((entry) => entry.name === '3. Analyze Telegram Posts in One Batch').parameters.operation, 'response');

console.log('Telegram workflows passed input, normalization, strict AI parsing, delivery, and routing tests.');
