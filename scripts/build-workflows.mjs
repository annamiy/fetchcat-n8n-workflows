import { workflowPath, writeJson } from './lib.mjs';

const OPENAI_MODEL = 'gpt-5.4-mini';

function id(prefix, number) {
  return `${prefix}0000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function node(prefix, number, name, type, typeVersion, position, parameters) {
  return { parameters, id: id(prefix, number), name, type, typeVersion, position };
}

function sticky(prefix, number, name, position, width, height, content, color = 7) {
  return node(prefix, number, name, 'n8n-nodes-base.stickyNote', 1, position, {
    width,
    height,
    content,
    color
  });
}

function workflow(name, nodes, connections) {
  return {
    name,
    nodes,
    connections,
    pinData: {},
    active: false,
    settings: {
      executionOrder: 'v1',
      timezone: 'Europe/Lisbon',
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner'
    }
  };
}

function connectionMap(edges) {
  const result = {};
  for (const [source, target, targetInput = 0, sourceOutput = 0] of edges) {
    result[source] ??= { main: [] };
    result[source].main[sourceOutput] ??= [];
    result[source].main[sourceOutput].push({ node: target, type: 'main', index: targetInput });
  }
  return result;
}

function actorParameters(actorId, actorName, bodyExpression) {
  return {
    resource: 'Actors',
    operation: 'Run actor and get dataset',
    actorSource: 'store',
    actorId: {
      __rl: true,
      mode: 'list',
      value: actorId,
      cachedResultName: actorName
    },
    customBody: bodyExpression,
    timeout: 300,
    memory: 1024,
    build: 'latest'
  };
}

function openAiParameters(prompt, schemaName, schema, instructions, maxTokens) {
  return {
    resource: 'text',
    operation: 'response',
    modelId: {
      __rl: true,
      mode: 'id',
      value: OPENAI_MODEL
    },
    responses: {
      values: [
        {
          type: 'text',
          role: 'user',
          content: prompt
        }
      ]
    },
    simplify: true,
    builtInTools: {},
    options: {
      instructions,
      maxTokens,
      reasoning: {
        reasoningOptions: {
          effort: 'low',
          summary: 'none'
        }
      },
      store: false,
      textFormat: {
        textOptions: {
          type: 'json_schema',
          verbosity: 'low',
          name: schemaName,
          schema: JSON.stringify(schema),
          description: instructions,
          strict: true
        }
      }
    }
  };
}

function dataTable(name) {
  return { __rl: true, mode: 'name', value: name };
}

const ledgerColumns = [
  { name: 'workflowSlug', type: 'string' },
  { name: 'itemKey', type: 'string' },
  { name: 'destination', type: 'string' },
  { name: 'deliveredAt', type: 'date' }
];

function createTableParameters(tableName, columns) {
  return {
    resource: 'table',
    operation: 'create',
    tableName,
    columns: { column: columns },
    options: { createIfNotExists: true }
  };
}

function upsertConfigParameters(tableName, fields) {
  return {
    resource: 'row',
    operation: 'upsert',
    dataTableId: dataTable(tableName),
    matchType: 'allConditions',
    filters: { conditions: [{ keyName: 'configKey', condition: 'eq', keyValue: 'default' }] },
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: [],
      value: Object.fromEntries(fields.map(({ name }) => [name, `={{ $json.${name} }}`])),
      schema: fields.map(({ name, type }) => ({
        id: name,
        displayName: name,
        required: false,
        defaultMatch: name === 'configKey',
        display: true,
        type,
        canBeUsedToMatch: true
      })),
      attemptToConvertTypes: true,
      convertFieldsToString: false
    },
    options: {}
  };
}

function mergeParameters() {
  return {
    mode: 'combine',
    combineBy: 'combineByPosition',
    numberInputs: 2,
    options: { clashHandling: { values: { resolveClash: 'preferInput1' } } }
  };
}

function ledgerCheckParameters(workflowSlug, keyExpression) {
  return {
    resource: 'row',
    operation: 'rowNotExists',
    dataTableId: dataTable('FetchCat Delivery Ledger'),
    matchType: 'allConditions',
    filters: {
      conditions: [
        { keyName: 'workflowSlug', condition: 'eq', keyValue: workflowSlug },
        { keyName: 'itemKey', condition: 'eq', keyValue: keyExpression }
      ]
    }
  };
}

function ledgerInsertParameters(destination) {
  const fields = ['workflowSlug', 'itemKey', 'destination', 'deliveredAt'];
  return {
    resource: 'row',
    operation: 'insert',
    dataTableId: dataTable('FetchCat Delivery Ledger'),
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: [],
      value: {
        workflowSlug: '={{ $json.workflowSlug }}',
        itemKey: '={{ $json.itemKey }}',
        destination,
        deliveredAt: '={{ $now.toISO() }}'
      },
      schema: fields.map((field) => ({
        id: field,
        displayName: field,
        required: false,
        defaultMatch: false,
        display: true,
        type: field === 'deliveredAt' ? 'dateTime' : 'string',
        canBeUsedToMatch: true
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    }
  };
}

function configGetParameters(tableName) {
  return {
    resource: 'row',
    operation: 'get',
    dataTableId: dataTable(tableName),
    returnAll: false,
    limit: 1,
    filters: { conditions: [{ keyName: 'configKey', condition: 'eq', keyValue: 'default' }] }
  };
}

function hasItemsParameters(arrayExpression) {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: '00000000-0000-4000-8000-000000000001',
        leftValue: arrayExpression,
        rightValue: 0,
        operator: { type: 'number', operation: 'gt' }
      }],
      combinator: 'and'
    },
    options: {}
  };
}

function equalsStringParameters(leftValue, rightValue) {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{
        id: '00000000-0000-4000-8000-000000000002',
        leftValue,
        rightValue,
        operator: { type: 'string', operation: 'equals' }
      }],
      combinator: 'and'
    },
    options: {}
  };
}

const parseStructured = String.raw`
function parseStructured(root, requiredKeys) {
  const seen = new Set();
  function visit(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const text = value.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
      if (!text.startsWith('{')) return null;
      try { return visit(JSON.parse(text)); } catch { return null; }
    }
    if (typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    if (requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) return value;
    const preferred = ['output_text', 'outputText', 'text', 'content', 'output', 'message', 'response', 'data'];
    for (const key of preferred) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const found = visit(value[key]);
        if (found) return found;
      }
    }
    for (const nested of Array.isArray(value) ? value : Object.values(value)) {
      const found = visit(nested);
      if (found) return found;
    }
    return null;
  }
  return visit(root);
}
`;

const linkedInSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['jobId', 'score', 'reason'],
        properties: {
          jobId: { type: 'string', minLength: 1 },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string', minLength: 1, maxLength: 500 }
        }
      }
    }
  }
};

const linkedInNodes = [
  node('10000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1520, 80], {}),
  node('10000000-', 2, 'Daily Schedule', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1520, -100], {
    rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 12, triggerAtMinute: 0 }] }
  }),
  node('10000000-', 20, 'Ensure Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-1280, 0], createTableParameters('FetchCat Delivery Ledger', ledgerColumns)),
  node('10000000-', 21, '1. Set Your Job Search', 'n8n-nodes-base.set', 3.4, [-1040, 0], {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments: [
      { id: 'linkedin-keywords', name: 'keywords', value: 'automation engineer, workflow automation', type: 'string' },
      { id: 'linkedin-location', name: 'location', value: 'Remote', type: 'string' },
      { id: 'linkedin-profile', name: 'candidateProfile', value: 'Senior automation engineer with n8n, JavaScript, APIs, and data pipeline experience.', type: 'string' },
      { id: 'linkedin-score', name: 'minimumScore', value: 70, type: 'number' },
      { id: 'linkedin-limit', name: 'maxItems', value: 10, type: 'number' }
    ] },
    options: {}
  }),
  node('10000000-', 4, 'Build Actor Input', 'n8n-nodes-base.code', 2, [-80, 0], {
    jsCode: String.raw`const config = $input.first()?.json;
