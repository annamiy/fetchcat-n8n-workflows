// Submit FetchCat templates to the n8n Creator portal (creators.n8n.io) and read
// their review status, with Anna's creator session token.
//
// The portal has no public API; these are the calls its own web app makes
// (api.n8n.io, Strapi). Submitting is two steps, as in the portal:
//   1. POST /api/workflows {name, description, workflow} starts the AI review;
//   2. after the AI feedback is in, PUT /api/workflows/:id with the same fields
//      sends the template to n8n's human review ("in_review").
//
// Usage:
//   node scripts/creator-portal.mjs status [--json]
//   node scripts/creator-portal.mjs submit <slug> --issue APIA-N --approval <cardId> [--dry-run]
//   node scripts/creator-portal.mjs feedback <templateId>
//   node scripts/creator-portal.mjs resubmit <slug> <templateId> --issue APIA-N --approval <cardId> [--dry-run]
//     (a fixed version of a template n8n sent back: changes_needed or rejected)
// Env:  N8N_CREATOR_TOKEN (from /data/paperclip/bootstrap-secrets/n8n-creator.env).
//       Never print it.
//
// Every real submit or resubmit needs Anna's own answer "Submit it" (option id
// `submit`) on a Board card for this template on the same issue. The script
// checks it in Paperclip (PAPERCLIP_API_URL, PAPERCLIP_API_KEY) and refuses
// otherwise (exit 5). A dry run needs no approval.
//
// Exit codes: 0 ok, 1 error, 5 no recorded approval from Anna, 3 no usable creator session (missing, expired or
// refused token: the Publisher falls back to Anna's card), 4 review limit
// reached (4 templates in review).

import fs from 'node:fs';
import path from 'node:path';
import { readJson, sanitizeWorkflow, workflowPath } from './lib.mjs';

export const API = 'https://api.n8n.io';
export const IN_REVIEW_LIMIT = 4;
// Statuses that hold one of the 4 review slots.
export const REVIEW_STATES = new Set(['ai_review', 'pending', 'in_review']);
const AI_POLL_MS = 5000;
const AI_POLL_TRIES = 60;

export class SessionError extends Error {}
export class ApprovalError extends Error {}

// Anna's recorded approval for this exact template: an answered card on the
// issue, resolved by a person (not an agent), naming the slug, answered "submit".
export function checkApproval(interaction, slug) {
  if (!interaction) return 'approval card not found on this issue';
  if (interaction.status !== 'answered') return `approval card is ${interaction.status}, not answered`;
  if (!interaction.resolvedByUserId || interaction.resolvedByAgentId) return 'approval card was not answered by Anna';
  const text = JSON.stringify(interaction.payload ?? {});
  if (!text.includes(slug)) return `approval card does not name the template ${slug}`;
  const picked = (interaction.result?.answers ?? []).flatMap((a) => a.optionIds ?? []);
  if (!picked.includes('submit')) return `approval card answer is ${picked.join(', ') || 'empty'}, not "submit"`;
  return null;
}

async function requireApproval(argv, slug) {
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const issue = value('--issue');
  const approval = value('--approval');
  if (!issue || !approval) throw new ApprovalError('a real submission needs --issue APIA-N --approval <card id> with Anna\'s "Submit it" answer');
  const base = String(process.env.PAPERCLIP_API_URL || '').replace(/\/$/, '');
  if (!base || !process.env.PAPERCLIP_API_KEY) throw new ApprovalError('PAPERCLIP_API_URL and PAPERCLIP_API_KEY are needed to check the approval card');
  const headers = { Authorization: `Bearer ${process.env.PAPERCLIP_API_KEY}` };
  const found = await fetch(`${base}/api/issues/${encodeURIComponent(issue)}`, { headers });
  if (!found.ok) throw new ApprovalError(`cannot read ${issue} (HTTP ${found.status})`);
  const issueId = (await found.json()).id;
  const list = await fetch(`${base}/api/issues/${issueId}/interactions`, { headers });
  if (!list.ok) throw new ApprovalError(`cannot read the cards of ${issue} (HTTP ${list.status})`);
  const body = await list.json();
  const rows = Array.isArray(body) ? body : body.interactions ?? body.items ?? [];
  const problem = checkApproval(rows.find((row) => row.id === approval), slug);
  if (problem) throw new ApprovalError(`${issue}: ${problem}`);
  return { issue, approval };
}
export class LimitError extends Error {}

export function tokenInfo(token) {
  if (!token) return { ok: false, reason: 'N8N_CREATOR_TOKEN is not set (load n8n-creator.env)' };
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const expiresAt = claims.exp ? new Date(claims.exp * 1000) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) return { ok: false, reason: `creator token expired on ${expiresAt.toISOString().slice(0, 10)}`, expiresAt };
    return { ok: true, expiresAt };
  } catch {
    return { ok: false, reason: 'N8N_CREATOR_TOKEN is not a valid session token' };
  }
}

