// Create (or reuse) the public Google Sheets template for one workflow.
//
// Reads workflows/<slug>/assets/sheet-template.json, generates a private helper
// workflow, runs it once in the private n8n instance with the FetchCat Google
// Drive credential (fetchcat@nosova.me), and prints the sheet and "make a copy"
// links.
//
// The spreadsheet lives in the public templates folder of the FetchCat Drive
// (My Drive > N8N > PUBLIC), is shared "anyone with the link can view", and is
// reused on later runs (same title, owned by the FetchCat account), so retries
// never create duplicates. The helper then applies the FetchCat house style
// (scripts/sheet-style.mjs: Start here tab, styled data tabs, real public QA
// example rows). No private data or emails go into
// a template.
//
// Usage: node scripts/sheet-template.mjs <slug> [--dry-run]
// Env:   N8N_TEMPLATE_DRIVE_CREDENTIAL_ID (n8n credential of type googleDriveOAuth2Api,
//        signed in as fetchcat@nosova.me), N8N_TEMPLATE_FOLDER_ID (the PUBLIC folder),
//        N8N_CLI_RUNNER_PORT (default 5680)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, root, workflowPath } from './lib.mjs';
import { validateStyleSpec } from './sheet-style.mjs';

// One private helper workflow per slug, so two builders never run each other's spec.
export function toolWorkflowId(slug) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `fcSheetTpl${h.toString(36).padStart(7, '0')}`.slice(0, 16);
}
const MAX_ROWS = 40;

export function validateSpec(spec, opts = {}) {
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
  if (spec.folderName !== undefined) errors.push('folderName is no longer supported: every template sheet goes to the FetchCat PUBLIC folder');
  for (const e of validateStyleSpec(spec)) if (!/example rows/.test(e) || opts.requireExampleRows) errors.push(e);
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

export function buildToolWorkflow(spec, credentialId, slug, folderId) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId ?? '')) throw new Error('A Drive folder id is required');
  const cred = { googleDriveOAuth2Api: { id: credentialId, name: 'FetchCat Templates - Google Drive' } };
  const http = (id, name, x, y, parameters) => ({
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y],
    parameters: { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api', options: {}, ...parameters },
    credentials: cred,
  });
  const json = (expr) => ({ sendBody: true, specifyBody: 'json', jsonBody: expr });
  const nodes = [
    { id: 't1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    { id: 't2', name: 'Spec', type: 'n8n-nodes-base.code', typeVersion: 2, position: [200, 0], parameters: { jsCode: `return [{ json: ${JSON.stringify({ title: spec.title, body: spreadsheetBody(spec) })} }];` } },
    // The folder must exist and be visible to the FetchCat account; a wrong id fails here.
    http('t3', 'Check Folder', 400, 0, { url: `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,mimeType,trashed` }),
    { id: 't6', name: 'Folder Id', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [1000, 0], parameters: { assignments: { assignments: [{ id: 'f1', name: 'folderId', value: "={{ $json.mimeType === 'application/vnd.google-apps.folder' && !$json.trashed ? $json.id : '' }}", type: 'string' }] }, options: {} } },
    // Search by title among the FetchCat account's own sheets anywhere in its
    // Drive, so a sheet left outside the folder by a failed move is reused.
    http('t7', 'Find Sheet', 1200, 0, { url: `={{ 'https://www.googleapis.com/drive/v3/files?fields=files(id,name)&q=' + encodeURIComponent("name='" + $('Spec').first().json.title.replace(/'/g, "\\\\'") + "' and 'me' in owners and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false") }}` }),
    { id: 't8', name: 'Sheet Exists?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [1400, 0], parameters: { conditions: { options: { caseSensitive: true, typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [{ id: 'c2', leftValue: '={{ ($json.files || []).length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }] }, options: {} } },
    http('t9', 'Create Spreadsheet', 1600, 120, { method: 'POST', url: 'https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId', ...json(`={{ JSON.stringify($('Spec').first().json.body) }}`) }),
    { id: 't11', name: 'Sheet Id', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [2000, 0], parameters: { assignments: { assignments: [{ id: 'g1', name: 'spreadsheetId', value: '={{ $json.spreadsheetId || ($json.files && $json.files[0] && $json.files[0].id) }}', type: 'string' }, { id: 'g2', name: 'created', value: "={{ !$json.files }}", type: 'boolean' }] }, options: {} } },
    http('t10', 'Get Parents', 2200, 0, { url: `={{ 'https://www.googleapis.com/drive/v3/files/' + $json.spreadsheetId + '?fields=id,parents' }}` }),
    // Put the sheet in the folder using its real parents (no 'root' alias); a
    // no-op when it is already there, so reruns repair a failed earlier move.
    http('t12', 'Ensure In Folder', 2400, 0, { method: 'PATCH', url: `={{ (() => { const folder = $('Folder Id').first().json.folderId; const others = ($json.parents || []).filter((p) => p !== folder); return 'https://www.googleapis.com/drive/v3/files/' + $json.id + '?fields=id,parents&addParents=' + folder + (others.length ? '&removeParents=' + others.join(',') : ''); })() }}`, ...json('={{ "{}" }}') }),
    http('t13', 'Share Anyone Viewer', 2600, 0, { method: 'POST', url: `={{ 'https://www.googleapis.com/drive/v3/files/' + $json.id + '/permissions?fields=id,role,type' }}`, ...json(`={{ JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }) }}`) }),
    http('t15', 'Read Sheet Layout', 2800, 0, { url: `={{ 'https://sheets.googleapis.com/v4/spreadsheets/' + $('Sheet Id').first().json.spreadsheetId + '?fields=sheets(properties(sheetId,title,gridProperties),conditionalFormats,basicFilter)' }}` }),
    { id: 't16', name: 'Build House Style', type: 'n8n-nodes-base.code', typeVersion: 2, position: [3000, 0], parameters: { jsCode: houseStyleCode(spec) } },
    http('t17', 'Apply House Style', 3200, 0, { method: 'POST', url: `={{ 'https://sheets.googleapis.com/v4/spreadsheets/' + $('Sheet Id').first().json.spreadsheetId + ':batchUpdate' }}`, ...json('={{ JSON.stringify({ requests: $json.requests }) }}') }),
    { id: 't14', name: 'Result', type: 'n8n-nodes-base.code', typeVersion: 2, position: [3400, 0], parameters: { jsCode: "const s = $('Sheet Id').first().json;\nconst p = $('Share Anyone Viewer').first().json;\nconst styled = Array.isArray($input.first().json.replies);\nconst placed = $('Ensure In Folder').first().json;\nconst folderId = $('Folder Id').first().json.folderId;\nconst id = s.spreadsheetId;\nreturn [{ json: { fetchcatSheetTemplate: true, spreadsheetId: id, created: s.created, inFolder: (placed.parents || []).includes(folderId), shared: p.type === 'anyone' && p.role === 'reader', styled, folderId, url: `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`, copyUrl: `https://docs.google.com/spreadsheets/d/${id}/copy` } }];" } },
  ];
  const c = (from, to, out = 0) => ({ from, to, out });
  const links = [c('Start', 'Spec'), c('Spec', 'Check Folder'), c('Check Folder', 'Folder Id'),
    c('Folder Id', 'Find Sheet'), c('Find Sheet', 'Sheet Exists?'), c('Sheet Exists?', 'Sheet Id', 0), c('Sheet Exists?', 'Create Spreadsheet', 1), c('Create Spreadsheet', 'Sheet Id'),
    c('Sheet Id', 'Get Parents'), c('Get Parents', 'Ensure In Folder'), c('Ensure In Folder', 'Share Anyone Viewer'), c('Share Anyone Viewer', 'Read Sheet Layout'), c('Read Sheet Layout', 'Build House Style'), c('Build House Style', 'Apply House Style'), c('Apply House Style', 'Result')];
  const connections = {};
  for (const { from, to, out } of links) {
    connections[from] ??= { main: [] };
    while (connections[from].main.length <= out) connections[from].main.push([]);
    connections[from].main[out].push({ node: to, type: 'main', index: 0 });
  }
  return { id: toolWorkflowId(slug), name: `FetchCat tool - sheet template ${slug}`, active: false, settings: { executionOrder: 'v1' }, nodes, connections };
}