if (!config) throw new Error('Configure the 1. Set Your Job Search node.');
const keywords = String(config.keywords || '').split(',').map((value) => value.trim()).filter(Boolean);
if (keywords.length === 0) throw new Error('Configure at least one comma-separated job keyword.');
const candidateProfile = String(config.candidateProfile || '').trim();
if (candidateProfile.length < 20) throw new Error('Candidate profile must be at least 20 characters.');
const minimumScore = Math.max(0, Math.min(Number(config.minimumScore) || 70, 100));
const maxItems = Math.max(1, Math.min(Number(config.maxItems) || 10, 10));
return [{ json: { config: { candidateProfile, minimumScore }, actorInput: {
  keywords,
  location: String(config.location || 'Remote'),
  maxItems,
  includeDetails: true,
  datePosted: 'past24h',
  sortBy: 'recent'
} } }];`
  }),
  node('10000000-', 5, '2. Find Recent LinkedIn Jobs', 'n8n-nodes-base.httpRequest', 4.3, [160, 0], {
    method: 'POST',
    url: 'https://api.apify.com/v2/acts/0XhGPLTjZjicBXYV5/runs',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'Accept-Encoding', value: 'identity' }
    ] },
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'waitForFinish', value: '300' }
    ] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ $json.actorInput }}',
    options: { timeout: 310000, response: { response: { responseFormat: 'json' } } }
  }),
  node('10000000-', 33, 'Get LinkedIn Job Results', 'n8n-nodes-base.httpRequest', 4.3, [400, 0], {
    method: 'GET',
    url: '=https://api.apify.com/v2/datasets/{{ $json.data.defaultDatasetId }}/items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'clean', value: 'true' },
      { name: 'limit', value: '10' }
    ] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
  }),
  node('10000000-', 6, 'Normalize and Cap Jobs', 'n8n-nodes-base.code', 2, [640, 0], {
    jsCode: String.raw`const rawJobs = $input.all().flatMap((item) => {
  let payload = item.json?.data ?? item.json;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { throw new Error('Apify returned invalid JSON.'); }
  }
  return Array.isArray(payload) ? payload : [payload];
}).slice(0, 10);
const normalized = [];
for (const job of rawJobs) {
  const title = String(job.title || '').trim();
  const invalidTitles = new Set(['delete account', 'sign in', 'join now', 'linkedin']);
  if (!job.jobId || !title || !job.jobUrl || invalidTitles.has(title.toLowerCase())) continue;
  normalized.push({ json: {
    jobId: String(job.jobId),
    title,
    companyName: String(job.companyName || 'Unknown company'),
    location: String(job.location || 'Not specified'),
    postedAtText: String(job.postedAtText || ''),
    scrapedAt: String(job.scrapedAt || ''),
    jobUrl: String(job.jobUrl),
    description: String(job.description || '').slice(0, 12000),
    employmentType: String(job.employmentType || ''),
    seniorityLevel: String(job.seniorityLevel || ''),
    applicantsText: String(job.applicantsText || '')
  } });
}
return normalized;`
  }),
  node('10000000-', 7, 'Keep Undelivered Jobs', 'n8n-nodes-base.dataTable', 1.1, [880, 0], ledgerCheckParameters('linkedin-job-match-digest', '={{ $json.jobId }}')),
  node('10000000-', 8, 'Build Job Batch', 'n8n-nodes-base.code', 2, [1120, 0], {
    jsCode: String.raw`const jobs = $input.all().map((item) => item.json);
