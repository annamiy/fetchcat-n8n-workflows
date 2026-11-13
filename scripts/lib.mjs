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

  const recursiveKeys = new Set(['credentials', 'instanceId', 'webhookId', 'cachedResultName', 'cachedResultUrl']);

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
  // Preserve only a declarative read from a public setup field, not arbitrary
  // expressions (which can embed private IDs or execute unrelated code).
  function setupDocumentExpression(value) {
    if (typeof value !== 'string') return false;
    const match = value.match(/^=\{\{\s*\$\('([^']+)'\)\.first\(\)\.json\.([A-Za-z_$][\w$]*)(?:\.split\('\/'\)\[5\])?\s*\}\}$/);
    if (!match) return false;
    const setup = (copy.nodes ?? []).find((n) => n.name === match[1]);
    if (setup?.type !== 'n8n-nodes-base.set' || !setup.name.startsWith('1. Set your ')) return false;
    const field = setup.parameters?.assignments?.assignments?.find((a) => a.name === match[2]);
    return field?.type === 'string' && (field.value === '' || field.value === 'YOUR_SHEET_URL' || field.value === 'YOUR_SHEET_ID');
  }
  for (const node of copy.nodes ?? []) {
    const parameters = node.parameters ?? {};
    if (node.type === 'n8n-nodes-base.googleSheets') {
      if (parameters.documentId?.value && !setupDocumentExpression(parameters.documentId.value)) {
        parameters.documentId.value = '0000000000000000000000000000000000000000000';
      }
      // Name-mode tabs are public template schema, unlike instance-specific gids.
      const tab = parameters.sheetName;
      const publicTab = tab?.mode === 'name' && typeof tab.value === 'string'
        && /^[A-Za-z][A-Za-z0-9 _-]{0,99}$/.test(tab.value);
      if (tab?.value && !publicTab) tab.value = '0';
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
