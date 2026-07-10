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
  if (!serialized.includes(metadata.actorId)) fail(slug, `does not reference Actor ${metadata.actorId}`);
  if (metadata.integrations.includes('OpenAI') && !serialized.includes('gpt-5.4-mini')) {
    fail(slug, 'does not pin gpt-5.4-mini');
  }

  if (metadata.slug !== slug) fail(slug, 'metadata slug does not match directory');
  if (metadata.title !== workflow.name) fail(slug, 'metadata title does not match workflow name');
  if (!/^\d+\.\d+\.\d+$/.test(metadata.version ?? '')) fail(slug, 'metadata version is not semantic');
  if (metadata.minimumN8nVersion !== '2.26.8') fail(slug, 'minimum n8n version must be 2.26.8');
  if (!releaseStates.has(metadata.releaseState)) fail(slug, 'invalid release state');
  if (metadata.testLimits?.actorItems > 10) fail(slug, 'Actor test item limit exceeds 10');
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