if (jobs.length === 0) return [];
return [{ json: { jobs, jobIds: jobs.map((job) => job.jobId) } }];`
  }),
  node('10000000-', 9, '3. Score Jobs Against Your Profile', '@n8n/n8n-nodes-langchain.openAi', 2.3, [1360, 0], openAiParameters(
    '=Candidate profile:\n{{ $("Build Actor Input").first().json.config.candidateProfile }}\n\nMinimum score: {{ $("Build Actor Input").first().json.config.minimumScore }}\n\nEvaluate every job exactly once and preserve each jobId:\n{{ JSON.stringify($json.jobs) }}',
    'linkedin_job_fit_batch',
    linkedInSchema,
    'Score every job from 0 to 100 against the candidate profile. Return exactly one result for every supplied jobId and no others. Explain the fit in concise, natural English. Return the strict schema.',
    4000
  )),
  node('10000000-', 10, 'Validate Job Batch', 'n8n-nodes-base.code', 2, [1600, 0], {
    jsCode: `${parseStructured}\nconst batch = $("Build Job Batch").first().json;\nconst parsed = parseStructured($input.first().json, ['results']);\nif (!parsed || !Array.isArray(parsed.results)) throw new Error('OpenAI returned an invalid LinkedIn batch.');\nconst expectedIds = new Set(batch.jobIds);\nconst actualIds = parsed.results.map((result) => String(result.jobId));\nif (actualIds.length !== expectedIds.size || new Set(actualIds).size !== actualIds.length || actualIds.some((value) => !expectedIds.has(value))) throw new Error('OpenAI result IDs do not exactly match the LinkedIn input batch.');\nconst minimumScore = Number($("Build Actor Input").first().json.config.minimumScore);\nconst byId = new Map(batch.jobs.map((job) => [job.jobId, job]));\nconst sheetsEpochOffset = 25569;\nconst toSheetsSerial = (date) => date.getTime() / 86400000 + sheetsEpochOffset;\nconst parsePostedAt = (text, reference) => {\n  const value = String(text || '').trim().toLowerCase();\n  const date = new Date(reference);\n  if (!Number.isFinite(date.getTime())) return null;\n  const match = value.match(/(\\d+)\\s+(minute|hour|day|week|month)s?\\s+ago/);\n  if (match) {\n    const unitDays = { minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30 };\n    date.setTime(date.getTime() - Number(match[1]) * unitDays[match[2]] * 86400000);\n  } else if (!value.includes('today') && !value.includes('just now')) {\n    const absolute = new Date(text);\n    if (!Number.isFinite(absolute.getTime())) return null;\n    date.setTime(absolute.getTime());\n  }\n  return toSheetsSerial(date);\n};\nconst qualifiedJobs = [];\nfor (const result of parsed.results) {\n  if (!Number.isInteger(result.score) || result.score < 0 || result.score > 100 || typeof result.reason !== 'string' || !result.reason.trim()) throw new Error('OpenAI returned a malformed LinkedIn result.');\n  if (result.score < minimumScore) continue;\n  const job = byId.get(String(result.jobId));\n  const collected = new Date(job.scrapedAt || Date.now());\n  const url = String(job.jobUrl);\n  qualifiedJobs.push({ title: job.title, company: job.companyName, location: job.location, postedAt: parsePostedAt(job.postedAtText, collected), postedRelative: job.postedAtText, jobLink: '=HYPERLINK("' + url.replace(/"/g, '""') + '","Open job")', url, score: result.score, reason: result.reason.trim(), collectedAt: toSheetsSerial(collected), linkedInJobId: job.jobId });\n}\nreturn [{ json: { allKeys: batch.jobIds, qualifiedJobs } }];`
  }),
  node('10000000-', 11, 'Has Qualified Jobs', 'n8n-nodes-base.if', 2.2, [1840, 0], hasItemsParameters('={{ $json.qualifiedJobs.length }}')),
  node('10000000-', 12, 'Build Delivery Payload', 'n8n-nodes-base.code', 2, [2080, -100], {
    jsCode: String.raw`const qualifiedJobs = $('Validate Job Batch').first().json.qualifiedJobs;
const jobs = [...qualifiedJobs].sort((a, b) => b.score - a.score).slice(0, 5);
if (jobs.length === 0) return [];
const slackLines = jobs.map((job, index) => (index + 1) + '. *' + job.title + '* - ' + job.company + '\nScore: ' + job.score + '/100 | Location: ' + job.location + ' | Posted: ' + job.postedRelative + '\nWhy it matches: ' + job.reason + '\n<' + job.url + '|View job on LinkedIn>');
return [{ json: {
  qualifiedJobs,
  slackMessage: '*LinkedIn Job Match Digest*\n\n' + slackLines.join('\n\n')
} }];`
  }),
  node('10000000-', 26, 'Expand Jobs for Sheets', 'n8n-nodes-base.code', 2, [2320, -100], {
    jsCode: 'return $json.qualifiedJobs.map((job) => ({ json: job }));'
  }),
  node('10000000-', 13, '4. Save Matches to Google Sheets', 'n8n-nodes-base.googleSheets', 4.7, [2560, -100], {
    operation: 'appendOrUpdate',
    documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: 'Jobs' },
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['LinkedIn job ID'],
      value: {
        'Job title': '={{ $json.title }}',
        Company: '={{ $json.company }}',
        Location: '={{ $json.location }}',
        'Posted at': '={{ $json.postedAt }}',
        Job: '={{ $json.jobLink }}',
        'Match score': '={{ $json.score }}',
        'Why it matches': '={{ $json.reason }}',
        'Added at': '={{ $json.collectedAt }}',
        'LinkedIn job ID': '={{ $json.linkedInJobId }}'
      },
      schema: ['Job title', 'Company', 'Location', 'Posted at', 'Job', 'Match score', 'Why it matches', 'Added at', 'LinkedIn job ID'].map((field) => ({
        id: field,
        displayName: field,
        required: false,
        defaultMatch: false,
        display: true,
        type: ['Posted at', 'Match score', 'Added at'].includes(field) ? 'number' : 'string',
        canBeUsedToMatch: true
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: { useAppend: true }
  }),
  node('10000000-', 32, 'Continue After Sheets', 'n8n-nodes-base.code', 2, [2800, -100], {
    jsCode: String.raw`return [{ json: $('Build Delivery Payload').first().json }];`
  }),
  node('10000000-', 15, '5. Send Top Matches to Slack', 'n8n-nodes-base.slack', 2.5, [3040, -100], {
    resource: 'message',
    operation: 'post',
    select: 'channel',
    channelId: { __rl: true, mode: 'id', value: 'C0000000000' },
    messageType: 'text',
    text: '={{ $json.slackMessage }}',
    otherOptions: { includeLinkToWorkflow: false, unfurl_links: false, unfurl_media: false }
  }),
  { ...node('10000000-', 16, 'Prepare Delivery Ledger', 'n8n-nodes-base.code', 2, [3280, -100], {
    jsCode: String.raw`return $('Validate Job Batch').first().json.allKeys.map((itemKey) => ({ json: { workflowSlug: 'linkedin-job-match-digest', itemKey } }));`
  }), executeOnce: true },
  node('10000000-', 17, 'Commit Delivered Jobs', 'n8n-nodes-base.dataTable', 1.1, [3520, -100], ledgerInsertParameters('google-sheets-and-slack')),
  sticky('10000000-', 18, 'Workflow Overview', [-1560, -980], 1200, 440, `## Score LinkedIn jobs and deliver a daily digest

Find newly posted LinkedIn jobs, score them against a candidate profile in one structured OpenAI request, save qualified matches to Google Sheets, and send the five strongest matches in one Slack digest. This template runs on both n8n Cloud and self-hosted n8n using built-in n8n nodes plus the OpenAI node.

### How it works

The workflow reads all user settings from one visible 1. Set Your Job Search node and creates its delivery ledger automatically. It calls the FetchCat LinkedIn Jobs Scraper through Apify's HTTPS API for up to 10 jobs from the past 24 hours, rejects invalid records, skips delivered LinkedIn job IDs, and validates the complete AI response. Sheets is updated before Slack; IDs enter the ledger only after both destinations succeed, so outages remain retryable.

### Setup

Edit keywords, location, candidate profile, score threshold, and item limit in 1. Set Your Job Search. Create an Apify HTTP Header Auth credential with header \`Authorization\` and value \`Bearer YOUR_APIFY_TOKEN\`, connect OpenAI, select your Google Sheet and Jobs tab, then select your Slack channel.

### Customization

Adjust the daily schedule or any search value in 1. Set Your Job Search. Keep the maximum at 10 to preserve the included cost controls.`, 1),
  sticky('10000000-', 19, 'Setup Notes', [-320, -440], 1100, 270, '## Setup and configuration\n\nEdit the five search values in 1. Set Your Job Search. Connect Apify and OpenAI, then select the Google Sheet, Jobs tab, and Slack channel used for delivery.', 7),
  sticky('10000000-', 30, 'Delivery Notes', [1280, -440], 1040, 270, '## Transaction-aware delivery\n\nOne strict AI call scores the full batch. Qualified jobs are upserted to Google Sheets before one Slack digest is sent. IDs are committed only after both destinations succeed, so failed-delivery runs remain retryable.', 7)
];

const linkedInWorkflow = workflow(
  'LinkedIn Job Match Digest',
  linkedInNodes,
  connectionMap([
    ['Manual Trigger', 'Ensure Delivery Ledger'],
    ['Daily Schedule', 'Ensure Delivery Ledger'],
    ['Ensure Delivery Ledger', '1. Set Your Job Search'],
    ['1. Set Your Job Search', 'Build Actor Input'],
    ['Build Actor Input', '2. Find Recent LinkedIn Jobs'],
    ['2. Find Recent LinkedIn Jobs', 'Get LinkedIn Job Results'],
    ['Get LinkedIn Job Results', 'Normalize and Cap Jobs'],
    ['Normalize and Cap Jobs', 'Keep Undelivered Jobs'],
    ['Keep Undelivered Jobs', 'Build Job Batch'],
    ['Build Job Batch', '3. Score Jobs Against Your Profile'],
    ['3. Score Jobs Against Your Profile', 'Validate Job Batch'],
    ['Validate Job Batch', 'Has Qualified Jobs'],
    ['Has Qualified Jobs', 'Build Delivery Payload'],
    ['Build Delivery Payload', 'Expand Jobs for Sheets'],
    ['Expand Jobs for Sheets', '4. Save Matches to Google Sheets'],
    ['4. Save Matches to Google Sheets', 'Continue After Sheets'],
    ['Continue After Sheets', '5. Send Top Matches to Slack'],
    ['5. Send Top Matches to Slack', 'Prepare Delivery Ledger'],
    ['Prepare Delivery Ledger', 'Commit Delivered Jobs']
  ])
);

const youtubeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyIdeas', 'actionItems', 'timestampedMoments'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 1800 },
    keyIdeas: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 300 } },
    actionItems: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 300 } },
    timestampedMoments: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['timestamp', 'title', 'insight'],
        properties: {
          timestamp: { type: 'string', minLength: 1, maxLength: 20 },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          insight: { type: 'string', minLength: 1, maxLength: 500 }
        }
      }
    }
  }
};