// The Code node runs the same generator as scripts/sheet-style.mjs (inlined,
// since n8n Code nodes cannot import repository files).
export function houseStyleCode(spec) {
  const source = fs.readFileSync(new URL('./sheet-style.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
  return `${source}\nconst spec = ${JSON.stringify(spec)};\nreturn [{ json: { requests: styleRequests(spec, existingFromSpreadsheet($json)) } }];`;
}

// Last {"fetchcatSheetTemplate": true, ...} object in the CLI raw output.
export function parseResult(output) {
  const matches = [...output.matchAll(/\{[^{}]*"fetchcatSheetTemplate":\s*true[^{}]*\}/g)];
  if (!matches.length) return null;
  return JSON.parse(matches.at(-1)[0]);
}

// Fixed n8n CLI commands through the root-owned wrapper; the agent user has no Docker access to fetchcat-n8n.
function n8nCli(args, input) {
  return execFileSync('/usr/bin/sudo', ['-n', '/usr/local/sbin/fetchcat-n8n-cli', ...args], {
    encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
}

export function main(argv = process.argv.slice(2)) {
  const slug = argv.find((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  if (!slug) throw new Error('Usage: node scripts/sheet-template.mjs <slug> [--dry-run]');
  const specFile = workflowPath(slug, 'assets/sheet-template.json');
  const spec = readJson(specFile);
  const errors = validateSpec(spec, { requireExampleRows: argv.includes('--require-example-rows') });
  if (errors.length) throw new Error(`${specFile}: ${errors.join('; ')}`);
  const credentialId = process.env.N8N_TEMPLATE_DRIVE_CREDENTIAL_ID;
  const folderId = process.env.N8N_TEMPLATE_FOLDER_ID;
  if (!credentialId && !dryRun) throw new Error('N8N_TEMPLATE_DRIVE_CREDENTIAL_ID is required (googleDriveOAuth2Api credential signed in as fetchcat@nosova.me); load n8n-destinations.env');
  if (!folderId && !dryRun) throw new Error('N8N_TEMPLATE_FOLDER_ID is required (FetchCat Drive N8N > PUBLIC folder); load n8n-destinations.env');
  const tool = buildToolWorkflow(spec, credentialId ?? 'DRY_RUN', slug, folderId ?? 'DRY_RUN_FOLDER_ID');
  const local = path.join(root, 'dist', 'tools', `sheet-template-${slug}.json`);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, `${JSON.stringify(tool, null, 2)}\n`);
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, toolWorkflow: path.relative(root, local), title: spec.title, tabs: spec.tabs.map((t) => t.name) }));
    return null;
  }
  n8nCli(['import'], fs.readFileSync(local, 'utf8'));
  const output = n8nCli(['execute', `--id=${tool.id}`, `--runner-port=${process.env.N8N_CLI_RUNNER_PORT ?? '5680'}`]);
  const result = parseResult(output);
  if (!result || !result.shared || !result.inFolder || !result.styled) {
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
