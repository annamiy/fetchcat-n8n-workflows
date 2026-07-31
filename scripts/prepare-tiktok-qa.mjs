import fs from 'node:fs';
import path from 'node:path';
import { root, workflowPath, writeJson } from './lib.mjs';

const [slug] = process.argv.slice(2);
if (!['tiktok-profiles-to-google-sheets', 'tiktok-creator-growth-monitor'].includes(slug)) {
  throw new Error('Usage: node scripts/prepare-tiktok-qa.mjs <tiktok workflow slug>');
}

const required = [
  'QA_GOOGLE_SHEET_ID',
  'QA_GOOGLE_SHEETS_CREDENTIAL_ID',
  'QA_APIFY_HTTP_CREDENTIAL_ID'
];
if (slug === 'tiktok-creator-growth-monitor') required.push('QA_TELEGRAM_CREDENTIAL_ID', 'QA_TELEGRAM_CHAT_ID');
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const tabIds = {
  'TikTok Profiles': process.env.QA_TIKTOK_PROFILES_TAB_ID,
  Creators: process.env.QA_CREATORS_TAB_ID,
  'Current Profiles': process.env.QA_CURRENT_PROFILES_TAB_ID,
  'Snapshot History': process.env.QA_SNAPSHOT_HISTORY_TAB_ID
};

const workflow = JSON.parse(fs.readFileSync(workflowPath(slug), 'utf8'));
for (const entry of workflow.nodes) {
  if (entry.type === 'n8n-nodes-base.httpRequest' && String(entry.parameters.url || '').includes('api.apify.com')) {
    entry.credentials = {
      httpHeaderAuth: {
        id: process.env.QA_APIFY_HTTP_CREDENTIAL_ID,
        name: 'FetchCat QA - Apify HTTP Header'
      }
    };
  }
  if (entry.type === 'n8n-nodes-base.googleSheets') {
    const tabName = entry.parameters.sheetName?.cachedResultName;
    if (!tabIds[tabName]) throw new Error(`Missing tab ID for ${tabName}`);
    entry.parameters.documentId = {
      __rl: true,
      mode: 'id',
      value: process.env.QA_GOOGLE_SHEET_ID,
      cachedResultName: 'FetchCat n8n QA - TikTok Profiles'
    };
    entry.parameters.sheetName = {
      __rl: true,
      mode: 'id',
      value: String(tabIds[tabName]),
      cachedResultName: tabName
    };
    entry.credentials = {
      googleSheetsOAuth2Api: {
        id: process.env.QA_GOOGLE_SHEETS_CREDENTIAL_ID,
        name: 'FetchCat QA - Google Sheets'
      }
    };
  }
  if (entry.type === 'n8n-nodes-base.telegram') {
    entry.parameters.chatId = process.env.QA_TELEGRAM_CHAT_ID;
    entry.credentials = {
      telegramApi: {
        id: process.env.QA_TELEGRAM_CREDENTIAL_ID,
        name: 'FetchCat QA - Telegram'
      }
    };
  }
}

const output = path.join(root, '.secrets', `${slug}-qa.json`);
writeJson(output, {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings
});
fs.chmodSync(output, 0o600);
console.log(output);