const youtubeNotionBlockTypes = [
  'paragraph',
  'heading_2', 'paragraph',
  'heading_2', 'paragraph',
  'heading_2', ...Array(5).fill('bulleted_list_item'),
  'heading_2', ...Array(5).fill('bulleted_list_item'),
  'heading_2', ...Array(5).fill('bulleted_list_item')
];

const youtubeNodes = [
  node('20000000-', 1, 'YouTube Research Form', 'n8n-nodes-base.formTrigger', 2.6, [-1160, 0], {
    authentication: 'none',
    formTitle: 'YouTube Research Brief',
    formDescription: 'Create a focused research brief from one public YouTube video.',
    formFields: {
      values: [
        { fieldLabel: 'YouTube URL', fieldName: 'youtubeUrl', fieldType: 'text', placeholder: 'https://www.youtube.com/watch?v=...', requiredField: true },
        { fieldLabel: 'Language', fieldName: 'language', fieldType: 'text', defaultValue: 'en', placeholder: 'en', requiredField: true },
        { fieldLabel: 'Research goal', fieldName: 'researchGoal', fieldType: 'textarea', placeholder: 'What should the brief help you understand or decide?', requiredField: true }
      ]
    },
    responseMode: 'lastNode',
    options: {
      appendAttribution: false,
      path: 'youtube-research-brief',
      buttonLabel: 'Create brief',
      ignoreBots: true,
      useWorkflowTimezone: true
    }
  }),
  node('20000000-', 4, 'Validate Form Input', 'n8n-nodes-base.code', 2, [-920, 0], {
    jsCode: String.raw`const input = $input.first().json;
const youtubeUrl = String(input.youtubeUrl || input['YouTube URL'] || '').trim();
const language = String(input.language || input.Language || 'en').trim().toLowerCase();
const researchGoal = String(input.researchGoal || input['Research goal'] || '').trim();
const urlMatch = youtubeUrl.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/i);
if (!urlMatch) throw new Error('Enter a valid public YouTube URL.');
const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
if (!allowedHosts.has(urlMatch[1].toLowerCase())) throw new Error('Only public HTTPS YouTube URLs are accepted.');
if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(language)) throw new Error('Language must be a short code such as en or pt-br.');
if (researchGoal.length < 10 || researchGoal.length > 1000) throw new Error('Research goal must be 10 to 1000 characters.');
return [{ json: {
  youtubeUrl,
  language,
  researchGoal,
  actorInput: {
    videoUrls: [{ url: youtubeUrl }],
    language,
    includeTimestamps: true,
    includeMetadata: true,
    maxVideos: 1
  }
} }];`
  }),
  node('20000000-', 18, 'Ensure Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-680, 0], createTableParameters('FetchCat Delivery Ledger', ledgerColumns)),
  node('20000000-', 5, 'Fetch YouTube Transcript', '@apify/n8n-nodes-apify.apify', 1, [-440, 0], actorParameters(
    'H7e6sHWbYadmHLoNu',
    'YouTube Transcript Scraper',
    '={{ JSON.stringify($("Validate Form Input").first().json.actorInput) }}'
  )),
  node('20000000-', 6, 'Validate and Cap Transcript', 'n8n-nodes-base.code', 2, [-200, 0], {
    jsCode: String.raw`const rows = $input.all();
if (rows.length !== 1) throw new Error('Expected one transcript result, received ' + rows.length + '.');
const data = rows[0].json;
if (data.captionsAvailable === false || data.error) throw new Error('Captions are unavailable: ' + (data.error || 'no captions found'));
const transcript = String(data.transcriptText || '').trim();
if (transcript.length < 20) throw new Error('Captions are unavailable or empty for this video.');
const segments = Array.isArray(data.segments) ? data.segments.filter((segment) => Number.isFinite(Number(segment.start)) && String(segment.text || '').trim()) : [];
if (segments.length < 3) throw new Error('Timestamped caption segments are unavailable for this video.');
const formatTimestamp = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return (hours ? String(hours).padStart(2, '0') + ':' : '') + String(minutes).padStart(2, '0') + ':' + String(remaining).padStart(2, '0');
};
const timestampedTranscript = segments.map((segment) => '[' + formatTimestamp(segment.start) + '] ' + String(segment.text).trim()).join('\n');
const researchGoal = $('Validate Form Input').first().json.researchGoal;
return [{ json: {
  videoId: String(data.videoId || ''),
  videoUrl: String(data.videoUrl || $('Validate Form Input').first().json.youtubeUrl),
  title: String(data.title || 'YouTube Research Brief'),
  channelName: String(data.channelName || ''),
  language: String(data.language || $('Validate Form Input').first().json.language),
  duration: data.duration || null,
  researchGoal,
  dedupeKey: String(data.videoId || $('Validate Form Input').first().json.youtubeUrl) + '|' + researchGoal.trim().toLowerCase(),
  transcript: timestampedTranscript.slice(0, 60000),
  transcriptTruncated: timestampedTranscript.length > 60000
} }];`
  }),
  node('20000000-', 15, 'Keep Undelivered Requests', 'n8n-nodes-base.dataTable', 1.1, [40, 0], ledgerCheckParameters('youtube-research-brief-to-notion', '={{ $json.dedupeKey }}')),
  node('20000000-', 7, 'Generate Research Brief', '@n8n/n8n-nodes-langchain.openAi', 2.3, [280, 120], openAiParameters(
    '=Research goal:\n{{ $json.researchGoal }}\n\nVideo title: {{ $json.title }}\nChannel: {{ $json.channelName }}\n\nTranscript:\n{{ $json.transcript }}',
    'youtube_research_brief',
    youtubeSchema,
    'Create a concise research brief grounded only in the timestamped transcript. Return at least three useful timestamped moments and copy each timestamp exactly from a transcript line. Return the strict schema.',
    3000
  )),
  node('20000000-', 8, 'Merge Transcript and Brief', 'n8n-nodes-base.merge', 3.2, [520, 0], mergeParameters()),
  node('20000000-', 9, 'Validate and Format Brief', 'n8n-nodes-base.code', 2, [760, 0], {
    jsCode: `${parseStructured}\nconst item = $input.first().json;\nconst brief = parseStructured(item, ['summary', 'keyIdeas', 'actionItems', 'timestampedMoments']);\nif (!brief || typeof brief.summary !== 'string' || !Array.isArray(brief.keyIdeas) || !Array.isArray(brief.actionItems) || !Array.isArray(brief.timestampedMoments) || brief.timestampedMoments.length < 3) {\n  throw new Error('OpenAI returned an invalid research brief.');\n}\nfor (const moment of brief.timestampedMoments) {\n  if (!moment || typeof moment.timestamp !== 'string' || typeof moment.title !== 'string' || typeof moment.insight !== 'string') throw new Error('OpenAI returned an invalid timestamped moment.');\n  const timestamp = moment.timestamp.trim().replace(/^\\[/, '').replace(/\\]$/, '');\n  if (!item.transcript.includes('[' + timestamp + ']')) throw new Error('OpenAI returned a timestamp that is not present in the transcript: ' + moment.timestamp);\n  moment.timestamp = timestamp;\n}\nconst splitText = (value) => {\n  const chunks = [];\n  let remaining = String(value || '').trim();\n  while (remaining.length > 1900) {\n    let splitAt = remaining.lastIndexOf(' ', 1900);\n    if (splitAt < 1000) splitAt = 1900;\n    chunks.push(remaining.slice(0, splitAt).trim());\n    remaining = remaining.slice(splitAt).trim();\n  }\n  if (remaining) chunks.push(remaining);\n  return chunks;\n};\nconst notionBlocks = [];\nconst heading = (text) => notionBlocks.push({ type: 'heading_2', richText: false, textContent: text });\nconst paragraphs = (text) => splitText(text).forEach((chunk) => notionBlocks.push({ type: 'paragraph', richText: false, textContent: chunk }));\nnotionBlocks.push({ type: 'paragraph', richText: false, textContent: 'Source: ' + item.videoUrl });\nheading('Research goal');\nparagraphs(item.researchGoal);\nheading('Summary');\nparagraphs(brief.summary);\nheading('Key ideas');\nbrief.keyIdeas.forEach((idea) => notionBlocks.push({ type: 'bulleted_list_item', richText: false, textContent: idea }));\nheading('Action items');\nif (brief.actionItems.length) brief.actionItems.forEach((action) => notionBlocks.push({ type: 'bulleted_list_item', richText: false, textContent: action }));\nelse paragraphs('No action items identified.');\nheading('Timestamped moments');\nbrief.timestampedMoments.slice(0, 5).forEach((moment) => notionBlocks.push({ type: 'bulleted_list_item', richText: false, textContent: moment.timestamp + ' - ' + moment.title + ': ' + moment.insight }));\nif (notionBlocks.length > 100) throw new Error('Formatted Notion brief requires too many blocks.');\nreturn [{ json: { title: item.title, videoUrl: item.videoUrl, notionBlocks } }];`
  }),
  node('20000000-', 10, 'Create Notion Brief', 'n8n-nodes-base.notion', 2.2, [1000, 0], {
    authentication: 'apiKey',
    resource: 'databasePage',
    operation: 'create',
    databaseId: { __rl: true, mode: 'id', value: '00000000-0000-0000-0000-000000000000' },
    title: '={{ $json.title }}',
    simple: true,
    propertiesUi: { propertyValues: [] },
    blockUi: {
      blockValues: youtubeNotionBlockTypes.map((type, index) => ({
        type,
        richText: false,
        textContent: `={{ $json.notionBlocks[${index}].textContent }}`
      }))
    },
    options: {}
  }),
  node('20000000-', 16, 'Prepare Delivery Ledger', 'n8n-nodes-base.code', 2, [1240, 0], {
    jsCode: String.raw`return [{ json: { workflowSlug: 'youtube-research-brief-to-notion', itemKey: $('Validate and Cap Transcript').first().json.dedupeKey } }];`
  }),
  node('20000000-', 17, 'Commit Delivered Brief', 'n8n-nodes-base.dataTable', 1.1, [1480, 0], ledgerInsertParameters('Notion')),
  node('20000000-', 11, 'Return Notion URL', 'n8n-nodes-base.code', 2, [1720, 0], {
    jsCode: String.raw`const page = $('Create Notion Brief').first().json;
if (!page.url || !String(page.url).startsWith('https://')) throw new Error('Notion did not return a page URL.');
return [{ json: { url: page.url, formSubmittedText: 'Research brief created: ' + page.url } }];`
  }),
  node('20000000-', 19, 'Open Notion Brief', 'n8n-nodes-base.form', 2.5, [1960, 0], {
    operation: 'completion',
    respondWith: 'redirect',
    redirectUrl: '={{ $json.url }}',
    options: { formTitle: 'Research brief ready' }
  }),
  sticky('20000000-', 12, 'Form Setup Notes', [-1200, -440], 760, 250, '## YouTube Research Brief\n\nConnect Apify, OpenAI, and Notion credentials, then select the `FetchCat n8n QA Briefs` database. The form accepts one public HTTPS YouTube URL, language code, and research goal. Keep the workflow unpublished during QA.'),
  sticky('20000000-', 13, 'Safety Notes', [-420, -440], 900, 250, '## Cost and failure controls\n\nThe delivery ledger is created automatically. The Actor receives exactly one video. Empty or unavailable captions stop the workflow before OpenAI and Notion, and transcript input is capped at 60,000 characters.'),
  sticky('20000000-', 14, 'Output Notes', [500, -440], 1080, 250, '## Notion output\n\nThe delivery ledger is checked before OpenAI. A request is committed only after Notion creates the page successfully, so failed destination writes remain retryable. OpenAI must satisfy a strict schema. The page contains real headings, key ideas, action items, and timestamped moments.')
];

const youtubeWorkflow = workflow(
  'YouTube Research Brief to Notion',
  youtubeNodes,
  connectionMap([
    ['YouTube Research Form', 'Validate Form Input'],
    ['Validate Form Input', 'Ensure Delivery Ledger'],
    ['Ensure Delivery Ledger', 'Fetch YouTube Transcript'],
    ['Fetch YouTube Transcript', 'Validate and Cap Transcript'],
    ['Validate and Cap Transcript', 'Keep Undelivered Requests'],
    ['Keep Undelivered Requests', 'Merge Transcript and Brief', 0],
    ['Keep Undelivered Requests', 'Generate Research Brief'],
    ['Generate Research Brief', 'Merge Transcript and Brief', 1],
    ['Merge Transcript and Brief', 'Validate and Format Brief'],
    ['Validate and Format Brief', 'Create Notion Brief'],
    ['Create Notion Brief', 'Prepare Delivery Ledger'],
    ['Prepare Delivery Ledger', 'Commit Delivered Brief'],
    ['Commit Delivered Brief', 'Return Notion URL'],
    ['Return Notion URL', 'Open Notion Brief']
  ])
);

const redditSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['redditId', 'qualified', 'buyingIntent', 'score', 'reason', 'summary'],
        properties: {
          redditId: { type: 'string', minLength: 1 },
          qualified: { type: 'boolean' },
          buyingIntent: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string', minLength: 1, maxLength: 500 },
          summary: { type: 'string', minLength: 1, maxLength: 500 }
        }
      }
    }
  }
};

