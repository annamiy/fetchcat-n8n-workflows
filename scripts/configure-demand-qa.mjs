import fs from 'node:fs';
import path from 'node:path';
import { root } from './lib.mjs';

const required = [
  'N8N_API_URL', 'N8N_API_KEY', 'GOOGLE_SHEET_ID', 'SLACK_CHANNEL_ID',
  'TELEGRAM_CHAT_ID', 'NOTION_DATABASE_ID', 'QA_SHEET_MAP_JSON'
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable ${name}`);
}

const credentialBindings = {
  httpHeaderAuth: { id: '9f515f73-4f79-4e52-b726-dd167b7048fd', name: 'FetchCat QA - Apify HTTP Header' },
  googleSheetsOAuth2Api: { id: 'tOlpXdlYigjGUmof', name: 'FetchCat QA - Google Sheets' },
  openAiApi: { id: 'ZVwIm2j5D9mGc9nE', name: 'FetchCat QA - OpenAI' },
  notionApi: { id: '3n314qYJKiDKuyAM', name: 'FetchCat QA - Notion' },
  slackApi: { id: 'BQnND3wguUwpG6nk', name: 'FetchCat QA - Slack' },
  telegramApi: { id: 'RqpYNJdLOUKVCavx', name: 'FetchCat QA - Telegram' }
};

const tabIds = JSON.parse(process.env.QA_SHEET_MAP_JSON);
const tabNames = {
  'google-maps-lead-enrichment': 'Enriched leads',
  'tiktok-viral-content-opportunities': 'TikTok opportunities',
  'youtube-trending-content-ideas': 'YouTube ideas',
  'meta-ads-competitor-monitor': 'Meta ads',
  'amazon-price-stock-monitor': 'Amazon tracker',
  'google-reviews-response-drafts': 'Google reviews',
  'zillow-listing-price-monitor': 'Zillow tracker',
  'google-trends-opportunity-monitor': 'Trend opportunities',
  'mobile-app-review-monitor': 'App reviews'
};
const demandSlugs = [
  'google-maps-lead-enrichment', 'tiktok-viral-content-opportunities', 'youtube-trending-content-ideas',
  'meta-ads-competitor-monitor', 'amazon-price-stock-monitor', 'google-reviews-response-drafts',
  'zillow-listing-price-monitor', 'google-trends-opportunity-monitor', 'mobile-app-review-monitor',
  'product-hunt-launch-monitor'
];

async function request(pathname, options = {}) {
  const response = await fetch(`${process.env.N8N_API_URL}${pathname}`, {
    ...options,
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

const list = await request('/workflows?limit=250');
const report = [];
for (const slug of demandSlugs) {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'workflows', slug, 'metadata.json'), 'utf8'));
  const matches = list.data.filter((workflow) => workflow.name === metadata.title);
  if (matches.length !== 1) throw new Error(`Expected one live workflow named ${metadata.title}, found ${matches.length}`);
  const current = await request(`/workflows/${matches[0].id}`);
  const definition = JSON.parse(fs.readFileSync(path.join(root, 'workflows', slug, 'workflow.json'), 'utf8'));
  current.nodes = definition.nodes;
  current.connections = definition.connections;
  current.settings = definition.settings;
  for (const workflowNode of current.nodes) {
    if (workflowNode.type === 'n8n-nodes-base.httpRequest' && workflowNode.parameters?.genericAuthType === 'httpHeaderAuth') {
      workflowNode.credentials = { httpHeaderAuth: credentialBindings.httpHeaderAuth };
    } else if (workflowNode.type === '@n8n/n8n-nodes-langchain.openAi') {
      workflowNode.credentials = { openAiApi: credentialBindings.openAiApi };
    } else if (workflowNode.type === 'n8n-nodes-base.googleSheets') {
      const tabName = tabNames[slug];
      if (!tabIds[tabName]) throw new Error(`Missing QA sheet ID for ${tabName}`);
      workflowNode.parameters.documentId.value = process.env.GOOGLE_SHEET_ID;
      workflowNode.parameters.sheetName.value = String(tabIds[tabName]);
      workflowNode.credentials = { googleSheetsOAuth2Api: credentialBindings.googleSheetsOAuth2Api };
    } else if (workflowNode.type === 'n8n-nodes-base.slack') {
      workflowNode.parameters.channelId.value = process.env.SLACK_CHANNEL_ID;
      workflowNode.credentials = { slackApi: credentialBindings.slackApi };
    } else if (workflowNode.type === 'n8n-nodes-base.telegram') {
      workflowNode.parameters.chatId = process.env.TELEGRAM_CHAT_ID;
      workflowNode.credentials = { telegramApi: credentialBindings.telegramApi };
    } else if (workflowNode.type === 'n8n-nodes-base.notion') {
      workflowNode.parameters.databaseId.value = process.env.NOTION_DATABASE_ID;
      workflowNode.credentials = { notionApi: credentialBindings.notionApi };
    }
  }
  const body = {
    name: current.name,
    nodes: current.nodes,
    connections: current.connections,
    settings: current.settings ?? {},
    staticData: current.staticData ?? null
  };
  const updated = await request(`/workflows/${current.id}`, { method: 'PUT', body: JSON.stringify(body) });
  report.push({ slug, id: updated.id, active: updated.active, credentialNodes: updated.nodes.filter((node) => node.credentials).length });
}

console.log(JSON.stringify(report, null, 2));
