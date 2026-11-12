// Runs the Code nodes of github-dependency-issue-risk-alerts against its synthetic fixture.
// No network, no credentials: n8n's $input, $() and $now are stubbed.
import assert from 'node:assert/strict';
import { readJson, workflowPath } from './lib.mjs';

const slug = 'github-dependency-issue-risk-alerts';
const workflow = readJson(workflowPath(slug));
const fixture = readJson(workflowPath(slug, 'fixtures/input.json'));
const expected = readJson(workflowPath(slug, 'fixtures/expected-output.json'));
const codeOf = (name) => workflow.nodes.find((node) => node.name === name).parameters.jsCode;
const wrap = (items) => ({ all: () => items, first: () => items[0] });
const asItems = (rows) => rows.map((json, index) => ({ json, pairedItem: { item: index } }));
function run(name, input, nodes) {
  const $ = (other) => { if (!(other in nodes)) throw new Error(`${name} read unknown node ${other}`); return wrap(nodes[other]); };
  const $now = { toUTC: () => ({ toISO: () => '2026-11-12T09:00:00.000Z' }) };
  return new Function('$input', '$', '$now', codeOf(name))(wrap(input), $, $now);
}
const SETTINGS = '1. Set your watched repositories';
const BUILD = 'Build One Actor Input per Repository';
const APIFY = '2. Fetch Issues with Apify';
const PICK = 'Pick New or Updated Issues';
const CHECK = 'Check Scores and Build Sheet Rows';
const DIGEST = 'Build High-Risk Slack Digest';
let checks = 0;
const ok = (fn) => { fn(); checks += 1; };

// Settings → one Actor input per repository
const settings = asItems([fixture.settings]);
const built = run(BUILD, settings, {});
ok(() => assert.deepEqual(built.map((item) => item.json.repository), expected.repositories));
ok(() => {
  const input = built[0].json.actorInput;
  assert.deepEqual(input.repositories, ['example-org/alpha-http']);
  assert.equal(input.maxItems, 10);
  assert.equal(input.includePullRequests, false);
  assert.equal(input.includeIssues, true);
  assert.equal(input.state, 'open');
  assert.match(input.since, /^\d{4}-\d{2}-\d{2}$/);
  const days = (Date.now() - Date.parse(input.since)) / 86400000;
  assert.ok(days >= 7 && days < 8, `since is ${days} days back`);
  assert.ok(!('labels' in input) && !('githubToken' in input));
  assert.equal(built[0].json.maxCostUsd, 0.05);
});
ok(() => assert.throws(() => run(BUILD, asItems([{ ...fixture.settings, repositories: ' , ' }]), {}), /at least one repository/));
ok(() => assert.throws(() => run(BUILD, asItems([{ ...fixture.settings, repositories: 'not a repo' }]), {}), /not a public GitHub repository/));
ok(() => {
  const custom = run(BUILD, asItems([{ ...fixture.settings, labels: 'bug, regression', githubToken: ' t ', maxCostUsdPerRepository: 9, includePullRequests: true }]), {});
  assert.deepEqual(custom[0].json.actorInput.labels, ['bug', 'regression']);
  assert.equal(custom[0].json.actorInput.githubToken, 't');
  assert.equal(custom[0].json.actorInput.includePullRequests, true);
  assert.equal(custom[0].json.maxCostUsd, 0.5);
});

const base = { [SETTINGS]: settings, [BUILD]: built };
const pick = (actorRows, sheetRows = [{}], extra = {}) => run(PICK, asItems(sheetRows), { ...base, ...extra, [APIFY]: asItems(actorRows) })[0].json;