const redditConfigColumns = [
  { name: 'configKey', type: 'string' },
  { name: 'searchQuery', type: 'string' },
  { name: 'subreddit', type: 'string' },
  { name: 'sort', type: 'string' },
  { name: 'timeFilter', type: 'string' },
  { name: 'productContext', type: 'string' },
  { name: 'minimumScore', type: 'number' },
  { name: 'maxItems', type: 'number' }
];

const redditNodes = [
  node('30000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1520, 80], {}),
  node('30000000-', 2, 'Every Two Hours', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1520, -100], {
    rule: { interval: [{ field: 'hours', hoursInterval: 2, triggerAtMinute: 0 }] }
  }),
  node('30000000-', 20, 'Ensure Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-1280, 0], createTableParameters('FetchCat Delivery Ledger', ledgerColumns)),
  node('30000000-', 21, 'Ensure Reddit Config Table', 'n8n-nodes-base.dataTable', 1.1, [-1040, 0], createTableParameters('FetchCat Reddit Config', redditConfigColumns)),
  { ...node('30000000-', 3, 'Load Reddit Configuration', 'n8n-nodes-base.dataTable', 1.1, [-800, 0], configGetParameters('FetchCat Reddit Config')), alwaysOutputData: true },
  node('30000000-', 22, 'Apply Reddit Defaults', 'n8n-nodes-base.code', 2, [-560, 0], {
    jsCode: String.raw`const saved = $input.first()?.json || {};
return [{ json: {
  configKey: 'default',
  searchQuery: String(saved.searchQuery || 'web scraping'),
  subreddit: String(saved.subreddit || ''),
  sort: String(saved.sort || 'relevance'),
  timeFilter: String(saved.timeFilter || 'week'),
  productContext: String(saved.productContext || 'Managed web-scraping Actors and n8n automation services for business research, monitoring, and lead generation.'),
  minimumScore: Math.max(0, Math.min(Number(saved.minimumScore) || 70, 100)),
  maxItems: Math.max(1, Math.min(Number(saved.maxItems) || 10, 10))
} }];`
  }),
  node('30000000-', 23, 'Save Default Reddit Configuration', 'n8n-nodes-base.dataTable', 1.1, [-320, 0], upsertConfigParameters('FetchCat Reddit Config', redditConfigColumns)),
  node('30000000-', 4, 'Build Actor Input', 'n8n-nodes-base.code', 2, [-80, 0], {
    jsCode: String.raw`const config = $input.first()?.json;
if (!config) throw new Error('Add a default row to the FetchCat Reddit Config data table.');
if (!config.searchQuery || String(config.searchQuery).length < 3) throw new Error('Configure a Reddit search query.');
if (!config.productContext || String(config.productContext).length < 20) throw new Error('Product context must be at least 20 characters.');
const allowedSorts = new Set(['hot', 'new', 'top', 'rising', 'relevance']);
const allowedTimeFilters = new Set(['hour', 'day', 'week', 'month', 'year', 'all']);
const sort = allowedSorts.has(config.sort) ? config.sort : 'relevance';
const timeFilter = allowedTimeFilters.has(config.timeFilter) ? config.timeFilter : 'week';
const maxItems = Math.max(1, Math.min(Number(config.maxItems) || 10, 10));
const minimumScore = Math.max(0, Math.min(Number(config.minimumScore) || 70, 100));
return [{ json: { config: { productContext: String(config.productContext), minimumScore }, actorInput: {
  searchQuery: String(config.searchQuery),
  searchSubreddit: String(config.subreddit || ''),
  sort,
  timeFilter,
  maxPostsPerSource: maxItems,
  includeComments: false
} } }];`
  }),
  node('30000000-', 5, 'Fetch Reddit Posts', '@apify/n8n-nodes-apify.apify', 1, [160, 0], actorParameters(
    'DAj0KBMoCNDqMLe82',
    'Reddit Scraper',
    '={{ JSON.stringify($json.actorInput) }}'
  )),
  node('30000000-', 6, 'Normalize and Cap Posts', 'n8n-nodes-base.code', 2, [400, 0], {
    jsCode: String.raw`const normalized = [];
for (const item of $input.all()) {
  const post = item.json;
  if (post.type && String(post.type).toLowerCase() !== 'post') continue;
  if (!post.id || !post.title) continue;
  normalized.push({ json: {
    redditId: String(post.id),
    subreddit: String(post.subreddit || ''),
    title: String(post.title),
    text: String(post.text || post.selfText || post.body || '').slice(0, 8000),
    author: String(post.author || ''),
    url: String(post.url || post.permalink || ''),
    createdAt: String(post.createdAt || ''),
    score: Number(post.score || 0),
    commentCount: Number(post.commentCount || 0)
  } });
  if (normalized.length === 10) break;
}
return normalized;`
  }),
  node('30000000-', 7, 'Keep Undelivered Posts', 'n8n-nodes-base.dataTable', 1.1, [640, 0], ledgerCheckParameters('reddit-buying-intent-alerts', '={{ $json.redditId }}')),
  node('30000000-', 8, 'Build Reddit Batch', 'n8n-nodes-base.code', 2, [880, 0], {
    jsCode: String.raw`const posts = $input.all().map((item) => item.json);
if (posts.length === 0) return [];
return [{ json: { posts, redditIds: posts.map((post) => post.redditId) } }];`
  }),
  node('30000000-', 9, 'Classify Reddit Batch', '@n8n/n8n-nodes-langchain.openAi', 2.3, [1120, 0], openAiParameters(
    '=Product context:\n{{ $("Build Actor Input").first().json.config.productContext }}\n\nMinimum score: {{ $("Build Actor Input").first().json.config.minimumScore }}\n\nClassify every post exactly once and preserve each redditId:\n{{ JSON.stringify($json.posts) }}',
    'reddit_buying_intent_batch',
    redditSchema,
    'Classify explicit buying intent and relevance. Return exactly one result for every supplied redditId and no others. Do not infer sensitive traits. Qualified means high or medium intent and score at or above the supplied minimum. Return the strict schema.',
    4000
  )),
  node('30000000-', 10, 'Validate Reddit Batch', 'n8n-nodes-base.code', 2, [1360, 0], {
    jsCode: `${parseStructured}\nconst batch = $("Build Reddit Batch").first().json;\nconst parsed = parseStructured($input.first().json, ['results']);\nif (!parsed || !Array.isArray(parsed.results)) throw new Error('OpenAI returned an invalid Reddit batch.');\nconst expectedIds = new Set(batch.redditIds);\nconst actualIds = parsed.results.map((result) => String(result.redditId));\nif (actualIds.length !== expectedIds.size || new Set(actualIds).size !== actualIds.length || actualIds.some((value) => !expectedIds.has(value))) throw new Error('OpenAI result IDs do not exactly match the Reddit input batch.');\nconst minimumScore = Number($("Build Actor Input").first().json.config.minimumScore);\nconst intents = new Set(['high', 'medium', 'low', 'none']);\nconst byId = new Map(batch.posts.map((post) => [post.redditId, post]));\nconst qualifiedPosts = [];\nfor (const result of parsed.results) {\n  if (typeof result.qualified !== 'boolean' || !intents.has(result.buyingIntent) || !Number.isInteger(result.score) || result.score < 0 || result.score > 100 || typeof result.reason !== 'string' || !result.reason.trim() || typeof result.summary !== 'string' || !result.summary.trim()) throw new Error('OpenAI returned a malformed Reddit result.');\n  if (!result.qualified || !['high', 'medium'].includes(result.buyingIntent) || result.score < minimumScore) continue;\n  const post = byId.get(String(result.redditId));\n  qualifiedPosts.push({ redditId: post.redditId, subreddit: post.subreddit, title: post.title, url: post.url, createdAt: post.createdAt, redditScore: post.score, commentCount: post.commentCount, intent: result.buyingIntent, intentScore: result.score, reason: result.reason.trim(), summary: result.summary.trim() });\n}\nreturn [{ json: { allKeys: batch.redditIds, qualifiedPosts } }];`
  }),
  node('30000000-', 11, 'Has Qualified Posts', 'n8n-nodes-base.if', 2.2, [1600, 0], hasItemsParameters('={{ $json.qualifiedPosts.length }}')),
  node('30000000-', 12, 'Build Telegram Digest', 'n8n-nodes-base.code', 2, [1840, -100], {
    jsCode: String.raw`const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const posts = $json.qualifiedPosts.sort((a, b) => b.intentScore - a.intentScore).slice(0, 5);
if (posts.length === 0) return [];
const lines = posts.map((post, index) => {
  const community = post.subreddit ? 'r/' + post.subreddit : 'Reddit';
  const engagement = Number(post.redditScore || 0) + ' points | ' + Number(post.commentCount || 0) + ' comments';
  const created = post.createdAt ? ' | ' + escapeHtml(post.createdAt) : '';
  return (index + 1) + '. <b>' + escapeHtml(post.title) + '</b> [' + post.intent + ', ' + post.intentScore + '/100]\n' + escapeHtml(community) + ' | ' + engagement + created + '\n' + escapeHtml(post.summary) + '\nWhy it matters: ' + escapeHtml(post.reason) + '\n<a href="' + escapeHtml(post.url) + '">Open Reddit post</a>';
});
return [{ json: { telegramMessage: '<b>Reddit Buying-Intent Alerts</b>\n\n' + lines.join('\n\n') } }];`
  }),
  node('30000000-', 13, 'Send Telegram Digest', 'n8n-nodes-base.telegram', 1.2, [2080, -100], {
    resource: 'message',
    operation: 'sendMessage',
    chatId: '-1000000000000',
    text: '={{ $json.telegramMessage }}',
    replyMarkup: 'none',
    additionalFields: { appendAttribution: false, disable_notification: false, parse_mode: 'HTML' }
  }),
  node('30000000-', 14, 'Prepare Delivery Ledger', 'n8n-nodes-base.code', 2, [2320, 40], {
    jsCode: String.raw`return $('Validate Reddit Batch').first().json.allKeys.map((itemKey) => ({ json: { workflowSlug: 'reddit-buying-intent-alerts', itemKey } }));`
  }),
  node('30000000-', 15, 'Commit Delivered Posts', 'n8n-nodes-base.dataTable', 1.1, [2560, 40], ledgerInsertParameters('Telegram')),
  node('30000000-', 24, 'Reddit Setup Form', 'n8n-nodes-base.formTrigger', 2.6, [-1280, 500], {
    authentication: 'none',
    formTitle: 'Configure Reddit Buying-Intent Alerts',
    formDescription: 'Save the Reddit search and product context used by scheduled and manual runs.',
    formFields: { values: [
      { fieldLabel: 'Search query', fieldName: 'searchQuery', fieldType: 'text', defaultValue: 'web scraping', requiredField: true },
      { fieldLabel: 'Subreddit (optional)', fieldName: 'subreddit', fieldType: 'text' },
      { fieldLabel: 'Sort', fieldName: 'sort', fieldType: 'dropdown', fieldOptions: { values: [{ option: 'relevance' }, { option: 'new' }, { option: 'hot' }, { option: 'top' }, { option: 'rising' }] }, defaultValue: 'relevance', requiredField: true },
      { fieldLabel: 'Time window', fieldName: 'timeFilter', fieldType: 'dropdown', fieldOptions: { values: [{ option: 'week' }, { option: 'day' }, { option: 'month' }, { option: 'year' }, { option: 'all' }, { option: 'hour' }] }, defaultValue: 'week', requiredField: true },
      { fieldLabel: 'Product or service context', fieldName: 'productContext', fieldType: 'textarea', requiredField: true },
      { fieldLabel: 'Minimum score', fieldName: 'minimumScore', fieldType: 'number', defaultValue: 70, requiredField: true },
      { fieldLabel: 'Maximum posts per run', fieldName: 'maxItems', fieldType: 'number', defaultValue: 10, requiredField: true }
    ] },
    responseMode: 'lastNode',
    options: { appendAttribution: false, path: 'reddit-buying-intent-setup', buttonLabel: 'Save configuration', ignoreBots: true, useWorkflowTimezone: true }
  }),
  node('30000000-', 25, 'Ensure Setup Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-1040, 500], createTableParameters('FetchCat Delivery Ledger', ledgerColumns)),
  node('30000000-', 26, 'Ensure Setup Reddit Config', 'n8n-nodes-base.dataTable', 1.1, [-800, 500], createTableParameters('FetchCat Reddit Config', redditConfigColumns)),
  node('30000000-', 27, 'Validate Reddit Setup', 'n8n-nodes-base.code', 2, [-560, 500], {
    jsCode: String.raw`const input = $('Reddit Setup Form').first().json;
const searchQuery = String(input.searchQuery || '').trim();
const subreddit = String(input.subreddit || '').trim().replace(/^r\//i, '');
const sort = String(input.sort || 'relevance');
const timeFilter = String(input.timeFilter || 'week');
const productContext = String(input.productContext || '').trim();
const minimumScore = Number(input.minimumScore);
const maxItems = Number(input.maxItems);
if (searchQuery.length < 3 || searchQuery.length > 500) throw new Error('Search query must be 3 to 500 characters.');
if (subreddit && !/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) throw new Error('Enter a subreddit name without a URL.');
if (!['hot', 'new', 'top', 'rising', 'relevance'].includes(sort)) throw new Error('Choose a supported sort mode.');
if (!['hour', 'day', 'week', 'month', 'year', 'all'].includes(timeFilter)) throw new Error('Choose a supported time window.');
if (productContext.length < 20 || productContext.length > 4000) throw new Error('Product context must be 20 to 4000 characters.');
if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) throw new Error('Minimum score must be from 0 to 100.');
if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10) throw new Error('Maximum posts must be from 1 to 10.');
return [{ json: { configKey: 'default', searchQuery, subreddit, sort, timeFilter, productContext, minimumScore, maxItems } }];`
  }),
  node('30000000-', 28, 'Save Reddit Setup', 'n8n-nodes-base.dataTable', 1.1, [-320, 500], upsertConfigParameters('FetchCat Reddit Config', redditConfigColumns)),
  node('30000000-', 29, 'Confirm Reddit Setup', 'n8n-nodes-base.code', 2, [-80, 500], {
    jsCode: "return [{ json: { formSubmittedText: 'Reddit Buying-Intent Alerts configuration saved.' } }];"
  }),
  sticky('30000000-', 16, 'Setup Notes', [-1560, -440], 920, 270, '## Reddit Buying-Intent Alerts\n\nUse the setup form once to save the search, subreddit, sorting, time window, product context, threshold, and item limit. Normal runs create the ledger and configuration tables automatically with safe defaults. Connect Apify, OpenAI, and Telegram, then select the destination group.'),
  sticky('30000000-', 17, 'Safety Notes', [1280, -440], 1040, 270, '## Monitoring and delivery\n\nComments are disabled and the workflow never contacts authors. One strict AI call classifies the batch. A Telegram digest contains at most five posts. IDs are written to `FetchCat Delivery Ledger` only after delivery succeeds; empty and fully delivered runs send nothing.')
];

const redditWorkflow = workflow(
  'Reddit Buying-Intent Alerts',
  redditNodes,
  connectionMap([
    ['Manual Trigger', 'Ensure Delivery Ledger'],
    ['Every Two Hours', 'Ensure Delivery Ledger'],
    ['Ensure Delivery Ledger', 'Ensure Reddit Config Table'],
    ['Ensure Reddit Config Table', 'Load Reddit Configuration'],
    ['Load Reddit Configuration', 'Apply Reddit Defaults'],
    ['Apply Reddit Defaults', 'Save Default Reddit Configuration'],
    ['Save Default Reddit Configuration', 'Build Actor Input'],
    ['Build Actor Input', 'Fetch Reddit Posts'],
    ['Fetch Reddit Posts', 'Normalize and Cap Posts'],
    ['Normalize and Cap Posts', 'Keep Undelivered Posts'],
    ['Keep Undelivered Posts', 'Build Reddit Batch'],
    ['Build Reddit Batch', 'Classify Reddit Batch'],
    ['Classify Reddit Batch', 'Validate Reddit Batch'],
    ['Validate Reddit Batch', 'Has Qualified Posts'],
    ['Has Qualified Posts', 'Build Telegram Digest'],
    ['Build Telegram Digest', 'Send Telegram Digest'],
    ['Send Telegram Digest', 'Prepare Delivery Ledger'],
    ['Has Qualified Posts', 'Prepare Delivery Ledger', 0, 1],
    ['Prepare Delivery Ledger', 'Commit Delivered Posts'],
    ['Reddit Setup Form', 'Ensure Setup Delivery Ledger'],
    ['Ensure Setup Delivery Ledger', 'Ensure Setup Reddit Config'],
    ['Ensure Setup Reddit Config', 'Validate Reddit Setup'],
    ['Validate Reddit Setup', 'Save Reddit Setup'],
    ['Save Reddit Setup', 'Confirm Reddit Setup']
  ])
);

const errorNodes = [
  node('40000000-', 1, 'Workflow Error Trigger', 'n8n-nodes-base.errorTrigger', 1, [-440, 0], {}),
  node('40000000-', 2, 'Format Private Alert', 'n8n-nodes-base.code', 2, [-200, 0], {
    jsCode: String.raw`const event = $input.first().json;
const execution = event.execution || {};
const workflow = event.workflow || {};
const escapeHtml = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const message = String(execution.error?.message || event.error?.message || 'Unknown workflow error').slice(0, 1500);
const parts = [
  '<b>FetchCat n8n workflow failed</b>',
  '<b>Workflow:</b> ' + escapeHtml(workflow.name || 'Unknown'),
  '<b>Execution:</b> ' + escapeHtml(execution.id || 'Unavailable'),
  '<b>Last node:</b> ' + escapeHtml(execution.lastNodeExecuted || 'Unavailable'),
  '<b>Error:</b> ' + escapeHtml(message)
];
if (execution.url && String(execution.url).startsWith('https://')) parts.push('<a href="' + escapeHtml(execution.url) + '">Open failed execution</a>');
return [{ json: { telegramMessage: parts.join('\n') } }];`
  }),
  node('40000000-', 3, 'Send Private Error Alert', 'n8n-nodes-base.telegram', 1.2, [40, 0], {
    resource: 'message',
    operation: 'sendMessage',
    chatId: '-1000000000000',
    text: '={{ $json.telegramMessage }}',
    replyMarkup: 'none',
    additionalFields: { appendAttribution: false, disable_notification: false, parse_mode: 'HTML' }
  }),
  sticky('40000000-', 4, 'Setup Notes', [-480, -340], 700, 220, '## Shared private error notifications\n\nConnect the dedicated Telegram credential and QA group. In each monitored workflow, select this workflow under Settings > Error workflow. After a synthetic failure test, activate this Error Trigger workflow; monitored Actor workflows and schedules remain inactive.'),
  sticky('40000000-', 5, 'Privacy Notes', [240, -340], 700, 220, '## Minimal operational data\n\nAlerts contain workflow name, execution ID, last node, a truncated error message, and the private execution link. Input items, credentials, tokens, cookies, and stack traces are never included.')
];

const errorWorkflow = workflow(
  'FetchCat Private Workflow Error Alerts',
  errorNodes,
  connectionMap([
    ['Workflow Error Trigger', 'Format Private Alert'],
    ['Format Private Alert', 'Send Private Error Alert']
  ])
);

const definitions = [
  {
    slug: 'linkedin-job-match-digest',
    workflow: linkedInWorkflow,
    metadata: {
      slug: 'linkedin-job-match-digest',
      title: 'LinkedIn Job Match Digest',
      workflowKind: 'actor-template',
      actorId: '0XhGPLTjZjicBXYV5',
      actorSlug: 'fetch_cat/linkedin-jobs-scraper',
      version: '2.5.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Google Sheets', 'Slack', 'n8n Data Tables'],
      testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 3.34 },
      releaseState: 'qa-passed'
    }
  },
  {
    slug: 'youtube-research-brief-to-notion',
    workflow: youtubeWorkflow,
    metadata: {
      slug: 'youtube-research-brief-to-notion',
      title: 'YouTube Research Brief to Notion',
      workflowKind: 'actor-template',
      actorId: 'H7e6sHWbYadmHLoNu',
      actorSlug: 'fetch_cat/youtube-transcript-scraper',
      version: '2.1.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Notion', 'n8n Data Tables'],
      testLimits: { actorItems: 1, apifyBackedExecutions: 3, budgetUsd: 3.33, youtubeVideos: 1 },
      releaseState: 'qa-passed'
    }
  },
  {
    slug: 'reddit-buying-intent-alerts',
    workflow: redditWorkflow,
    metadata: {
      slug: 'reddit-buying-intent-alerts',
      title: 'Reddit Buying-Intent Alerts',
      workflowKind: 'actor-template',
      actorId: 'DAj0KBMoCNDqMLe82',
      actorSlug: 'fetch_cat/reddit-scraper',
      version: '2.1.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Telegram', 'n8n Data Tables'],
      testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 3.33 },
      releaseState: 'qa-passed'
    }
  },
  {
    slug: 'shared-error-notifications',
    workflow: errorWorkflow,
    metadata: {
      slug: 'shared-error-notifications',
      title: 'FetchCat Private Workflow Error Alerts',
      workflowKind: 'support',
      actorId: null,
      actorSlug: null,
      version: '1.0.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Telegram'],
      testLimits: { actorItems: 0, apifyBackedExecutions: 0, budgetUsd: 0 },
      releaseState: 'qa-passed'
    }
  }
];

for (const definition of definitions) {
  writeJson(workflowPath(definition.slug), definition.workflow);
  writeJson(workflowPath(definition.slug, 'metadata.json'), definition.metadata);
}

console.log(`Built ${definitions.length} workflows.`);