async function call(token, method, url, body) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'fetchcat-n8n-publisher' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (response.status === 401 || response.status === 403) throw new SessionError(`creator portal refused the session (${response.status}); Anna needs to refresh the token`);
  if (!response.ok) {
    const message = data?.error?.message ?? data?.message ?? `HTTP ${response.status}`;
    if (message === 'IN_REVIEW_LIMIT_EXCEEDED') throw new LimitError('n8n allows 4 templates in review at a time');
    throw new Error(`${method} ${url}: ${message}`);
  }
  return data;
}

const parse = (value) => {
  if (typeof value !== 'string') return value ?? null;
  try { return JSON.parse(value); } catch { return null; }
};

export function summarizeFeedback(raw) {
  const f = parse(raw);
  if (!f) return null;
  const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
  return {
    type: f.type ?? null,
    aiDecision: f.aiDecision ?? null,
    scores: { title: f.titleScore, description: f.descriptionScore, workflow: f.workflowScore, security: f.securityScore, general: f.generalScore },
    explanations: {
      title: strip(f.titleScoreExplanation), description: strip(f.descriptionScoreExplanation), workflow: strip(f.workflowScoreExplanation),
      security: strip(f.securityScoreExplanation), general: strip(f.generalScoreExplanation),
    },
    suggestedTitle: f.suggestedTitle ?? null,
    hasSuggestedJson: Boolean(f.suggestedJson),
  };
}

export async function listMine(token) {
  const list = await call(token, 'GET', '/api/workflows/my');
  return (Array.isArray(list) ? list : []).map((w) => ({
    id: w.id, name: w.name, reviewStatus: w.reviewStatus, status: w.status, views: w.views ?? null, updatedAt: w.updatedAt,
  }));
}

export const inReview = (list) => list.filter((w) => REVIEW_STATES.has(w.reviewStatus));

// The n8n.io description: creator-draft.md without images (the portal strips them).
export function descriptionFrom(markdown) {
  return markdown
    .split('\n')
    .filter((line) => !/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line))
    .join('\n')
    .replace(/^\s*#\s+[^\n]*\n/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildSubmission(slug) {
  const metadata = readJson(workflowPath(slug, 'metadata.json'));
  const workflow = sanitizeWorkflow(readJson(workflowPath(slug)));
  const description = descriptionFrom(fs.readFileSync(workflowPath(slug, 'creator-draft.md'), 'utf8'));
  const errors = [];
  if (metadata.releaseState !== 'qa-passed') errors.push(`releaseState is ${metadata.releaseState}, expected qa-passed`);
  if (workflow.name !== metadata.title) errors.push('workflow.json name differs from the metadata title');
  if (JSON.stringify(workflow).includes('"credentials"')) errors.push('workflow still carries credentials');
  if (workflow.active) errors.push('workflow must be inactive');
  if (description.length < 200) errors.push('creator-draft.md description is too short');
  return { metadata, payload: { name: metadata.title, description, workflow }, errors };
}

async function waitForAiReview(token, id, log) {
  for (let i = 0; i < AI_POLL_TRIES; i += 1) {
    const item = await call(token, 'GET', `/api/workflows/my/${id}`);
    const feedback = parse(item.aiFeedback);
    if (feedback?.type || item.reviewStatus !== 'ai_review') return item;
    if (i % 6 === 0) log(`waiting for the AI review of template ${id} (${item.reviewStatus})`);
    await new Promise((resolve) => setTimeout(resolve, AI_POLL_MS));
  }
  return call(token, 'GET', `/api/workflows/my/${id}`);
}

