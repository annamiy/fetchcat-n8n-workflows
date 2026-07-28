import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readJson, root, sanitizeWorkflow, workflowPath, writeJson } from './lib.mjs';

const [command, slug] = process.argv.slice(2);
const container = process.env.N8N_CONTAINER ?? 'fetchcat-n8n';

if (!['import', 'execute', 'export'].includes(command) || !slug) {
  console.error('Usage: node scripts/n8n-cli.mjs <import|execute|export> <slug>');
  process.exit(2);
}

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function stableWorkflowId(slug) {
  const hex = createHash('sha256').update(`fetchcat-n8n:${slug}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function archiveDuplicateImports(slug, title, keepId) {
  const postgresContainer = process.env.N8N_POSTGRES_CONTAINER ?? 'fetchcat-n8n-postgres';
  const sql = `
    update workflow_entity
    set name = name || ' (archived duplicate ' || left(id, 8) || ')',
        "isArchived" = true,
        "updatedAt" = now()
    where name = ${sqlString(title)} and id <> ${sqlString(keepId)};
  `;
  const sqlPath = path.join(root, 'dist', 'import', `${slug}-dedupe.sql`);
  const containerPath = `/tmp/${slug}-dedupe.sql`;
  try {
    fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
    fs.writeFileSync(sqlPath, sql);
    docker('cp', sqlPath, `${postgresContainer}:${containerPath}`);
    docker('exec', postgresContainer, 'sh', '-lc', `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -f ${containerPath}`);
  } catch (error) {
    console.warn(`Could not archive duplicate imports in ${postgresContainer}; continuing with n8n import.`);
  }
}

function listWorkflows() {
  return docker('exec', container, 'n8n', 'list:workflow')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      return separator === -1 ? null : { id: line.slice(0, separator), name: line.slice(separator + 1) };
    })
    .filter(Boolean);
}

const metadata = readJson(workflowPath(slug, 'metadata.json'));
const workflowDefinition = readJson(workflowPath(slug));

if (command === 'import') {
  const prepared = path.join(root, 'dist', 'import', `${slug}.json`);
  const importCopy = sanitizeWorkflow(readJson(workflowPath(slug)));
  importCopy.id = process.env.N8N_IMPORT_ID ?? stableWorkflowId(slug);
  archiveDuplicateImports(slug, metadata.title, importCopy.id);
  writeJson(prepared, importCopy);
  const containerPath = `/tmp/${slug}.json`;
  docker('cp', prepared, `${container}:${containerPath}`);
  process.stdout.write(docker('exec', container, 'n8n', 'import:workflow', `--input=${containerPath}`));
  process.exit(0);
}

if (command === 'execute' && workflowDefinition.nodes.some((node) => node.type === 'n8n-nodes-base.dataTable')) {
  throw new Error(
    'n8n 2.26.8 disables Data Table nodes in standalone CLI executions. ' +
    'Run this workflow through the private server editor or an inactive QA trigger instead.'
  );
}

const matches = listWorkflows().filter((workflow) => workflow.name === metadata.title);
if (matches.length !== 1) {
  throw new Error(`Expected one imported workflow named "${metadata.title}", found ${matches.length}`);
}
const workflowId = matches[0].id;

if (command === 'execute') {
  const runnerPort = process.env.N8N_CLI_RUNNER_PORT ?? '5680';
  process.stdout.write(docker(
    'exec',
    '-e',
    `N8N_RUNNERS_BROKER_PORT=${runnerPort}`,
    container,
    'n8n',
    'execute',
    `--id=${workflowId}`,
    '--rawOutput'
  ));
} else {
  const containerPath = `/tmp/${slug}-export.json`;
  docker('exec', container, 'n8n', 'export:workflow', `--id=${workflowId}`, `--output=${containerPath}`, '--pretty');
  const exported = path.join(root, 'dist', 'exports', `${slug}.json`);
  fs.mkdirSync(path.dirname(exported), { recursive: true });
  docker('cp', `${container}:${containerPath}`, exported);
  const parsed = readJson(exported);
  writeJson(exported, sanitizeWorkflow(Array.isArray(parsed) ? parsed[0] : parsed));
  console.log(exported);
}
