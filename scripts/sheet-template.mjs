// Create (or reuse) the public Google Sheets template for one workflow.
//
// Reads workflows/<slug>/assets/sheet-template.json, generates a private helper
// workflow, runs it once in the private n8n instance with the existing Google
// Sheets OAuth credential, and prints the sheet and "make a copy" links.
//
// The spreadsheet lives in the Drive folder named by the spec (default
// "FetchCat n8n templates"), is shared "anyone with the link can view", and is
// reused on later runs (same title), so retries never create duplicates. Only header rows and synthetic example rows go into a template.
//
// Usage: node scripts/sheet-template.mjs <slug> [--dry-run]
// Env:   N8N_SHEETS_CREDENTIAL_ID (n8n credential of type googleSheetsOAuth2Api)
//        N8N_CONTAINER (default fetchcat-n8n), N8N_CLI_RUNNER_PORT (default 5680)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, root, workflowPath } from './lib.mjs';

export const DEFAULT_FOLDER = 'FetchCat n8n templates';
// One private helper workflow per slug, so two builders never run each other's spec.
export function toolWorkflowId(slug) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `fcSheetTpl${h.toString(36).padStart(7, '0')}`.slice(0, 16);
}
const MAX_ROWS = 5;

export function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['spec must be an object'];
  if (typeof spec.title !== 'string' || spec.title.length < 5 || spec.title.length > 120) errors.push('title must be 5-120 characters');
  if (!Array.isArray(spec.tabs) || spec.tabs.length < 1 || spec.tabs.length > 5) errors.push('tabs must contain 1-5 tabs');
  for (const [i, tab] of (spec.tabs ?? []).entries()) {
    if (typeof tab.name !== 'string' || !tab.name.trim()) errors.push(`tabs[${i}].name is required`);
    if (!Array.isArray(tab.headers) || tab.headers.length < 1 || tab.headers.some((h) => typeof h !== 'string' || !h.trim())) errors.push(`tabs[${i}].headers must be non-empty strings`);
    const rows = tab.exampleRows ?? [];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) errors.push(`tabs[${i}].exampleRows must have at most ${MAX_ROWS} rows`);
    for (const row of rows) if (!Array.isArray(row) || row.length > (tab.headers?.length ?? 0)) errors.push(`tabs[${i}] example row is longer than the header`);
  }
  if (spec.folderName !== undefined && (typeof spec.folderName !== 'string' || !spec.folderName.trim())) errors.push('folderName must be a non-empty string');
  const text = JSON.stringify(spec);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) errors.push('spec must not contain email addresses');
  return errors;
}

const cell = (v, bold = false) => ({
  userEnteredValue: typeof v === 'number' ? { numberValue: v } : typeof v === 'boolean' ? { boolValue: v } : { stringValue: String(v ?? '') },
  ...(bold ? { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 } } } : {}),
});