// Happy path: every issue is new
const happy = pick(fixture.items);
ok(() => {
  assert.equal(happy.hasIssues, true);
  assert.equal(happy.issues.length, fixture.items.length);
  assert.deepEqual(happy.issues.map((issue) => issue.ref), happy.issues.map((_, index) => index + 1));
  const times = happy.issues.map((issue) => Date.parse(issue.updatedAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.ok(happy.issues.every((issue) => issue.bodyExcerpt.length <= 800 && !issue.previouslyLogged));
});

// Duplicate rows inside one run are kept once
ok(() => assert.equal(pick([...fixture.items, fixture.items[0]]).issues.length, fixture.items.length));

// Rerun: all rows already logged with the same updatedAt → nothing to score
const logged = fixture.items.map((row) => ({ url: row.url, updatedAt: row.updatedAt, alerted: 'no' }));
const rerun = pick(fixture.items, logged);
ok(() => {
  assert.equal(rerun.hasIssues, false);
  assert.equal(rerun.summary.unchanged, fixture.items.length);
  assert.match(rerun.message, /Nothing was written/);
});

// One issue got a new comment: only it is rescored, and its earlier alert is remembered
const updatedRows = fixture.items.map((row, index) => index === 1 ? { ...row, updatedAt: '2026-11-12T08:00:00Z' } : row);
const update = pick(updatedRows, logged.map((row, index) => index === 1 ? { ...row, alerted: 'yes' } : row));
ok(() => {
  assert.equal(update.issues.length, 1);
  assert.equal(update.issues[0].url, fixture.items[1].url);
  assert.equal(update.issues[0].previouslyAlerted, true);
});

// Empty Actor datasets (the Apify node outputs one empty item)
const empty = pick([{}]);
ok(() => { assert.equal(empty.hasIssues, false); assert.match(empty.message, /No issues were updated/); });

// One failed repository is reported; the others continue
const withError = run(PICK, asItems([{}]), { ...base, [APIFY]: [
  ...asItems(fixture.items.slice(0, 6)).map((item, index) => ({ ...item, pairedItem: { item: index < 3 ? 0 : 1 } })),
  { json: { error: 'Run abc did not finish with status SUCCEEDED. Run status: FAILED' }, pairedItem: { item: 2 } }
] })[0].json;
ok(() => {
  assert.equal(withError.issues.length, 6);
  assert.equal(withError.summary.failedRepositories.length, 1);
  assert.match(withError.summary.failedRepositories[0], /^example-org\/gamma-cli: /);
});

// Every run failed (for example a missing Apify credential) → readable error, nothing written
const GUARD = 'Stop If Every Apify Run Failed';
const allFailed = built.map((_, index) => ({ json: { error: 'Credentials not found' }, pairedItem: { item: index } }));
ok(() => assert.throws(() => run(GUARD, allFailed, base), /Every Apify run failed.*Credentials not found/));
ok(() => assert.equal(run(GUARD, [allFailed[0], ...asItems(fixture.items.slice(0, 2))], base).length, 3));
ok(() => assert.equal(run(GUARD, asItems([{}]), base).length, 1));

// maxIssuesToScorePerRun holds the rest for the next run
const capped = run(PICK, asItems([{}]), { ...base, [SETTINGS]: asItems([{ ...fixture.settings, maxIssuesToScorePerRun: 4 }]), [APIFY]: asItems(fixture.items) })[0].json;
ok(() => { assert.equal(capped.issues.length, 4); assert.equal(capped.summary.heldForNextRun, fixture.items.length - 4); });

// AI output → sheet rows; risk 4+ alerts once
const scoreFor = (issue) => expected.aiScores[issue.number];
const answer = { output: [{ content: [{ type: 'output_text', text: JSON.stringify({ scores: [
  ...happy.issues.map((issue) => ({ ref: issue.ref, ...scoreFor(issue) })),
  { ref: 999, category: 'bug', riskScore: 5, affectsUpgrade: 'yes', summary: 'Not from this run.' }
] }) }] }] };
const pickedNode = { [PICK]: asItems([happy]), [SETTINGS]: settings };
const rows = run(CHECK, asItems([answer]), pickedNode);
const sheetHeaders = workflow.nodes.find((node) => node.name === '4. Log Issues to Google Sheets').parameters.columns.schema.map((column) => column.id);
ok(() => {
  assert.equal(rows.length, fixture.items.length);
  for (const row of rows) {
    assert.equal(row.json.valid, true);
    for (const header of sheetHeaders) assert.ok(header in row.json, `row lacks ${header}`);
  }
  assert.deepEqual(sheetHeaders, readJson(workflowPath(slug, 'assets/sheet-template.json')).tabs[0].headers);
  assert.deepEqual(rows.filter((row) => row.json.alertNow).map((row) => row.json.number).sort(), expected.alertNumbers);
  assert.ok(rows.every((row) => row.json.alerted === (row.json.alertNow ? 'yes' : 'no')));
});

// Partial AI answer: scored issues are written, the rest wait for the next run
ok(() => {
  const partial = { scores: happy.issues.slice(0, 3).map((issue) => ({ ref: issue.ref, ...scoreFor(issue) })) };
  assert.equal(run(CHECK, asItems([partial]), pickedNode).length, 3);
});

// Already alerted before → logged again, but no second alert
ok(() => {
  const again = { ...happy, issues: happy.issues.map((issue) => ({ ...issue, previouslyAlerted: true, previouslyLogged: true })) };
  const result = run(CHECK, asItems([answer]), { ...pickedNode, [PICK]: asItems([again]) });
  assert.ok(result.every((row) => !row.json.alertNow && row.json.alerted === 'yes'));
  const quiet = run(DIGEST, asItems([{}]), { ...pickedNode, [PICK]: asItems([again]), [CHECK]: result })[0].json;
  assert.equal(quiet.hasAlerts, false);
  assert.match(quiet.message, /no Slack message was sent/);
});

// Malformed AI output writes nothing
for (const bad of [{ output: 'Sorry, I cannot help.' }, { scores: [] }, { scores: [{ ref: 999, category: 'bug', riskScore: 5, affectsUpgrade: 'yes', summary: 'x' }] }, { scores: [{ ref: 1, category: 'bug', riskScore: 9, affectsUpgrade: 'yes', summary: 'x' }] }, { scores: [{ ref: 1, category: 'other', riskScore: 3, affectsUpgrade: 'no', summary: 'x' }] }]) {
  ok(() => {
    const result = run(CHECK, asItems([bad]), pickedNode);
    assert.equal(result.length, 1);
    assert.equal(result[0].json.valid, false);
    assert.match(result[0].json.message, /Nothing was written/);
  });
}

// Slack digest lists only the high-risk items, grouped by repository
const digest = run(DIGEST, asItems([{}]), { ...pickedNode, [CHECK]: rows })[0].json;
ok(() => {
  assert.equal(digest.hasAlerts, true);
  for (const row of rows.map((item) => item.json)) {
    assert.equal(digest.text.includes(`<${row.url}|`), row.alertNow, `digest and ${row.url}`);
  }
  assert.match(digest.text, /\*Dependency risk: 4 high-risk items\*/);
  assert.match(digest.text, /9 issues scored and logged/);
});

console.log(`${slug}: ${checks} checks passed (${expected.alertNumbers.length} alerts in fixture).`);
