import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, workflowPath } from './lib.mjs';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npm run package -- <slug>');
  process.exit(2);
}

const source = workflowPath(slug, '');
if (!fs.existsSync(path.join(source, 'workflow.json'))) throw new Error(`Unknown workflow: ${slug}`);
const dist = path.join(root, 'dist', 'packages');
fs.mkdirSync(dist, { recursive: true });
const output = path.join(dist, `${slug}.tar.gz`);
execFileSync('tar', ['-czf', output, '-C', path.dirname(source), slug]);
console.log(output);