export function spreadsheetBody(spec) {
  return {
    properties: { title: spec.title },
    sheets: spec.tabs.map((tab, index) => ({
      properties: { sheetId: index, title: tab.name, gridProperties: { frozenRowCount: 1 } },
      data: [{ startRow: 0, startColumn: 0, rowData: [tab.headers.map((h) => cell(h, true)), ...(tab.exampleRows ?? []).map((r) => r.map((v) => cell(v)))].map((values) => ({ values })) }],
    })),
  };
}

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function buildToolWorkflow(spec, credentialId, slug) {
  const folderName = spec.folderName ?? DEFAULT_FOLDER;
  const cred = { googleSheetsOAuth2Api: { id: credentialId, name: 'Google Sheets' } };
  const http = (id, name, x, y, parameters) => ({
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y],
    parameters: { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api', options: {}, ...parameters },
    credentials: cred,
  });
  const json = (expr) => ({ sendBody: true, specifyBody: 'json', jsonBody: expr });
  const folderQuery = `name='${q(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const nodes = [
    { id: 't1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    { id: 't2', name: 'Spec', type: 'n8n-nodes-base.code', typeVersion: 2, position: [200, 0], parameters: { jsCode: `return [{ json: ${JSON.stringify({ title: spec.title, folderName, body: spreadsheetBody(spec) })} }];` } },
    http('t3', 'Find Folder', 400, 0, { url: `=https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&spaces=drive` }),
    { id: 't4', name: 'Folder Exists?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [600, 0], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [{ id: 'c1', leftValue: '={{ ($json.files || []).length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }] }, options: {} } },
    http('t5', 'Create Folder', 800, 120, { method: 'POST', url: 'https://www.googleapis.com/drive/v3/files?fields=id', ...json(`={{ JSON.stringify({ name: $('Spec').first().json.folderName, mimeType: 'application/vnd.google-apps.folder' }) }}`) }),
    { id: 't6', name: 'Folder Id', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [1000, 0], parameters: { assignments: { assignments: [{ id: 'f1', name: 'folderId', value: '={{ $json.id || ($json.files && $json.files[0] && $json.files[0].id) }}', type: 'string' }] }, options: {} } },
    // Search by title anywhere the helper can see (only files it created), so a
    // sheet left outside the folder by a failed move is reused, not duplicated.
    http('t7', 'Find Sheet', 1200, 0, { url: `={{ 'https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=' + encodeURIComponent("name='" + $('Spec').first().json.title.replace(/'/g, "\\\\'") + "' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false") }}` }),
    { id: 't8', name: 'Sheet Exists?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [1400, 0], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [{ id: 'c2', leftValue: '={{ ($json.files || []).length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }] }, options: {} } },
    http('t9', 'Create Spreadsheet', 1600, 120, { method: 'POST', url: 'https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId', ...json(`={{ JSON.stringify($('Spec').first().json.body) }}`) }),
    { id: 't11', name: 'Sheet Id', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [2000, 0], parameters: { assignments: { assignments: [{ id: 'g1', name: 'spreadsheetId', value: '={{ $json.spreadsheetId || ($json.files && $json.files[0] && $json.files[0].id) }}', type: 'string' }, { id: 'g2', name: 'created', value: "={{ !$json.files }}", type: 'boolean' }] }, options: {} } },
    http('t10', 'Get Parents', 2200, 0, { url: `={{ 'https://www.googleapis.com/drive/v3/files/' + $json.spreadsheetId + '?fields=id,parents' }}` }),
    // Put the sheet in the folder using its real parents (no 'root' alias); a
    // no-op when it is already there, so reruns repair a failed earlier move.
    http('t12', 'Ensure In Folder', 2400, 0, { method: 'PATCH', url: `={{ (() => { const folder = $('Folder Id').first().json.folderId; const others = ($json.parents || []).filter((p) => p !== folder); return 'https://www.googleapis.com/drive/v3/files/' + $json.id + '?fields=id,parents&addParents=' + folder + (others.length ? '&removeParents=' + others.join(',') : ''); })() }}`, ...json('={{ "{}" }}') }),
    http('t13', 'Share Anyone Viewer', 2600, 0, { method: 'POST', url: `={{ 'https://www.googleapis.com/drive/v3/files/' + $json.id + '/permissions?fields=id,role,type' }}`, ...json(`={{ JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }) }}`) }),
    { id: 't14', name: 'Result', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2800, 0], parameters: { jsCode: "const s = $('Sheet Id').first().json;\nconst p = $input.first().json;\nconst placed = $('Ensure In Folder').first().json;\nconst folderId = $('Folder Id').first().json.folderId;\nconst id = s.spreadsheetId;\nreturn [{ json: { fetchcatSheetTemplate: true, spreadsheetId: id, created: s.created, inFolder: (placed.parents || []).includes(folderId), shared: p.type === 'anyone' && p.role === 'reader', folderId, url: `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`, copyUrl: `https://docs.google.com/spreadsheets/d/${id}/copy` } }];" } },
  ];
  const c = (from, to, out = 0) => ({ from, to, out });
  const links = [c('Start', 'Spec'), c('Spec', 'Find Folder'), c('Find Folder', 'Folder Exists?'), c('Folder Exists?', 'Folder Id', 0), c('Folder Exists?', 'Create Folder', 1), c('Create Folder', 'Folder Id'),
    c('Folder Id', 'Find Sheet'), c('Find Sheet', 'Sheet Exists?'), c('Sheet Exists?', 'Sheet Id', 0), c('Sheet Exists?', 'Create Spreadsheet', 1), c('Create Spreadsheet', 'Sheet Id'),
    c('Sheet Id', 'Get Parents'), c('Get Parents', 'Ensure In Folder'), c('Ensure In Folder', 'Share Anyone Viewer'), c('Share Anyone Viewer', 'Result')];
  const connections = {};
  for (const { from, to, out } of links) {
    connections[from] ??= { main: [] };
    while (connections[from].main.length <= out) connections[from].main.push([]);
    connections[from].main[out].push({ node: to, type: 'main', index: 0 });
  }
  return { id: toolWorkflowId(slug), name: `FetchCat tool - sheet template ${slug}`, active: false, settings: { executionOrder: 'v1' }, nodes, connections };
}

// Last {"fetchcatSheetTemplate": true, ...} object in the CLI raw output.
export function parseResult(output) {
  const matches = [...output.matchAll(/\{[^{}]*"fetchcatSheetTemplate":\s*true[^{}]*\}/g)];
  if (!matches.length) return null;
  return JSON.parse(matches.at(-1)[0]);
}

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

export function main(argv = process.argv.slice(2)) {
  const slug = argv.find((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  if (!slug) throw new Error('Usage: node scripts/sheet-template.mjs <slug> [--dry-run]');
  const specFile = workflowPath(slug, 'assets/sheet-template.json');
  const spec = readJson(specFile);
  const errors = validateSpec(spec);
  if (errors.length) throw new Error(`${specFile}: ${errors.join('; ')}`);
  const credentialId = process.env.N8N_SHEETS_CREDENTIAL_ID;
  if (!credentialId && !dryRun) throw new Error('N8N_SHEETS_CREDENTIAL_ID is required (n8n googleSheetsOAuth2Api credential id)');
  const tool = buildToolWorkflow(spec, credentialId ?? 'DRY_RUN', slug);
  const local = path.join(root, 'dist', 'tools', `sheet-template-${slug}.json`);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, `${JSON.stringify(tool, null, 2)}\n`);
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, toolWorkflow: path.relative(root, local), title: spec.title, tabs: spec.tabs.map((t) => t.name) }));
    return null;
  }
  const container = process.env.N8N_CONTAINER ?? 'fetchcat-n8n';
  const inContainer = `/tmp/sheet-template-${slug}.json`;
  docker('cp', local, `${container}:${inContainer}`);
  docker('exec', container, 'n8n', 'import:workflow', `--input=${inContainer}`);
  const output = docker('exec', '-e', `N8N_RUNNERS_BROKER_PORT=${process.env.N8N_CLI_RUNNER_PORT ?? '5680'}`, container, 'n8n', 'execute', `--id=${tool.id}`, '--rawOutput');
  const result = parseResult(output);
  if (!result || !result.shared || !result.inFolder) {
    throw new Error(`Sheet template run did not finish with a shared spreadsheet in the folder${result ? ` (spreadsheet ${result.spreadsheetId})` : ''}. Check the execution of "${tool.name}" in n8n.`);
  }
  console.log(JSON.stringify({ slug, ...result }));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch (e) {
    console.error(`sheet-template: ${e.message}`);
    process.exit(1);
  }
}
