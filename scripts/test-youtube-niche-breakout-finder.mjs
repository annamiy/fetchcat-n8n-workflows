// Runs the Code nodes of youtube-niche-breakout-finder against its synthetic fixture.
// No network, no credentials: n8n's $input, $() and $now are stubbed.
import assert from 'node:assert/strict';
import { readJson, workflowPath } from './lib.mjs';

const slug = 'youtube-niche-breakout-finder';
const workflow = readJson(workflowPath(slug));
const fixture = readJson(workflowPath(slug, 'fixtures/input.json'));
const expected = readJson(workflowPath(slug, 'fixtures/expected-output.json'));
const codeOf = (name) => workflow.nodes.find((node) => node.name === name).parameters.jsCode;
const wrap = (items) => ({ all: () => items, first: () => items[0] });
const asItems = (rows) => rows.map((json) => ({ json }));
function run(name, input, nodes) {
  const $ = (other) => { if (!(other in nodes)) throw new Error(`${name} read unknown node ${other}`); return wrap(nodes[other]); };
  const $now = { toUTC: () => ({ toFormat: () => '2026-11-12 09:00 UTC' }) };
  return new Function('$input', '$', '$now', codeOf(name))(wrap(input), $, $now);
}

const settings = asItems([fixture.settings]);
const built = run('Build Actor Input from Settings', settings, {});
assert.deepEqual(built[0].json.actorInput, { queries: ['example search a', 'example search b', 'example search c'], resultType: 'videos', sortBy: 'viewCount', uploadDate: 'week', maxResultsPerQuery: 10, language: 'en', country: 'US' });
assert.equal(built[0].json.maxCostUsd, 0.1);
assert.throws(() => run('Build Actor Input from Settings', asItems([{ ...fixture.settings, searchQueries: ' , ' }]), {}), /at least one search phrase/);
assert.equal(run('Build Actor Input from Settings', asItems([{ ...fixture.settings, maxCostUsd: 9 }]), {})[0].json.maxCostUsd, 0.5);

const base = { '1. Set your niche searches': settings, 'Build Actor Input from Settings': built };
const score = (rows, sheetRows = [{}], extra = {}) => run('Score New Breakouts', asItems(sheetRows), { ...base, ...extra, '2. Search YouTube with Apify': asItems(rows) })[0].json;

// Happy path
const happy = score(fixture.items);
assert.equal(happy.hasBreakouts, true);
assert.deepEqual(happy.breakouts.map((video) => video.videoId), expected.breakoutVideoIds);
assert.equal(happy.summary.notScored, expected.notScored);
assert.equal(happy.summary.scoredVideos, expected.scoredVideos);
assert.ok(happy.breakouts.every((video) => video.breakoutRatio >= 2 && video.views >= 1000));
assert.ok(happy.breakouts.every((video) => video.url === `https://www.youtube.com/watch?v=${video.videoId}`));

// Duplicate: every breakout already in the sheet
const duplicate = score(fixture.items, happy.breakouts.map((video) => ({ 'Video ID': video.videoId })));
assert.equal(duplicate.hasBreakouts, false);
assert.equal(duplicate.summary.alreadyLogged, happy.breakouts.length);
assert.match(duplicate.message, /Nothing was written/);

// Empty Actor dataset (the Apify node outputs one empty item)
const empty = score([{}]);
assert.equal(empty.hasBreakouts, false);
assert.match(empty.message, /returned no videos/);

// A search with too few dated videos is skipped and reported
const thin = score(fixture.items.filter((row) => row.query !== 'example search c' || row.rank <= 3));
assert.deepEqual(thin.summary.skippedSearches, ['example search c (3 scorable videos, need 4)']);

// Query text that differs only in case or spacing still belongs to its phrase (no false skips)
const recased = score(fixture.items.map((row) => ({ ...row, query: `  ${row.query.toUpperCase()} ` })));
assert.deepEqual(recased.summary.skippedSearches, []);
assert.deepEqual(recased.breakouts.map((video) => video.videoId), expected.breakoutVideoIds);

// Age parsing: compact and long English forms; anything else is not scored
const template = fixture.items[0];
for (const [text, scored] of [['6d ago', true], ['15h ago', true], ['11mo ago', true], ['2y ago', true], ['3 weeks ago', true], ['Streamed 2 days ago', true], ['vor 3 Tagen', false], [null, false]]) {
  const rows = [1, 2, 3, 4].map((n) => ({ ...template, videoId: `AGE${n}`, viewCount: 1000 * n, publishedTimeText: n === 4 ? text : '1d ago' }));
  assert.equal(score(rows).summary.notScored, scored ? 0 : 1, `age text ${text}`);
}

// maxBreakoutsPerRun holds the rest for the next run
const capped = run('Score New Breakouts', asItems([{}]), { ...base, '1. Set your niche searches': asItems([{ ...fixture.settings, maxBreakoutsPerRun: 2 }]), '2. Search YouTube with Apify': asItems(fixture.items) })[0].json;
assert.equal(capped.breakouts.length, 2);
assert.equal(capped.summary.heldForNextRun, happy.breakouts.length - 2);

// AI output: valid answer becomes one row per video, bad answers write nothing
const scoredNode = { 'Score New Breakouts': asItems([happy]) };
const ids = happy.breakouts.map((video) => video.videoId);
const answer = { output: [{ content: [{ type: 'output_text', text: JSON.stringify({ angles: [
  { angle: 'Build demos', whyItWorks: 'Shows a finished result fast.', videoIds: ids.slice(0, 3) },
  { angle: 'Full courses', whyItWorks: 'Promises one complete resource.', videoIds: [...ids.slice(3), 'NOT-IN-RUN'] }
] }) }] }] };
const rows = run('Check Angles and Build Sheet Rows', asItems([answer]), scoredNode);
assert.equal(rows.length, ids.length);
const sheetHeaders = workflow.nodes.find((node) => node.name === '4. Log Breakouts to Google Sheets').parameters.columns.schema.map((column) => column.id);
for (const row of rows) {
  assert.equal(row.json.valid, true);
  for (const header of sheetHeaders) assert.ok(header in row.json, `row lacks ${header}`);
}
assert.deepEqual(sheetHeaders, readJson(workflowPath(slug, 'assets/sheet-template.json')).tabs[0].headers);
for (const bad of [{ output: 'Sorry, I cannot help.' }, { angles: [] }, { angles: [{ angle: 'X', whyItWorks: 'Y', videoIds: ['NOT-IN-RUN'] }] }, { angles: [{ angle: '', whyItWorks: 'Y', videoIds: ids }] }]) {
  const result = run('Check Angles and Build Sheet Rows', asItems([bad]), scoredNode);
  assert.equal(result.length, 1);
  assert.equal(result[0].json.valid, false);
  assert.match(result[0].json.message, /Nothing was written/);
}

const digest = run('Build Slack Digest', asItems([{}]), { ...scoredNode, 'Check Angles and Build Sheet Rows': rows })[0].json.text;
for (const id of ids) assert.ok(digest.includes(`watch?v=${id}|`), `digest lacks ${id}`);
assert.match(digest, /1 Shorts, live or undated results not scored/);

console.log(`youtube-niche-breakout-finder: ${expected.assertions.length} assertions passed (${ids.length} breakouts in fixture).`);
