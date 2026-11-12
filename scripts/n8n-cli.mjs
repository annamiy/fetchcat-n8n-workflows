import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readJson, root, sanitizeWorkflow, workflowPath, writeJson } from './lib.mjs';

const [command, slug] = process.argv.slice(2);

if (!['import', 'execute', 'export'].includes(command) || !slug) {
  console.error('Usage: node scripts/n8n-cli.mjs <import|execute|export> <slug>');
  process.exit(2);
}

// The agent user has no Docker access to fetchcat-n8n; a root-owned wrapper runs fixed n8n CLI
// commands inside the container (apify-production ops/least-privilege/fetchcat-n8n-cli).
export const N8N_CLI = '/usr/local/sbin/fetchcat-n8n-cli';
function n8nCli(args, input) {
  return execFileSync('/usr/bin/sudo', ['-n', N8N_CLI, ...args], {
    encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
  });
}

function listWorkflows() {
  return n8nCli(['list'])
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
  importCopy.id = process.env.N8N_IMPORT_ID ?? randomUUID();
  writeJson(prepared, importCopy);
  process.stdout.write(n8nCli(['import'], fs.readFileSync(prepared, 'utf8')));
  process.exit(0);
}

if (command === 'execute' && workflowDefinition.nodes.some((node) => node.type === 'n8n-nodes-base.dataTable')) {
  throw new Error(
    'n8n disables Data Table nodes in standalone CLI executions. ' +
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
  process.stdout.write(n8nCli(['execute', `--id=${workflowId}`, `--runner-port=${runnerPort}`]));
} else {
  const exported = path.join(root, 'dist', 'exports', `${slug}.json`);
  fs.mkdirSync(path.dirname(exported), { recursive: true });
  fs.writeFileSync(exported, n8nCli(['export', `--id=${workflowId}`]));
  const parsed = readJson(exported);
  writeJson(exported, sanitizeWorkflow(Array.isArray(parsed) ? parsed[0] : parsed));
  console.log(exported);
}
