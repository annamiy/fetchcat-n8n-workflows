import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const slug = process.argv[2];
const dirs = slug ? [path.join(root, 'workflows', slug)] : fs.readdirSync(path.join(root, 'workflows')).map((entry) => path.join(root, 'workflows', entry));
const errors = [];

for (const dir of dirs) {
  const workflowPath = path.join(dir, 'workflow.json');
  if (!fs.existsSync(workflowPath)) { errors.push(`${path.basename(dir)}: workflow.json missing at ${workflowPath}`); continue; }
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const name = path.basename(dir);
  const serialized = JSON.stringify(workflow);
  if (workflow.active !== false) errors.push(`${name}: workflow must remain inactive`);
  if (workflow.credentials || serialized.includes('"credentials":')) errors.push(`${name}: credential references must not be committed`);
  if (Object.keys(workflow.pinData ?? {}).length) errors.push(`${name}: pinned execution data must not be committed`);
  if (/token=(?!\{\{\$env\.)/i.test(serialized)) errors.push(`${name}: Apify token query must come from an env expression`);
  if (/authorization\s*[:=]\s*["'][^"']+/i.test(serialized)) errors.push(`${name}: raw Authorization header found`);
}

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Security audit passed for ${dirs.length} workflow(s).`);
