import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const workflowsRoot = path.join(root, 'workflows');

export function workflowSlugs() {
  if (!fs.existsSync(workflowsRoot)) return [];
  return fs.readdirSync(workflowsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function workflowPath(slug, filename = 'workflow.json') {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Invalid workflow slug: ${slug}`);
  }
  const resolved = path.join(workflowsRoot, slug, filename);
  if (!resolved.startsWith(`${workflowsRoot}${path.sep}`)) {
    throw new Error(`Workflow path escaped repository: ${slug}`);
  }
  return resolved;
}

export function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

export function sanitizeWorkflow(workflow) {
  const copy = structuredClone(workflow);
  const topLevelKeys = [
    'id',
    'versionId',
    'versionCounter',
    'versionMetadata',
    'shared',
    'tags',
    'triggerCount',
    'createdAt',
    'updatedAt',
    'activeVersionId',
    'activeVersion',
    'description',
    'isArchived',
    'meta',
    'nodeGroups',
    'sourceWorkflowId',
    'staticData'
  ];
  for (const key of topLevelKeys) delete copy[key];

  const recursiveKeys = new Set(['credentials', 'instanceId', 'webhookId']);

  function clean(value) {
    if (Array.isArray(value)) {
      value.forEach(clean);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (recursiveKeys.has(key)) {
        delete value[key];
      } else {
        clean(value[key]);
      }
    }
  }

  clean(copy);
  for (const node of copy.nodes ?? []) {
    const parameters = node.parameters ?? {};
    if (node.type === 'n8n-nodes-base.googleSheets') {
      if (parameters.documentId?.value) parameters.documentId.value = '0000000000000000000000000000000000000000000';
      if (parameters.sheetName?.value) parameters.sheetName.value = '0';
    }
    if (node.type === 'n8n-nodes-base.notion' && parameters.databaseId?.value) {
      parameters.databaseId.value = '00000000-0000-0000-0000-000000000000';
    }
    if (node.type === 'n8n-nodes-base.slack' && parameters.channelId?.value) {
      parameters.channelId.value = 'C0000000000';
    }
    if (node.type === 'n8n-nodes-base.telegram' && typeof parameters.chatId === 'string') {
      parameters.chatId = '-1000000000000';
    }
  }
  copy.active = false;
  copy.pinData = {};
  const settings = { ...(copy.settings ?? {}) };
  delete settings.errorWorkflow;
  copy.settings = {
    ...settings,
    executionOrder: 'v1',
    timezone: 'Europe/Lisbon'
  };
  return copy;
}

export function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}
