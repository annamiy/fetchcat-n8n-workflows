import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../workflows/', import.meta.url);
const simple = JSON.parse(fs.readFileSync(new URL('tiktok-profiles-to-google-sheets/workflow.json', root)));
const monitor = JSON.parse(fs.readFileSync(new URL('tiktok-creator-growth-monitor/workflow.json', root)));
const code = (workflow, name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup = () => { throw new Error('Unexpected node lookup'); }, json = {}) =>
  new Function('$input', '$', '$json', source)(input, lookup, json);

for (const workflow of [simple, monitor]) {
  for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => new Function('$input', '$', '$json', entry.parameters.jsCode), `${entry.name} must compile`);
  }
}

const simpleInput = runCode(code(simple, 'Validate Profiles and Build Actor Input'), {
  first: () => ({ json: {
    profiles: 'TikTok\n@tiktok\nhttps://www.tiktok.com/@apify',
    maxProfiles: 10
  } })
})[0].json;
assert.deepEqual(simpleInput.actorInput.handles, ['TikTok']);
assert.deepEqual(simpleInput.actorInput.profileUrls, [{ url: 'https://www.tiktok.com/@apify' }]);
assert.equal(simpleInput.actorInput.maxProfiles, 10);
assert.equal(simpleInput.actorInput.includeRecentVideos, false);
assert.equal(simple.nodes.find((entry) => entry.name === 'Daily 09:00 Trigger').parameters.rule.interval[0].daysInterval, 1);
assert.equal(simple.connections['Daily 09:00 Trigger'].main[0][0].node, '1. Enter TikTok Profiles');

const simpleFixture = JSON.parse(fs.readFileSync(new URL('tiktok-profiles-to-google-sheets/fixtures/input.json', root)));
const simpleRows = runCode(code(simple, 'Prepare Human-Readable Profile Rows'), {
  all: () => simpleFixture.items.map((json) => ({ json }))
});
assert.equal(simpleRows.length, 1);
assert.equal(simpleRows[0].json.handle, '@sample_creator');
assert.equal(simpleRows[0].json.followers, 12500);
assert.equal(simpleRows[0].json.verified, '✕ No');
assert.equal(simpleRows[0].json.commerceUser, '☑ Commerce account');
assert.match(simpleRows[0].json.profileLink, /HYPERLINK/);
assert.ok(Number.isFinite(simpleRows[0].json.updatedAt));
assert.equal(simple.nodes.find((entry) => entry.name === '3. Save Profiles to Google Sheets').parameters.operation, 'appendOrUpdate');

const watchlist = runCode(code(monitor, 'Validate Watchlist and Build Actor Input'), {
  all: () => [
    { json: { Active: true, 'TikTok handle or URL': '@sample_creator', Label: 'Cycling', 'Minimum followers': 10000, 'Maximum followers': 100000, 'Alert growth %': 5, 'Alert follower gain': 500 } },
    { json: { Active: 'Paused', 'TikTok handle or URL': '@skip_me' } }
  ]
})[0].json;
assert.deepEqual(watchlist.actorInput.handles, ['sample_creator']);
assert.equal(watchlist.configs[0].label, 'Cycling');

const currentRows = runCode(code(monitor, 'Normalize Current Creator Metrics'), {
  all: () => simpleFixture.items.map((json) => ({ json }))
});

function compare(previousRows) {
  return runCode(code(monitor, 'Compare Growth and Qualification'), {
    all: () => previousRows.map((json) => ({ json }))
  }, (name) => {
    if (name === 'Normalize Current Creator Metrics') return { all: () => currentRows };
    if (name === 'Validate Watchlist and Build Actor Input') return { first: () => ({ json: watchlist }) };
    throw new Error(`Unexpected node lookup: ${name}`);
  })[0].json;
}

const baseline = compare([]);
assert.equal(baseline.shouldAlert, true);
assert.equal(baseline.rows[0].changeStatus, 'Baseline created');
assert.match(baseline.rows[0].snapshotKey, /^@sample_creator \| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
assert.doesNotMatch(baseline.rows[0].snapshotKey, /\dT|Z\|/);
assert.match(baseline.telegramMessage, /baseline created/i);
assert.match(baseline.telegramMessage, /12,500 followers \| 120 videos/);
assert.match(baseline.telegramMessage, /First snapshot saved\. Future runs will show changes\./);
assert.doesNotMatch(baseline.telegramMessage, /baseline, baseline/i);

const growth = compare([{
  'TikTok handle': '@sample_creator', Followers: 11500, 'Total likes': 470000,
  Videos: 117, Qualification: 'Qualified'
}]);
assert.equal(growth.shouldAlert, true);
assert.equal(growth.rows[0].followerChange, 1000);
assert.equal(growth.rows[0].videoChange, 3);
assert.equal(growth.rows[0].qualification, 'Qualified');
assert.equal(growth.rows[0].changeStatus, 'Growth alert');
assert.match(growth.telegramMessage, /\+1,000/);
assert.match(growth.telegramMessage, /Follower change: \+1,000 \(\+8\.7%\) \| Video change: \+3/);

const unchanged = compare([{
  'TikTok handle': '@sample_creator', Followers: 12500, 'Total likes': 486000,
  Videos: 120, Qualification: 'Qualified'
}]);
assert.equal(unchanged.shouldAlert, false);
assert.equal(unchanged.rows[0].changeStatus, 'No material change');

const alertConnections = monitor.connections['Has Baseline or Meaningful Changes'].main;
assert.equal(monitor.nodes.find((entry) => entry.name === 'Compare Growth and Qualification').executeOnce, undefined);
assert.equal(alertConnections[0][0].node, '3. Send Creator Changes to Telegram');
assert.equal(monitor.connections['3. Send Creator Changes to Telegram'].main[0][0].node, 'Prepare Snapshot Rows');
assert.equal(monitor.connections['5. Update Current Profiles'].main[0][0].node, 'Creator Monitor Complete');

console.log('TikTok workflows passed input, normalization, baseline, growth, quiet-run, and routing tests.');
