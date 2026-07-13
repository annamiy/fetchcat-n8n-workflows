import fs from 'node:fs';
import path from 'node:path';
import { readJson, root, workflowPath, workflowSlugs } from './lib.mjs';

const errors = [];
const releaseStates = new Set([
  'development',
  'qa-passed',
  'github-public',
  'creator-draft',
  'creator-submitted',
  'creator-public'
]);
const secretPatterns = [
  [/apify_api_[A-Za-z0-9_-]{20,}/i, 'Apify token'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'OpenAI-style key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
  [/\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/, 'Telegram bot token'],
  [/\b(?:cookie|authorization)\s*[:=]\s*["'][^"']{12,}/i, 'auth or cookie value'],
  [/https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?/i, 'private URL'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, 'email address']
];

function fail(slug, message) {
  errors.push(`${slug}: ${message}`);
}

function scanText(slug, filename, text) {
  for (const [pattern, label] of secretPatterns) {
    if (pattern.test(text)) fail(slug, `${label} found in ${filename}`);
  }
}

for (const slug of workflowSlugs()) {
  const dir = workflowPath(slug, '');
  const required = [
    'workflow.json',
    'metadata.json',
    'README.md',
    'fixtures/input.json',
    'fixtures/expected-output.json'
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(dir, relative))) fail(slug, `missing ${relative}`);
  }
  if (errors.some((error) => error.startsWith(`${slug}: missing`))) continue;

  const workflowFile = path.join(dir, 'workflow.json');
  const metadataFile = path.join(dir, 'metadata.json');
  const workflowText = fs.readFileSync(workflowFile, 'utf8');
  const metadataText = fs.readFileSync(metadataFile, 'utf8');
  const readmeText = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const workflow = readJson(workflowFile);
  const metadata = readJson(metadataFile);

  scanText(slug, 'workflow.json', workflowText);
  scanText(slug, 'metadata.json', metadataText);
  if (readmeText.length < 500) fail(slug, 'README is too short for setup and behavior documentation');

  if (workflow.active !== false) fail(slug, 'workflow must be inactive');
  if (workflow.id || workflow.versionId) fail(slug, 'workflow contains an instance identifier');
  if (workflow.settings?.errorWorkflow) fail(slug, 'workflow contains an instance-local error workflow ID');
  if (workflow.credentials) fail(slug, 'workflow contains top-level credentials');
  if (Object.keys(workflow.pinData ?? {}).length > 0) fail(slug, 'workflow contains pinned data');
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length < 5) fail(slug, 'workflow graph is too small');
  if (!workflow.connections || typeof workflow.connections !== 'object') fail(slug, 'workflow connections are missing');

  const names = new Set();
  for (const node of workflow.nodes ?? []) {
    if (!node.name || names.has(node.name)) fail(slug, `duplicate or missing node name: ${node.name ?? '<empty>'}`);
    names.add(node.name);
    if (node.credentials) fail(slug, `${node.name} contains a credential reference`);
    if (!Array.isArray(node.position) || node.position.length !== 2) fail(slug, `${node.name} has no stable position`);
  }

  for (const [source, outputs] of Object.entries(workflow.connections ?? {})) {
    if (!names.has(source)) fail(slug, `connection source does not exist: ${source}`);
    for (const branches of Object.values(outputs)) {
      for (const branch of branches ?? []) {
        for (const connection of branch ?? []) {
          if (!names.has(connection.node)) fail(slug, `connection target does not exist: ${connection.node}`);
        }
      }
    }
  }

  const serialized = JSON.stringify(workflow);
  if (serialized.includes('"active":true')) fail(slug, 'contains an active nested object');
  if (serialized.includes('"credentials":')) fail(slug, 'contains a credential key');
  if (!['actor-template', 'support'].includes(metadata.workflowKind)) fail(slug, 'invalid workflow kind');
  if (metadata.workflowKind === 'actor-template') {
    const publicationFiles = [
      'creator-draft.md',
      'assets/workflow-overview.png',
      'assets/output-preview.png'
    ];
    for (const relative of publicationFiles) {
      if (!fs.existsSync(path.join(dir, relative))) fail(slug, `missing publication asset ${relative}`);
    }
    if (!metadata.actorId || !serialized.includes(metadata.actorId)) fail(slug, `does not reference Actor ${metadata.actorId}`);
    if (!metadata.actorSlug || !readmeText.includes(metadata.actorSlug)) fail(slug, `README does not reference Actor ${metadata.actorSlug}`);
    if (!serialized.includes('n8n-nodes-base.dataTable')) fail(slug, 'does not use a durable n8n Data Table ledger');
    const tableCreateNodes = workflow.nodes.filter((entry) =>
      entry.type === 'n8n-nodes-base.dataTable'
      && entry.parameters?.resource === 'table'
      && entry.parameters?.operation === 'create'
      && entry.parameters?.options?.createIfNotExists === true
    );
    if (tableCreateNodes.length < 1) fail(slug, 'does not create required Data Tables idempotently');
    if (serialized.includes('n8n-nodes-base.removeDuplicates')) fail(slug, 'uses pre-delivery Remove Duplicates state');
  } else {
    if (metadata.actorId !== null || metadata.actorSlug !== null) fail(slug, 'support workflow must not declare an Actor');
    if (!serialized.includes('n8n-nodes-base.errorTrigger')) fail(slug, 'support workflow must contain an Error Trigger');
  }
  if (metadata.integrations.includes('OpenAI') && !serialized.includes('gpt-5.4-mini')) {
    fail(slug, 'does not pin gpt-5.4-mini');
  }
  if (['linkedin-job-match-digest', 'reddit-buying-intent-alerts'].includes(slug)) {
    const openAiNodes = workflow.nodes.filter((entry) => entry.type === '@n8n/n8n-nodes-langchain.openAi');
    if (openAiNodes.length !== 1) fail(slug, 'must use exactly one OpenAI batch node');
    if (!serialized.includes('FetchCat Delivery Ledger')) fail(slug, 'does not reference the shared delivery ledger');
    if (slug === 'reddit-buying-intent-alerts') {
      if (!workflow.nodes.some((entry) => entry.type === 'n8n-nodes-base.formTrigger' && /Setup Form$/.test(entry.name))) {
        fail(slug, 'does not provide a nontechnical setup form');
      }
      if (!fs.existsSync(path.join(dir, 'assets/setup-form.png'))) fail(slug, 'missing publication asset assets/setup-form.png');
    }
  }
  if (slug === 'linkedin-job-match-digest') {
    const overviewStickies = workflow.nodes.filter((entry) =>
      entry.type === 'n8n-nodes-base.stickyNote' && entry.parameters?.color === 1
    );
    if (overviewStickies.length !== 1) fail(slug, 'must contain exactly one yellow overview sticky');
    if (overviewStickies.length === 1) {
      const content = overviewStickies[0].parameters.content ?? '';
      const words = content.trim().split(/\s+/).filter(Boolean).length;
      if (words < 100 || words > 300) fail(slug, 'yellow overview sticky must contain 100 to 300 words');
      if (!content.includes('### How it works') || !content.includes('### Setup')) {
        fail(slug, 'yellow overview sticky must contain How it works and Setup sections');
      }
    }
    const sectionStickies = workflow.nodes.filter((entry) =>
      entry.type === 'n8n-nodes-base.stickyNote' && entry.parameters?.color === 7
    );
    const workflowNodes = workflow.nodes.filter((entry) => entry.type !== 'n8n-nodes-base.stickyNote');
    const minimumGroups = Math.ceil(workflowNodes.length / 3);
    if (sectionStickies.length < minimumGroups) {
      fail(slug, `must contain at least ${minimumGroups} white logical-group stickies`);
    }
    if (sectionStickies.some((entry) => !(entry.parameters.content ?? '').startsWith('## '))) {
      fail(slug, 'every white section sticky must start with an H2 heading');
    }
    if (sectionStickies.some((entry) => (entry.parameters.content ?? '').trim().split(/\s+/).filter(Boolean).length >= 50)) {
      fail(slug, 'white section stickies must stay under 50 words');
    }
    for (const workflowNode of workflowNodes) {
      const [nodeX, nodeY] = workflowNode.position;
      const containingStickies = sectionStickies.filter((entry) => {
        const [stickyX, stickyY] = entry.position;
        const stickyWidth = Number(entry.parameters.width);
        const stickyHeight = Number(entry.parameters.height);
        return nodeX >= stickyX && nodeX + 96 <= stickyX + stickyWidth &&
          nodeY >= stickyY && nodeY + 96 <= stickyY + stickyHeight;
      });
      if (containingStickies.length !== 1) {
        fail(slug, `${workflowNode.name} must be enclosed by exactly one white logical-group sticky`);
      }
    }
    if (!workflow.nodes.some((entry) => entry.name === '2. Find Recent LinkedIn Jobs' && entry.type === 'n8n-nodes-base.httpRequest')) {
      fail(slug, 'must use the Cloud-compatible HTTP Request node to run Apify');
    }
    if (!workflow.nodes.some((entry) => entry.name === 'Get LinkedIn Job Results' && entry.type === 'n8n-nodes-base.httpRequest')) {
      fail(slug, 'must fetch the completed Apify dataset without the streaming endpoint');
    }
    if (workflow.nodes.some((entry) => entry.type === '@apify/n8n-nodes-apify.apify')) {
      fail(slug, 'must not require a community node');
    }
    if (!workflow.nodes.some((entry) => entry.name === '1. Set Your Job Search' && entry.type === 'n8n-nodes-base.set')) {
      fail(slug, 'must expose user configuration in 1. Set Your Job Search');
    }
    if (workflow.nodes.some((entry) => entry.type === 'n8n-nodes-base.formTrigger')) {
      fail(slug, 'must not contain a setup form');
    }
    if (serialized.includes('FetchCat LinkedIn Config')) fail(slug, 'must not require a LinkedIn configuration table');
    for (const destinationNode of ['4. Save Matches to Google Sheets', '5. Send Top Matches to Slack']) {
      if (!names.has(destinationNode)) fail(slug, `missing required destination node ${destinationNode}`);
    }
    for (const removedDestination of ['Send Gmail Digest', 'Send Telegram Digest', 'Create Notion Job Page']) {
      if (names.has(removedDestination)) fail(slug, `contains unsupported destination node ${removedDestination}`);
    }
    const creatorDraft = fs.readFileSync(path.join(dir, 'creator-draft.md'), 'utf8');
    if (!creatorDraft.startsWith('![LinkedIn Job Match Digest workflow]')) fail(slug, 'Creator description must start with the workflow image');
    if (!creatorDraft.includes('n8n Cloud or self-hosted n8n')) fail(slug, 'Creator description must document Cloud and self-hosted compatibility');
  }
  if (slug === 'youtube-research-brief-to-notion') {
    if (names.has('Manual QA Trigger') || names.has('Manual QA Input')) fail(slug, 'contains a QA-only public execution path');
    if (!fs.existsSync(path.join(dir, 'assets/form-preview.png'))) fail(slug, 'missing publication asset assets/form-preview.png');
  }

  if (metadata.slug !== slug) fail(slug, 'metadata slug does not match directory');
  if (metadata.title !== workflow.name) fail(slug, 'metadata title does not match workflow name');
  if (!/^\d+\.\d+\.\d+$/.test(metadata.version ?? '')) fail(slug, 'metadata version is not semantic');
  if (metadata.minimumN8nVersion !== '2.26.8') fail(slug, 'minimum n8n version must be 2.26.8');
  if (!releaseStates.has(metadata.releaseState)) fail(slug, 'invalid release state');
  if (metadata.testLimits?.actorItems > 10) fail(slug, 'Actor test item limit exceeds 10');
  if (metadata.workflowKind === 'actor-template' && metadata.testLimits?.actorItems < 1) fail(slug, 'Actor workflow must test at least one item');
  if (metadata.testLimits?.apifyBackedExecutions > 3) fail(slug, 'Apify-backed test execution limit exceeds 3');
  if (metadata.testLimits?.budgetUsd > 10) fail(slug, 'test budget exceeds $10');

  const inputFixture = readJson(path.join(dir, 'fixtures/input.json'));
  const expected = readJson(path.join(dir, 'fixtures/expected-output.json'));
  if (!inputFixture.description || !Array.isArray(inputFixture.items)) fail(slug, 'input fixture contract is invalid');
  if (!Array.isArray(expected.assertions) || expected.assertions.length < 2) fail(slug, 'expected assertions are missing');
}

for (const filename of ['README.md', 'LICENSE', 'package.json', '.github/workflows/validate.yml']) {
  if (!fs.existsSync(path.join(root, filename))) errors.push(`repository: missing ${filename}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Validated ${workflowSlugs().length} workflows with no public credential references.`);
