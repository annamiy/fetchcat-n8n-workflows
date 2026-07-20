import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/vinted-new-listing-alerts/workflow.json', import.meta.url)));
const code = (name) => workflow.nodes.find((entry) => entry.name === name)?.parameters?.jsCode;
const runCode = (source, input, lookup = () => { throw new Error('Unexpected node lookup'); }, json = {}) => new Function('$input', '$', '$json', source)(input, lookup, json);

for (const entry of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
  assert.doesNotThrow(() => new Function('$input', '$', '$json', entry.parameters.jsCode), `${entry.name} must compile`);
}

const configured = runCode(code('Validate Search Configuration'), {
  first: () => ({ json: {
    searchText: 'cycling jersey', audience: 'Women', domain: 'www.vinted.fr',
    minimumPrice: 0, maximumPrice: 50, allowedBrands: 'Rápha',
    allowedSizes: 'M', allowedColors: 'blue, navy', brandIds: '10, 20',
    catalogIds: '1904', maxResults: 10, sendFirstRunAlerts: false
  } })
})[0].json;

assert.equal(configured.actorSearchText, 'cycling jersey women');
assert.deepEqual(configured.actorInput.brandIds, [10, 20]);
assert.deepEqual(configured.actorInput.catalogIds, [1904]);
assert.deepEqual(configured.allowedBrands, ['rapha']);
assert.deepEqual(configured.allowedColors, ['blue', 'navy']);
const mensConfig = runCode(code('Validate Search Configuration'), {
  first: () => ({ json: { searchText: 'women cycling jersey', audience: 'Men', domain: 'www.vinted.fr', minimumPrice: 0, maximumPrice: 50, maxResults: 10 } })
})[0].json;
assert.equal(mensConfig.actorSearchText, 'women cycling jersey men');
assert.throws(() => runCode(code('Validate Search Configuration'), {
  first: () => ({ json: { searchText: 'jersey', audience: 'Adults', domain: 'www.vinted.fr', minimumPrice: 0, maximumPrice: 50, maxResults: 10 } })
}), /Audience must be/);

const fixture = JSON.parse(fs.readFileSync(new URL('../workflows/vinted-new-listing-alerts/fixtures/input.json', import.meta.url)));
const normalizeLookup = (name) => {
  if (name === 'Validate Search Configuration') return { first: () => ({ json: configured }) };
  if (name === 'Load Monitor State') return { first: () => ({ json: { initializedAt: '2026-07-19T10:00:00.000Z' } }) };
  throw new Error(`Unexpected node lookup: ${name}`);
};
const matches = runCode(code('Normalize and Filter Listings'), {
  all: () => fixture.items.map((json) => ({ json }))
}, normalizeLookup);
assert.equal(matches.length, 1);
assert.equal(matches[0].json.listingId, '100000001');
assert.equal(matches[0].json.size, 'M / 38 / 10');
assert.deepEqual(matches[0].json.matchedColors, ['blue']);

const noMatchConfig = { ...configured, allowedBrands: ['maap'] };
const noMatches = runCode(code('Normalize and Filter Listings'), {
  all: () => fixture.items.map((json) => ({ json }))
}, (name) => name === 'Validate Search Configuration'
  ? { first: () => ({ json: noMatchConfig }) }
  : { first: () => ({ json: { initializedAt: '2026-07-19T10:00:00.000Z' } }) });
assert.equal(noMatches.length, 1);
assert.equal(noMatches[0].json.noMatches, true);
assert.equal(noMatches[0].json.blockedAt, 'brand');
assert.equal(noMatches[0].json.returnedCount, 2);
assert.ok(noMatches[0].json.returnedBrands.includes('Rapha'));
assert.match(noMatches[0].json.suggestion, /blocking filter/);

for (const size of ['38', '10', 'M / 38 / 10']) {
  const normalizedSize = size.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sizeConfig = { ...configured, allowedSizes: [normalizedSize] };
  const result = runCode(code('Normalize and Filter Listings'), {
    all: () => [{ json: fixture.items[0] }]
  }, (name) => name === 'Validate Search Configuration'
    ? { first: () => ({ json: sizeConfig }) }
    : { first: () => ({ json: { initializedAt: '2026-07-19T10:00:00.000Z' } }) });
  assert.equal(result.length, 1, `${size} must match the combined Vinted size`);
}

const alert = runCode(code('Build Telegram Alerts'), {
  first: () => ({ json: {} })
}, (name) => {
  if (name === 'Validate Search Configuration') return { first: () => ({ json: configured }) };
  throw new Error(`Unexpected node lookup: ${name}`);
}, { listings: matches.map((item) => item.json) });
assert.equal(alert.length, 1);
assert.match(alert[0].json.telegramMessage, /Search:<\/b> cycling jersey/);
assert.match(alert[0].json.telegramMessage, /Audience:<\/b> Women/);
assert.match(alert[0].json.telegramMessage, /Color:<\/b> blue/);
assert.match(alert[0].json.telegramMessage, /Size:<\/b> M \/ 38 \/ 10/);

console.log('Vinted monitor passed audience, marketplace ID, brand, combined-size, and color-filter tests.');
