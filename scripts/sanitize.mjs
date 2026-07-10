import fs from 'node:fs';
import path from 'node:path';
import { readJson, root, sanitizeWorkflow, writeJson } from './lib.mjs';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg) {
  console.error('Usage: npm run sanitize -- <input.json> [output.json]');
  process.exit(2);
}

const input = path.resolve(process.cwd(), inputArg);
const output = outputArg
  ? path.resolve(process.cwd(), outputArg)
  : path.join(root, 'dist', 'sanitized', path.basename(input));

const parsed = readJson(input);
const workflow = Array.isArray(parsed) ? parsed[0] : parsed;
writeJson(output, sanitizeWorkflow(workflow));
fs.chmodSync(output, 0o644);
console.log(output);

