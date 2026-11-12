import assert from 'node:assert/strict';
import { buildSubmission, checkApproval, descriptionFrom, inReview, summarizeFeedback, tokenInfo } from './creator-portal.mjs';

const jwt = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
assert.equal(tokenInfo('').ok, false);
assert.equal(tokenInfo('not-a-token').ok, false);
assert.equal(tokenInfo(jwt({ exp: 1 })).ok, false);
assert.equal(tokenInfo(jwt({ exp: Math.floor(Date.now() / 1000) + 86400 })).ok, true);

assert.equal(descriptionFrom('![Overview](assets/a.png)\n\nIntro text.\n\n\n## How it works\n1. Step'), 'Intro text.\n\n## How it works\n1. Step');

assert.equal(inReview([{ reviewStatus: 'published' }, { reviewStatus: 'in_review' }, { reviewStatus: 'ai_review' }, { reviewStatus: 'pending' }, { reviewStatus: 'changes_needed' }]).length, 3);

const fb = summarizeFeedback(JSON.stringify({ type: 'full', aiDecision: false, workflowScore: 0, workflowScoreExplanation: '<p>Needs <b>notes</b></p>' }));
assert.equal(fb.scores.workflow, 0);
assert.equal(fb.explanations.workflow, 'Needs notes');

const yt = buildSubmission('youtube-niche-breakout-finder');
assert.equal(yt.payload.name, yt.metadata.title);
assert.ok(!JSON.stringify(yt.payload.workflow).includes('"credentials"'));
assert.ok(!yt.payload.description.includes('!['));
const card = (over = {}) => ({ status: 'answered', resolvedByUserId: 'anna', resolvedByAgentId: null, payload: { questions: [{ prompt: 'Submit youtube-niche-breakout-finder?' }] }, result: { answers: [{ optionIds: ['submit'] }] }, ...over });
assert.equal(checkApproval(card(), 'youtube-niche-breakout-finder'), null);
assert.match(checkApproval(undefined, 'x'), /not found/);
assert.match(checkApproval(card({ status: 'pending' }), 'youtube-niche-breakout-finder'), /pending/);
assert.match(checkApproval(card({ resolvedByUserId: null, resolvedByAgentId: 'agent' }), 'youtube-niche-breakout-finder'), /not answered by Anna/);
assert.match(checkApproval(card(), 'github-dependency-issue-risk-alerts'), /does not name/);
assert.match(checkApproval(card({ result: { answers: [{ optionIds: ['later'] }] } }), 'youtube-niche-breakout-finder'), /not "submit"/);
console.log('creator-portal tests passed');