export async function submit(token, slug, { dryRun = false, log = (m) => console.error(m) } = {}) {
  const { payload, errors } = buildSubmission(slug);
  if (errors.length) throw new Error(`${slug}: ${errors.join('; ')}`);
  const mine = await listMine(token);
  const existing = mine.find((w) => w.name === payload.name);
  if (existing) throw new Error(`a template named "${payload.name}" already exists in the portal (id ${existing.id}, ${existing.reviewStatus}); reconcile instead of submitting again`);
  const busy = inReview(mine);
  const summary = { slug, name: payload.name, descriptionChars: payload.description.length, nodes: payload.workflow.nodes.length, inReview: busy.length };
  if (busy.length >= IN_REVIEW_LIMIT) throw new LimitError(`${busy.length} templates are in review (limit ${IN_REVIEW_LIMIT}): ${busy.map((w) => w.id).join(', ')}`);
  if (dryRun) return { dryRun: true, ...summary };

  const created = await call(token, 'POST', '/api/workflows', payload);
  const id = created?.id ?? created?.data?.id;
  if (!id) throw new Error('the portal did not return a template id');
  log(`created template ${id}; AI review started`);
  const reviewed = await waitForAiReview(token, id, log);
  const feedback = summarizeFeedback(reviewed.aiFeedback);
  if (reviewed.reviewStatus === 'changes_needed') {
    return { ...summary, templateId: id, reviewStatus: reviewed.reviewStatus, submittedForHumanReview: false, feedback };
  }
  await call(token, 'PUT', `/api/workflows/${id}`, { ...payload, price: null, purchaseUrl: null });
  const final = await call(token, 'GET', `/api/workflows/my/${id}`);
  return { ...summary, templateId: id, reviewStatus: final.reviewStatus, submittedForHumanReview: true, feedback };
}

export async function resubmit(token, slug, templateId, { dryRun = false } = {}) {
  const { payload, errors } = buildSubmission(slug);
  if (errors.length) throw new Error(`${slug}: ${errors.join('; ')}`);
  const item = await call(token, 'GET', `/api/workflows/my/${templateId}`);
  if (!['changes_needed', 'rejected'].includes(item.reviewStatus)) throw new Error(`template ${templateId} is ${item.reviewStatus}; only changes_needed or rejected templates are resubmitted`);
  const busy = inReview(await listMine(token));
  if (busy.length >= IN_REVIEW_LIMIT) throw new LimitError(`${busy.length} templates are in review (limit ${IN_REVIEW_LIMIT})`);
  const summary = { slug, templateId: item.id, previousStatus: item.reviewStatus, name: payload.name, inReview: busy.length };
  if (dryRun) return { dryRun: true, ...summary };
  await call(token, 'PUT', `/api/workflows/${item.id}`, { ...payload, price: null, purchaseUrl: null });
  const final = await call(token, 'GET', `/api/workflows/my/${item.id}`);
  return { ...summary, reviewStatus: final.reviewStatus, feedback: summarizeFeedback(final.aiFeedback) };
}

export async function main(argv = process.argv.slice(2)) {
  const valueFlags = new Set(['--issue', '--approval']);
  const positional = argv.filter((a, i) => !a.startsWith('--') && !valueFlags.has(argv[i - 1]));
  const [command, arg] = positional;
  const token = process.env.N8N_CREATOR_TOKEN;
  const info = tokenInfo(token);
  const [, , third] = positional;
  if (!['status', 'submit', 'feedback', 'resubmit'].includes(command) || (command !== 'status' && !arg) || (command === 'resubmit' && !/^\d+$/.test(third ?? ''))) {
    console.error('Usage: node scripts/creator-portal.mjs status [--json] | submit <slug> --issue APIA-N --approval <cardId> [--dry-run] | feedback <templateId> | resubmit <slug> <templateId> --issue APIA-N --approval <cardId> [--dry-run]');
    return 2;
  }
  if (!info.ok) throw new SessionError(info.reason);
  const daysLeft = info.expiresAt ? Math.floor((info.expiresAt - Date.now()) / 86400000) : null;
  if (daysLeft !== null && daysLeft < 5) console.error(`warning: the creator token expires on ${info.expiresAt.toISOString().slice(0, 10)}`);

  if (command === 'status') {
    const mine = await listMine(token);
    const result = { tokenExpires: info.expiresAt?.toISOString().slice(0, 10) ?? null, inReview: inReview(mine).length, limit: IN_REVIEW_LIMIT, templates: mine };
    if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`token expires ${result.tokenExpires}; ${result.inReview}/${IN_REVIEW_LIMIT} in review`);
      for (const w of mine) console.log(`${w.id}\t${w.reviewStatus}\t${w.name}`);
    }
    return 0;
  }
  if (command === 'feedback') {
    const item = await call(token, 'GET', `/api/workflows/my/${Number(arg)}`);
    console.log(JSON.stringify({ id: item.id, name: item.name, reviewStatus: item.reviewStatus, feedback: summarizeFeedback(item.aiFeedback) }, null, 2));
    return 0;
  }
  const dryRun = argv.includes('--dry-run');
  if (!dryRun) await requireApproval(argv, arg);
  const result = command === 'resubmit' ? await resubmit(token, arg, Number(third), { dryRun }) : await submit(token, arg, { dryRun });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main().then((code) => process.exit(code), (e) => {
    console.error(`creator-portal: ${e.message}`);
    process.exit(e instanceof SessionError ? 3 : e instanceof LimitError ? 4 : e instanceof ApprovalError ? 5 : 1);
  });
}
