import assert from 'node:assert/strict';
import { readJson, workflowPath } from './lib.mjs';

const slugs = [
  'google-maps-lead-enrichment', 'tiktok-viral-content-opportunities', 'youtube-trending-content-ideas',
  'meta-ads-competitor-monitor', 'amazon-price-stock-monitor', 'google-reviews-response-drafts',
  'zillow-listing-price-monitor', 'google-trends-opportunity-monitor', 'mobile-app-review-monitor',
  'product-hunt-launch-monitor'
];

for (const slug of slugs) {
  const workflow = readJson(workflowPath(slug));
  const metadata = readJson(workflowPath(slug, 'metadata.json'));
  const serialized = JSON.stringify(workflow);
  assert.equal(workflow.active, false, `${slug} must be inactive`);
  assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.manualTrigger'), `${slug} needs a manual trigger`);
  assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.scheduleTrigger'), `${slug} needs a schedule`);
  assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.dataTable' && node.parameters?.operation === 'rowNotExists'), `${slug} needs delivery-state filtering`);
  assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.dataTable' && node.parameters?.operation === 'insert'), `${slug} needs post-delivery state commit`);
  assert(serialized.includes(metadata.actorId), `${slug} must call its Actor`);
  assert(!serialized.includes('"credentials"'), `${slug} must not contain credentials`);
  const aiNodes = workflow.nodes.filter((node) => node.type === '@n8n/n8n-nodes-langchain.openAi');
  assert.equal(aiNodes.length, metadata.integrations.includes('OpenAI') ? 1 : 0, `${slug} AI batching mismatch`);
  for (const codeNode of workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => new Function(codeNode.parameters.jsCode), `${slug}: ${codeNode.name} must contain valid JavaScript`);
  }
}

const amazon = JSON.stringify(readJson(workflowPath('amazon-price-stock-monitor')));
assert(amazon.includes('productTitle'), 'Amazon must use the human-readable product title');
assert(amazon.includes('buyBoxSoldBy'), 'Amazon must support the actual seller field');

const zillow = JSON.stringify(readJson(workflowPath('zillow-listing-price-monitor')));
assert(zillow.includes('unformattedPrice'), 'Zillow must use its numeric price field');
assert(zillow.includes('homeStatus'), 'Zillow must use its actual listing status field');

const appReviews = JSON.stringify(readJson(workflowPath('mobile-app-review-monitor')));
assert(appReviews.includes('perStoreLimit'), 'App review Actors must share the total item allowance');
assert(appReviews.includes('authorName') && appReviews.includes('reviewerName'), 'App reviews must support both store author fields');
assert(appReviews.includes('Priority'), 'Review AI scores must be labelled as priority');

console.log(`Demand workflow tests passed for ${slugs.length} templates.`);
