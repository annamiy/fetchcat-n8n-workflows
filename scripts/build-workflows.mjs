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
  sticky('10000000-', 18, 'Workflow Overview', [-2128, -256], 480, 896, `## LinkedIn Job Match Digest

### How it works

1. Starts manually or every day at noon and creates the delivery ledger if needed.
2. Runs FetchCat LinkedIn Jobs Scraper for up to 10 jobs posted in the past 24 hours.
3. Skips previously delivered LinkedIn job IDs and scores the remaining jobs in one OpenAI request.
4. Saves qualified matches to Google Sheets and sends the five strongest matches to Slack.
5. Records IDs only after both destinations succeed, keeping failed deliveries retryable.

### Setup steps

- [ ] Add \`fetch_cat/linkedin-jobs-scraper\` to your Apify account if required.
- [ ] Create HTTP Header Auth with \`Authorization: Bearer YOUR_APIFY_TOKEN\` and select it in both FetchCat request nodes.
- [ ] Connect OpenAI in 3. Score Jobs Against Your Profile.
- [ ] Create a Jobs sheet with the documented headers, then select it in 4. Save Matches to Google Sheets.
- [ ] Connect Slack and choose the digest channel in 5. Send Top Matches to Slack.
- [ ] Edit keywords, location, candidate profile, threshold, and item limit in 1. Set Your Job Search.

### Customization

Adjust the daily schedule, search settings, score threshold, Slack message, or Google Sheets fields. Keep the item limit at 10 for the included cost controls.`, 1),
  sticky('10000000-', 19, 'Start and ledger setup', [-1568, -256], 432, 496, '## Start and ledger setup\n\nStarts manually or at noon and creates the delivery ledger used to prevent repeated alerts.', 7),
  sticky('10000000-', 30, 'Configure job search', [-1088, -112], 1632, 272, '## Configure job search\n\nReads your search settings, builds the FetchCat Actor input, runs `fetch_cat/linkedin-jobs-scraper`, and downloads its dataset.', 7),
  sticky('10000000-', 31, 'Filter and batch jobs', [592, -128], 672, 304, '## Filter and batch jobs\n\nCleans returned jobs, skips LinkedIn job IDs already in the delivery ledger, and prepares one AI batch.', 7),
  sticky('10000000-', 34, 'Score qualified matches', [1312, -128], 672, 304, '## Score qualified matches\n\nScores every job against the candidate profile, validates the structured response, and applies the configured threshold.', 7),
  sticky('10000000-', 35, 'Prepare sheet output', [2032, -240], 672, 304, '## Prepare sheet output\n\nBuilds the ranked digest and writes qualified jobs to Google Sheets using LinkedIn job ID as the unique key.', 7),
  sticky('10000000-', 36, 'Send Slack digest', [2752, -240], 432, 304, '## Send Slack digest\n\nContinues only after the Sheet write succeeds and posts the five strongest matches in one Slack message.', 7),
  sticky('10000000-', 37, 'Commit delivery status', [3232, -256], 432, 320, '## Commit delivery status\n\nRecords evaluated job IDs only after Sheets and Slack succeed, so interrupted deliveries remain retryable.', 7)
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

const pinterestSnapshotColumns = [
  { name: 'snapshotKey', type: 'string' },
  { name: 'snapshotDate', type: 'string' },
  { name: 'snapshotAt', type: 'date' },
  { name: 'query', type: 'string' },
  { name: 'pinId', type: 'string' },
  { name: 'position', type: 'number' },
  { name: 'title', type: 'string' },
  { name: 'pinUrl', type: 'string' },
  { name: 'creatorName', type: 'string' },
  { name: 'domain', type: 'string' }
];

function pinterestSnapshotUpsertParameters() {
  const fields = pinterestSnapshotColumns.map(({ name }) => name);
  return {
    resource: 'row',
    operation: 'upsert',
    dataTableId: dataTable('FetchCat Pinterest Search Snapshots'),
    matchType: 'allConditions',
    filters: { conditions: [{ keyName: 'snapshotKey', condition: 'eq', keyValue: '={{ $json.snapshotKey }}' }] },
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: [],
      value: Object.fromEntries(fields.map((field) => [field, `={{ $json.${field} }}`])),
      schema: fields.map((field) => ({
        id: field,
        displayName: field,
        required: false,
        defaultMatch: field === 'snapshotKey',
        display: true,
        type: field === 'position' ? 'number' : field === 'snapshotAt' ? 'dateTime' : 'string',
        canBeUsedToMatch: true
      })),
      attemptToConvertTypes: true,
      convertFieldsToString: false
    },
    options: {}
  };
}

const pinterestBriefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['decisionStatus', 'monitorStage', 'confidence', 'summary', 'queryAssessments', 'pinAssessments', 'patterns', 'opportunities', 'avoid', 'nextActions', 'recommendedQueries'],
  properties: {
    decisionStatus: { type: 'string', enum: ['ready', 'insufficient_evidence'] },
    monitorStage: { type: 'string', enum: ['baseline', 'comparison', 'momentum'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string', minLength: 1, maxLength: 1600 },
    queryAssessments: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['query', 'relevantCount', 'movementSignal', 'verdict', 'recommendedReplacement'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 150 },
          relevantCount: { type: 'integer', minimum: 0, maximum: 10 },
          movementSignal: { type: 'string', enum: ['baseline', 'early_signal', 'rising', 'falling', 'stable', 'mixed'] },
          verdict: { type: 'string', minLength: 1, maxLength: 400 },
          recommendedReplacement: { type: 'string', minLength: 1, maxLength: 150 }
        }
      }
    },
    pinAssessments: {
      type: 'array', minItems: 10, maxItems: 10,
      items: {
        type: 'object', additionalProperties: false,
        required: ['pinId', 'relevant', 'relevanceReason', 'productOrFormat', 'audienceIntent', 'visualDescription'],
        properties: {
          pinId: { type: 'string', minLength: 1 },
          relevant: { type: 'boolean' },
          relevanceReason: { type: 'string', minLength: 1, maxLength: 300 },
          productOrFormat: { type: 'string', minLength: 1, maxLength: 150 },
          audienceIntent: { type: 'string', minLength: 1, maxLength: 250 },
          visualDescription: { type: 'string', minLength: 1, maxLength: 500 }
        }
      }
    },
    patterns: {
      type: 'array', minItems: 4, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        required: ['pattern', 'stage', 'observation', 'sourcePinIds'],
        properties: {
          pattern: { type: 'string', minLength: 1, maxLength: 200 },
          stage: { type: 'string', enum: ['current', 'recurring', 'emerging'] },
          observation: { type: 'string', minLength: 1, maxLength: 500 },
          sourcePinIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1 } }
        }
      }
    },
    opportunities: {
      type: 'array', minItems: 0, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'productOrFormat', 'audienceIntent', 'concept', 'differentiation', 'visualBrief', 'pinterestTitle', 'pinterestDescription', 'keywords', 'confidence', 'sourcePinIds'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          productOrFormat: { type: 'string', minLength: 1, maxLength: 150 },
          audienceIntent: { type: 'string', minLength: 1, maxLength: 300 },
          concept: { type: 'string', minLength: 1, maxLength: 600 },
          differentiation: { type: 'string', minLength: 1, maxLength: 500 },
          visualBrief: {
            type: 'object', additionalProperties: false,
            required: ['composition', 'typography', 'palette', 'imagery'],
            properties: {
              composition: { type: 'string', minLength: 1, maxLength: 300 },
              typography: { type: 'string', minLength: 1, maxLength: 300 },
              palette: { type: 'string', minLength: 1, maxLength: 200 },
              imagery: { type: 'string', minLength: 1, maxLength: 300 }
            }
          },
          pinterestTitle: { type: 'string', minLength: 1, maxLength: 150 },
          pinterestDescription: { type: 'string', minLength: 1, maxLength: 500 },
          keywords: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 80 } },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          sourcePinIds: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string', minLength: 1 } }
        }
      }
    },
    avoid: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['concept', 'reason', 'sourcePinIds'],
        properties: {
          concept: { type: 'string', minLength: 1, maxLength: 200 },
          reason: { type: 'string', minLength: 1, maxLength: 400 },
          sourcePinIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1 } }
        }
      }
    },
    nextActions: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 300 } },
    recommendedQueries: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 150 } }
  }
};

const pinterestNotionBlockTypes = [
  'paragraph',
  'heading_2', 'paragraph',
  'heading_2', 'paragraph', ...Array(5).fill('bulleted_list_item'),
  'heading_2', ...Array(4).fill('bulleted_list_item'),
  'heading_2',
  ...Array(3).fill(null).flatMap(() => ['heading_3', 'paragraph', 'paragraph', 'paragraph', 'paragraph']),
  'heading_2', ...Array(3).fill('bulleted_list_item'),
  'heading_2', ...Array(4).fill('to_do'),
  'heading_2', ...Array(5).fill('bulleted_list_item'),
  'heading_2',
  ...Array(5).fill(null).flatMap(() => ['image', 'paragraph']),
  'heading_2', 'paragraph'
];

function pinterestVisionParameters() {
  const parameters = openAiParameters(
    '=Decision to make: {{ $json.config.decisionToMake }}\nOffer or publication: {{ $json.config.offer }}\nTarget audience: {{ $json.config.targetAudience }}\nBrand style: {{ $json.config.brandStyle }}\nConstraints: {{ $json.config.constraints }}\nMinimum relevant pins required: {{ $json.config.minRelevantPins }}\nMonitor stage: {{ $json.monitorStage }}\nEarlier snapshot dates: {{ JSON.stringify($json.historyDates) }}\nQuery statistics: {{ JSON.stringify($json.queryStats) }}\nAll current text evidence: {{ JSON.stringify($json.evidencePins) }}\n\nThe ten attached current images correspond in order to these records. Use only the short evidenceId values P1 through P10 in pinId and sourcePinIds fields:\n{{ JSON.stringify($json.visionPins.map((pin, index) => ({ imageNumber: index + 1, evidenceId: pin.evidenceId, pinterestPinId: pin.pinId, query: pin.query, position: pin.position, previousPosition: pin.previousPosition, status: pin.status, weeksObserved: pin.weeksObserved, title: pin.title, description: pin.description, creatorName: pin.creatorName, domain: pin.domain, pinUrl: pin.pinUrl }))) }}',
    'pinterest_search_momentum_monitor',
    pinterestBriefSchema,
    'Create a weekly Pinterest search momentum brief from the supplied search ranks, dated snapshots, metadata, and ten current images. The returned monitorStage must exactly match the supplied stage. Assess every image for relevance to the niche and decision. A ready brief requires at least the configured number of relevant images; otherwise return zero opportunities and repair the searches. Baseline means current search landscape only: every query movementSignal must be baseline and no pattern may be recurring or emerging. Comparison has one earlier snapshot: movement may be described only as an early signal and no pattern may be emerging. Momentum has at least two earlier snapshots: emerging is allowed only when supported by repeated rank or appearance evidence across snapshots. Search-result movement is not search-volume or demand growth. Never claim sales, clicks, impressions, popularity, virality, or engagement when those metrics are absent. Return exactly three original, testable content opportunities when ready. Each opportunity must say what to publish, why now, how it differs, and what result to measure. Never copy designs or recommend copyrighted characters, trademarks, book covers, or close imitation. Cite supplied pin IDs for every pattern, avoid item, and opportunity; opportunities may cite only relevant pins. Return concise natural English in the strict schema.',
    9000
  );
  parameters.responses.values.push(...Array.from({ length: 10 }, (_, index) => ({
    type: 'image',
    role: 'user',
    imageType: 'url',
    imageUrl: `={{ $json.visionPins[${index}].imageUrl }}`,
    imageDetail: 'low'
  })));
  return parameters;
}

const pinterestNodes = [
  node('50000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1760, 80], {}),
  node('50000000-', 2, 'Weekly Schedule', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1760, -100], {
    rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 9, triggerAtMinute: 0 }] }
  }),
  node('50000000-', 3, 'Ensure Pinterest Snapshot Table', 'n8n-nodes-base.dataTable', 1.1, [-1520, 0], createTableParameters('FetchCat Pinterest Search Snapshots', pinterestSnapshotColumns)),
  node('50000000-', 4, '1. Set Your Pinterest Research', 'n8n-nodes-base.set', 3.4, [-1280, 0], {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments: [
      { id: 'pinterest-name', name: 'researchName', value: 'Small-space gardening Pinterest monitor', type: 'string' },
      { id: 'pinterest-decision', name: 'decisionToMake', value: 'Which Pinterest topics and creative formats should we publish or test next?', type: 'string' },
      { id: 'pinterest-offer', name: 'offer', value: 'A practical small-space gardening publication with guides, newsletters, and affiliate recommendations.', type: 'string' },
      { id: 'pinterest-audience', name: 'targetAudience', value: 'Apartment renters in the United States who want attractive, productive gardens in very limited space.', type: 'string' },
      { id: 'pinterest-style', name: 'brandStyle', value: 'Useful, achievable, bright, and specific, with clear instructional visuals instead of generic inspiration.', type: 'string' },
      { id: 'pinterest-constraints', name: 'constraints', value: 'Recommend original educational content. Do not copy pin designs or claim demand without trend data.', type: 'string' },
      { id: 'pinterest-queries', name: 'queries', value: 'small balcony garden ideas, balcony vegetable garden, vertical garden for balcony, apartment herb garden, small patio garden ideas', type: 'string' },
      { id: 'pinterest-locale', name: 'locale', value: 'en-US', type: 'string' },
      { id: 'pinterest-country', name: 'country', value: 'US', type: 'string' },
      { id: 'pinterest-limit', name: 'maxResultsPerQuery', value: 10, type: 'number' },
      { id: 'pinterest-min-evidence', name: 'minRelevantPins', value: 7, type: 'number' },
      { id: 'pinterest-details', name: 'includePinDetails', value: false, type: 'boolean' }
    ] },
    options: {}
  }),
  node('50000000-', 5, 'Build Pinterest Actor Input', 'n8n-nodes-base.code', 2, [-1040, 0], {
    jsCode: String.raw`const config = $input.first()?.json;
if (!config) throw new Error('Configure 1. Set Your Pinterest Research.');
const queries = String(config.queries || '').split(',').map((value) => value.trim()).filter(Boolean);
if (queries.length !== 5) throw new Error('Configure exactly five focused, comma-separated Pinterest queries.');
if (new Set(queries.map((query) => query.toLowerCase())).size !== queries.length) throw new Error('Pinterest queries must be unique.');
const decisionToMake = String(config.decisionToMake || '').trim();
const offer = String(config.offer || '').trim();
const targetAudience = String(config.targetAudience || '').trim();
const brandStyle = String(config.brandStyle || '').trim();
const constraints = String(config.constraints || '').trim();
if ([decisionToMake, offer, targetAudience, brandStyle, constraints].some((value) => value.length < 20)) throw new Error('Decision, offer, audience, brand style, and constraints must each be at least 20 characters.');
const maxResultsPerQuery = Math.max(5, Math.min(Number(config.maxResultsPerQuery) || 10, 20));
const minRelevantPins = Math.max(6, Math.min(Number(config.minRelevantPins) || 7, 10));
return [{ json: {
  config: {
    researchName: String(config.researchName || 'Pinterest Search Opportunity Brief').trim(),
    decisionToMake,
    offer,
    targetAudience,
    brandStyle,
    constraints,
    queries,
    locale: String(config.locale || 'en-US').trim(),
    country: String(config.country || '').trim(),
    maxResultsPerQuery,
    minRelevantPins
  },
  actorInput: {
    queries,
    maxResultsPerQuery,
    includePinDetails: Boolean(config.includePinDetails),
    locale: String(config.locale || 'en-US').trim(),
    country: String(config.country || '').trim(),
    proxyConfiguration: { useApifyProxy: false }
  }
} }];`
  }),
  node('50000000-', 6, '2. Search Pinterest with FetchCat', 'n8n-nodes-base.httpRequest', 4.3, [-800, 0], {
    method: 'POST',
    url: 'https://api.apify.com/v2/acts/FtsA7YTDVGAJ83XiS/runs',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Accept-Encoding', value: 'identity' }] },
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'waitForFinish', value: '300' },
      { name: 'timeout', value: '600' }
    ] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ $json.actorInput }}',
    options: { timeout: 310000, response: { response: { responseFormat: 'json' } } }
  }),
  node('50000000-', 31, 'Wait for Queued Pinterest Run', 'n8n-nodes-base.httpRequest', 4.3, [-620, 0], {
    method: 'GET',
    url: '=https://api.apify.com/v2/actor-runs/{{ $json.data.id }}',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'waitForFinish', value: '300' }] },
    options: { timeout: 310000, response: { response: { responseFormat: 'json' } } }
  }),
  node('50000000-', 7, 'Validate Pinterest Actor Run', 'n8n-nodes-base.code', 2, [-440, 0], {
    jsCode: String.raw`const run = $input.first()?.json?.data;
if (!run?.defaultDatasetId) throw new Error('FetchCat Pinterest Search Scraper did not return a dataset.');
if (run.status && run.status !== 'SUCCEEDED') throw new Error('FetchCat Pinterest Search Scraper finished with status: ' + run.status);
return [{ json: { datasetId: run.defaultDatasetId, actorRunId: String(run.id || '') } }];`
  }),
  node('50000000-', 8, 'Get Pinterest Search Results', 'n8n-nodes-base.httpRequest', 4.3, [-320, 0], {
    method: 'GET',
    url: '=https://api.apify.com/v2/datasets/{{ $json.datasetId }}/items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'clean', value: 'true' },
      { name: 'limit', value: '150' }
    ] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
  }),
  node('50000000-', 9, 'Normalize Pinterest Pins', 'n8n-nodes-base.code', 2, [-80, 0], {
    jsCode: String.raw`const config = $('Build Pinterest Actor Input').first().json.config;
const payload = $input.all().flatMap((item) => {
  const value = item.json?.data ?? item.json;
  return Array.isArray(value) ? value : [value];
});
const snapshotAt = new Date().toISOString();
const snapshotDate = snapshotAt.slice(0, 10);
const unique = new Map();
for (const pin of payload) {
  const pinId = String(pin.pinId || '').trim();
  const query = String(pin.query || '').trim();
  const pinUrl = String(pin.pinUrl || '').trim();
  const position = Number(pin.position);
  if (!pinId || !query || !/^https:\/\/(?:[a-z]+\.)?pinterest\.[^/]+\/pin\//i.test(pinUrl) || !Number.isFinite(position) || position < 1) continue;
  const key = query.toLowerCase() + '|' + pinId;
  if (unique.has(key)) continue;
  const rawTitle = String(pin.title || '').trim();
  const rawDescription = String(pin.description || '').trim();
  const title = !rawTitle || ['pin', 'pinterest'].includes(rawTitle.toLowerCase())
    ? (rawDescription ? rawDescription.slice(0, 220) : 'Untitled Pinterest pin')
    : rawTitle.slice(0, 220);
  const optionalNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  unique.set(key, {
    snapshotKey: snapshotDate + '|' + key,
    snapshotDate,
    snapshotAt,
    query,
    pinId,
    position,
    title,
    description: rawDescription.slice(0, 1200),
    pinUrl,
    imageUrl: String(pin.imageUrl || pin.thumbnailUrl || '').trim(),
    creatorName: String(pin.creatorName || pin.creatorUsername || '').trim(),
    domain: String(pin.domain || '').trim(),
    outboundUrl: String(pin.outboundUrl || '').trim(),
    saveCount: optionalNumber(pin.saveCount),
    repinCount: optionalNumber(pin.repinCount),
    dominantColor: String(pin.dominantColor || '').trim()
  });
}
const pins = [...unique.values()].sort((a, b) => a.query.localeCompare(b.query) || a.position - b.position).slice(0, 150);
const minimumPerQuery = Math.max(5, Math.floor(config.maxResultsPerQuery * 0.7));
const countsByQuery = new Map(config.queries.map((query) => [query.toLowerCase(), 0]));
for (const pin of pins) countsByQuery.set(pin.query.toLowerCase(), (countsByQuery.get(pin.query.toLowerCase()) || 0) + 1);
const incomplete = config.queries.filter((query) => (countsByQuery.get(query.toLowerCase()) || 0) < minimumPerQuery);
if (incomplete.length) throw new Error('Incomplete Pinterest dataset. Fewer than ' + minimumPerQuery + ' usable pins returned for: ' + incomplete.join(', ') + '. Retry before analyzing partial evidence.');
return pins.map((pin) => ({ json: { ...pin, researchName: config.researchName } }));`
  }),
  { ...node('50000000-', 10, 'Load Previous Pinterest Snapshots', 'n8n-nodes-base.dataTable', 1.1, [160, 0], {
    resource: 'row',
    operation: 'get',
    dataTableId: dataTable('FetchCat Pinterest Search Snapshots'),
    returnAll: true,
    filters: { conditions: [] }
  }), alwaysOutputData: true, executeOnce: true },
  node('50000000-', 11, 'Compare Search Snapshots', 'n8n-nodes-base.code', 2, [400, 0], {
    jsCode: String.raw`const current = $('Normalize Pinterest Pins').all().map((item) => item.json);
const config = $('Build Pinterest Actor Input').first().json.config;
const currentDate = current[0].snapshotDate;
const querySet = new Set(config.queries.map((query) => query.toLowerCase()));
const storedRows = $input.all().map((item) => item.json).filter((row) => row.pinId && row.query && row.snapshotDate && querySet.has(String(row.query).toLowerCase()));
const historical = storedRows.filter((row) => row.snapshotDate < currentDate);
const completedQueriesToday = new Set(storedRows.filter((row) => row.snapshotDate === currentDate).map((row) => String(row.query).toLowerCase()));
const historyDates = [...new Set(historical.map((row) => String(row.snapshotDate)))].sort();
const monitorStage = historyDates.length === 0 ? 'baseline' : historyDates.length === 1 ? 'comparison' : 'momentum';
const latestDateByQuery = new Map();
for (const row of historical) {
  const query = String(row.query).toLowerCase();
  if (!latestDateByQuery.has(query) || row.snapshotDate > latestDateByQuery.get(query)) latestDateByQuery.set(query, row.snapshotDate);
}
const previousByKey = new Map();
for (const row of historical) {
  const query = String(row.query).toLowerCase();
  if (row.snapshotDate === latestDateByQuery.get(query)) previousByKey.set(query + '|' + row.pinId, row);
}
const compared = current.map((pin) => {
  const previous = previousByKey.get(pin.query.toLowerCase() + '|' + pin.pinId);
  const previousPosition = previous ? Number(previous.position) : null;
  const movement = previousPosition === null ? null : previousPosition - pin.position;
  const status = previousPosition === null ? (latestDateByQuery.has(pin.query.toLowerCase()) ? 'new' : 'baseline') : movement > 0 ? 'rising' : movement < 0 ? 'falling' : 'steady';
  const observedDates = new Set(historical.filter((row) => String(row.query).toLowerCase() === pin.query.toLowerCase() && String(row.pinId) === pin.pinId).map((row) => String(row.snapshotDate)));
  return { ...pin, previousPosition, movement, status, weeksObserved: observedDates.size + 1 };
});
const isBaseline = latestDateByQuery.size === 0;
const pendingSnapshotCount = config.queries.filter((query) => !completedQueriesToday.has(query.toLowerCase())).length;
const counts = Object.fromEntries(['baseline', 'new', 'rising', 'falling', 'steady'].map((status) => [status, compared.filter((pin) => pin.status === status).length]));
const queryStats = config.queries.map((query) => {
  const rows = compared.filter((pin) => pin.query.toLowerCase() === query.toLowerCase());
  const priorDate = latestDateByQuery.get(query.toLowerCase()) || null;
  return {
    query,
    currentResults: rows.length,
    previousSnapshotDate: priorDate,
    newPins: rows.filter((pin) => pin.status === 'new').length,
    risingPins: rows.filter((pin) => pin.status === 'rising').length,
    fallingPins: rows.filter((pin) => pin.status === 'falling').length,
    steadyPins: rows.filter((pin) => pin.status === 'steady').length,
    repeatedPins: rows.filter((pin) => pin.weeksObserved >= 2).length
  };
});
const evidencePins = compared.slice(0, 30).map((pin) => ({
  pinId: pin.pinId,
  query: pin.query,
  position: pin.position,
  previousPosition: pin.previousPosition,
  status: pin.status,
  weeksObserved: pin.weeksObserved,
  title: pin.title,
  description: pin.description.slice(0, 600),
  creatorName: pin.creatorName || null,
  domain: pin.domain || null,
  saveCount: pin.saveCount,
  repinCount: pin.repinCount,
  dominantColor: pin.dominantColor || null,
  pinUrl: pin.pinUrl,
  imageUrl: pin.imageUrl
}));
const imagePinsByQuery = new Map(config.queries.map((query) => [query.toLowerCase(), compared.filter((pin) => pin.query.toLowerCase() === query.toLowerCase() && /^https:\/\//i.test(pin.imageUrl)).sort((a, b) => a.position - b.position)]));
const visionPins = [];
const visionPinIds = new Set();
for (let rank = 0; visionPins.length < 10 && rank < 20; rank += 1) {
  for (const query of config.queries) {
    const pin = imagePinsByQuery.get(query.toLowerCase())?.[rank];
    if (pin && !visionPinIds.has(pin.pinId)) {
      visionPins.push({ ...pin, evidenceId: 'P' + (visionPins.length + 1) });
      visionPinIds.add(pin.pinId);
    }
    if (visionPins.length === 10) break;
  }
}
if (visionPins.length < 10) throw new Error('Pinterest returned fewer than ten image-backed pins. Use more specific queries or increase results per query.');
const sourcePins = [...compared].sort((a, b) => a.position - b.position).filter((pin, index, all) => all.findIndex((candidate) => candidate.pinId === pin.pinId) === index).slice(0, 5);
const sheetsEpochOffset = 25569;
const toSheetsSerial = (value) => new Date(value).getTime() / 86400000 + sheetsEpochOffset;
const sheetRows = compared.map((pin) => ({
  snapshotAt: toSheetsSerial(pin.snapshotAt),
  query: pin.query,
  position: pin.position,
  previousPosition: pin.previousPosition,
  movement: pin.movement,
  status: pin.status.charAt(0).toUpperCase() + pin.status.slice(1),
  pinLink: '=HYPERLINK("' + pin.pinUrl.replace(/"/g, '""') + '","View pin")',
  title: pin.title,
  creator: pin.creatorName,
  domain: pin.domain,
  imageLink: pin.imageUrl ? '=HYPERLINK("' + pin.imageUrl.replace(/"/g, '""') + '","View image")' : '',
  saves: pin.saveCount,
  repins: pin.repinCount,
  pinId: pin.pinId,
  snapshotKey: pin.snapshotKey
}));
return [{ json: { config, isBaseline, monitorStage, historyDates, pendingSnapshotCount, counts, queryStats, compared, evidencePins, visionPins, sourcePins, sheetRows, snapshotRows: current } }];`
  }),
  node('50000000-', 29, 'Needs Today\'s Brief', 'n8n-nodes-base.if', 2.2, [640, 0], hasItemsParameters('={{ $json.pendingSnapshotCount }}')),
  node('50000000-', 30, 'No New Snapshot Needed', 'n8n-nodes-base.code', 2, [880, 220], {
    jsCode: String.raw`const analysis = $('Compare Search Snapshots').first().json;
return [{ json: { status: 'No new Pinterest brief needed', reason: 'The same dated search snapshot was already delivered.', snapshotDate: analysis.compared[0]?.snapshotDate || '' } }];`
  }),
  node('50000000-', 12, '3. Generate Weekly Content Brief', '@n8n/n8n-nodes-langchain.openAi', 2.3, [880, 0], pinterestVisionParameters()),
  node('50000000-', 13, 'Validate and Format Pinterest Brief', 'n8n-nodes-base.code', 2, [1120, 0], {
    jsCode: `${parseStructured}
const analysis = $('Compare Search Snapshots').first().json;
const brief = parseStructured($input.first().json, ['decisionStatus', 'monitorStage', 'confidence', 'summary', 'queryAssessments', 'pinAssessments', 'patterns', 'opportunities', 'avoid', 'nextActions', 'recommendedQueries']);
if (!brief || brief.queryAssessments?.length !== 5 || brief.pinAssessments?.length !== 10 || brief.patterns?.length !== 4 || !Array.isArray(brief.opportunities) || brief.avoid?.length !== 3 || brief.nextActions?.length !== 4 || brief.recommendedQueries?.length !== 5) throw new Error('OpenAI returned an invalid Pinterest monitor brief.');
if (brief.monitorStage !== analysis.monitorStage) throw new Error('OpenAI monitor stage does not match the available history.');
if (analysis.monitorStage === 'baseline') {
  brief.queryAssessments.forEach((item) => { item.movementSignal = 'baseline'; });
  brief.patterns.forEach((item) => { item.stage = 'current'; });
}
if (analysis.monitorStage === 'comparison') brief.patterns.forEach((item) => { if (item.stage === 'emerging') item.stage = 'recurring'; });
const visionById = new Map(analysis.visionPins.map((pin) => [String(pin.evidenceId), pin]));
const assessedIds = brief.pinAssessments.map((item) => String(item.pinId));
if (new Set(assessedIds).size !== 10 || assessedIds.some((pinId) => !visionById.has(pinId))) throw new Error('OpenAI did not assess each supplied Pinterest image exactly once.');
const configuredQueries = new Set(analysis.config.queries.map((query) => query.toLowerCase()));
if (new Set(brief.queryAssessments.map((item) => String(item.query).toLowerCase())).size !== 5 || brief.queryAssessments.some((item) => !configuredQueries.has(String(item.query).toLowerCase()))) throw new Error('OpenAI query assessment does not match the configured queries.');
const assessmentsById = new Map(brief.pinAssessments.map((item) => [String(item.pinId), item]));
const relevantIds = new Set(brief.pinAssessments.filter((item) => item.relevant).map((item) => String(item.pinId)));
const relevantCountByQuery = new Map(analysis.config.queries.map((query) => [query.toLowerCase(), analysis.visionPins.filter((pin) => pin.query.toLowerCase() === query.toLowerCase() && relevantIds.has(String(pin.evidenceId))).length]));
const expectedStatus = relevantIds.size >= analysis.config.minRelevantPins ? 'ready' : 'insufficient_evidence';
if (brief.decisionStatus !== expectedStatus) throw new Error('OpenAI decision status does not match the evidence threshold.');
if (expectedStatus === 'ready' && brief.opportunities.length !== 3) throw new Error('A ready Pinterest brief must contain exactly three concepts.');
if (expectedStatus === 'insufficient_evidence' && brief.opportunities.length !== 0) throw new Error('An insufficient-evidence brief must not contain concepts.');
const validIds = new Set(assessedIds);
const assertSources = (items, relevantOnly = false) => {
  for (const item of items) {
    if (!Array.isArray(item.sourcePinIds) || item.sourcePinIds.length < 1 || item.sourcePinIds.some((pinId) => !validIds.has(String(pinId)) || (relevantOnly && !relevantIds.has(String(pinId))))) throw new Error('OpenAI cited unsupported Pinterest evidence.');
  }
};
assertSources(brief.patterns);
assertSources(brief.avoid);
assertSources(brief.opportunities, true);
const queryCounts = [...relevantCountByQuery.values()];
const effectiveConfidence = relevantIds.size >= 8 && queryCounts.every((count) => count >= 1) ? brief.confidence : brief.confidence === 'low' ? 'low' : 'medium';
const countedSummary = String(brief.summary).replace(/^(?:zero|one|two|three|four|five|six|seven|eight|nine|\\d+)(?:\\s+of\\s+(?:nine|9))?\\s+pins?\\s+(?:are|were)\\s+relevant[^.]*\\.\\s*/i, '').trim();
const summaryText = relevantIds.size + ' of 10 visually assessed pins were relevant. ' + countedSummary;
const pinLinks = (ids) => ids.map((pinId) => visionById.get(String(pinId))?.pinUrl).filter(Boolean).join(' | ');
const cleanSearchText = (value, fallback) => {
  let text = String(value || '').trim();
  if (analysis.config.locale.toLowerCase().startsWith('en')) text = text.replace(/[^\\x20-\\x7E]/g, ' ');
  text = text.replace(/\\s+/g, ' ').replace(/^[\\s:;,.!?-]+|[\\s:;,.!?-]+$/g, '').trim();
  if (!/[A-Za-z0-9]/.test(text)) return fallback;
  return text || fallback;
};
const blocks = [];
const add = (type, textContent = '', url = '') => blocks.push({ type, textContent, url });
const heading = (text) => add('heading_2', text);
const bullet = (text) => add('bulleted_list_item', text);
add('paragraph', 'Generated ' + new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Lisbon' }) + '. Ten current pin images were assessed from ' + analysis.compared.length + ' complete search results.');
heading("This week's decision");
add('paragraph', (brief.decisionStatus === 'ready' ? 'READY TO TEST' : 'INSUFFICIENT EVIDENCE') + ' | ' + brief.monitorStage.toUpperCase() + ' | Confidence: ' + effectiveConfidence.toUpperCase() + '\\n' + summaryText);
heading('Monitoring status');
add('paragraph', relevantIds.size + ' of 10 visually assessed pins were relevant. Earlier snapshots: ' + analysis.historyDates.length + '.\\nDecision: ' + analysis.config.decisionToMake + '\\nPublication or offer: ' + analysis.config.offer + '\\nAudience: ' + analysis.config.targetAudience + '\\nStyle: ' + analysis.config.brandStyle + '\\nConstraints: ' + analysis.config.constraints);
brief.queryAssessments.forEach((item) => {
  const replacement = cleanSearchText(item.recommendedReplacement, 'Keep this query');
  const stats = analysis.queryStats.find((entry) => entry.query.toLowerCase() === String(item.query).toLowerCase());
  bullet(item.query + ' — ' + item.movementSignal.replace('_', ' ').toUpperCase() + ' | ' + relevantCountByQuery.get(String(item.query).toLowerCase()) + ' relevant images | New ' + stats.newPins + ', rising ' + stats.risingPins + ', falling ' + stats.fallingPins + ', repeated ' + stats.repeatedPins + '. ' + item.verdict + ' Next search: ' + replacement);
});
heading('Search landscape and movement');
brief.patterns.forEach((item) => bullet(item.stage.toUpperCase() + ' | ' + item.pattern + ' — ' + item.observation + ' Evidence: ' + pinLinks(item.sourcePinIds)));
heading(brief.decisionStatus === 'ready' ? 'What to publish next' : 'Recommendations withheld');
const opportunitySlots = brief.decisionStatus === 'ready' ? brief.opportunities : [
  { title: 'No product concept generated', productOrFormat: 'Evidence gate stopped the workflow', audienceIntent: 'The current results do not reliably represent the intended buyer.', concept: 'Refine the searches below and run the workflow again.', differentiation: 'This prevents generic ideas from being mistaken for research findings.', visualBrief: { composition: 'Not generated', typography: 'Not generated', palette: 'Not generated', imagery: 'Not generated' }, pinterestTitle: 'Not generated', pinterestDescription: 'Not generated', keywords: [], confidence: 'low', sourcePinIds: [] },
  { title: 'Why it stopped', productOrFormat: relevantIds.size + ' relevant pins', audienceIntent: 'At least ' + analysis.config.minRelevantPins + ' are required.', concept: 'Ambiguous or unrelated visual results were rejected.', differentiation: 'Only evidence-backed recommendations are allowed.', visualBrief: { composition: 'Review rejected pins below', typography: 'Review rejected pins below', palette: 'Review rejected pins below', imagery: 'Review rejected pins below' }, pinterestTitle: 'Not generated', pinterestDescription: 'Not generated', keywords: [], confidence: 'low', sourcePinIds: [] },
  { title: 'How to continue', productOrFormat: 'Run a focused follow-up search', audienceIntent: 'Use the recommended queries in this report.', concept: 'Replace broad or ambiguous terms with product, audience, style, and occasion language.', differentiation: 'The next run should contain enough cohesive evidence to support concepts.', visualBrief: { composition: 'Not generated', typography: 'Not generated', palette: 'Not generated', imagery: 'Not generated' }, pinterestTitle: 'Not generated', pinterestDescription: 'Not generated', keywords: [], confidence: 'low', sourcePinIds: [] }
];
opportunitySlots.forEach((item) => {
  const itemConfidence = effectiveConfidence === 'medium' && item.confidence === 'high' ? 'medium' : item.confidence;
  add('heading_3', item.title);
  add('paragraph', 'Product or format: ' + item.productOrFormat + '\\nAudience intent: ' + item.audienceIntent + '\\nConcept: ' + item.concept + '\\nWhy it is different: ' + item.differentiation + '\\nConfidence: ' + itemConfidence.toUpperCase());
  add('paragraph', 'Visual brief\\nComposition: ' + item.visualBrief.composition + '\\nTypography: ' + item.visualBrief.typography + '\\nPalette: ' + item.visualBrief.palette + '\\nImagery: ' + item.visualBrief.imagery);
  add('paragraph', 'Pinterest draft\\nTitle: ' + item.pinterestTitle + '\\nDescription: ' + item.pinterestDescription + '\\nKeywords: ' + item.keywords.join(', '));
  add('paragraph', item.sourcePinIds.length ? 'Supporting pins: ' + pinLinks(item.sourcePinIds) : 'Supporting pins: none — the evidence gate stopped concept generation.');
});
heading('Watch list');
brief.avoid.forEach((item) => bullet(item.concept + ' — ' + item.reason + ' Evidence: ' + pinLinks(item.sourcePinIds)));
heading('Next actions');
brief.nextActions.forEach((item) => add('to_do', item));
heading('Queries for the next run');
brief.recommendedQueries.forEach((item) => bullet(cleanSearchText(item, 'Use a more specific product, audience, and style query')));
heading('Source evidence');
const relevantSourcePins = analysis.visionPins.filter((pin) => relevantIds.has(String(pin.evidenceId))).sort((a, b) => a.position - b.position).slice(0, 3);
const rejectedSourcePins = analysis.visionPins.filter((pin) => !relevantIds.has(String(pin.evidenceId))).sort((a, b) => a.position - b.position).slice(0, 2);
const sourcePins = [...relevantSourcePins, ...rejectedSourcePins];
for (const pin of analysis.visionPins) {
  if (sourcePins.length === 5) break;
  if (!sourcePins.some((candidate) => candidate.pinId === pin.pinId)) sourcePins.push(pin);
}
sourcePins.forEach((pin) => {
  const assessment = assessmentsById.get(String(pin.evidenceId));
  add('image', '', pin.imageUrl);
  add('paragraph', (assessment.relevant ? 'RELEVANT' : 'REJECTED') + ' | ' + pin.query + ' #' + pin.position + '\\n' + pin.title + '\\n' + assessment.visualDescription + '\\nWhy: ' + assessment.relevanceReason + '\\n' + pin.pinUrl);
});
heading('Method and limits');
add('paragraph', (analysis.monitorStage === 'baseline' ? 'This is the first baseline; it describes only the current search landscape. ' : analysis.monitorStage === 'comparison' ? 'This is an early comparison with one earlier snapshot; changes are signals, not trends. ' : 'Momentum labels require at least two earlier snapshots, but still describe search-result visibility rather than search demand. ') + 'Pinterest search position and visible pin content are observations, not proof of popularity, market demand, or sales. Missing saves and repins remain unknown. Recommendations are original hypotheses to test.');
if (blocks.length !== 59) throw new Error('Pinterest Notion brief block count changed unexpectedly.');
return [{ json: { title: analysis.config.researchName + ' - ' + analysis.compared[0].snapshotDate, notionBlocks: blocks, sheetRows: analysis.sheetRows, snapshotRows: analysis.snapshotRows, summary: summaryText, decisionStatus: brief.decisionStatus, relevantPinCount: relevantIds.size } }];`
  }),
  node('50000000-', 14, 'Expand Pinterest Evidence Rows', 'n8n-nodes-base.code', 2, [1360, 0], {
    jsCode: 'return $json.sheetRows.map((row) => ({ json: row }));'
  }),
  node('50000000-', 15, '4. Save Pinterest Evidence to Google Sheets', 'n8n-nodes-base.googleSheets', 4.7, [1600, 0], {
    operation: 'appendOrUpdate',
    documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: 'Pinterest Search' },
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['Snapshot key'],
      value: {
        'Snapshot at': '={{ $json.snapshotAt }}', Query: '={{ $json.query }}', Position: '={{ $json.position }}',
        'Previous position': '={{ $json.previousPosition }}', Movement: '={{ $json.movement }}', Status: '={{ $json.status }}',
        Pin: '={{ $json.pinLink }}', Title: '={{ $json.title }}', Creator: '={{ $json.creator }}', Domain: '={{ $json.domain }}',
        Image: '={{ $json.imageLink }}', Saves: '={{ $json.saves }}', Repins: '={{ $json.repins }}',
        'Pinterest pin ID': '={{ $json.pinId }}', 'Snapshot key': '={{ $json.snapshotKey }}'
      },
      schema: ['Snapshot at', 'Query', 'Position', 'Previous position', 'Movement', 'Status', 'Pin', 'Title', 'Creator', 'Domain', 'Image', 'Saves', 'Repins', 'Pinterest pin ID', 'Snapshot key'].map((field) => ({
        id: field, displayName: field, required: false, defaultMatch: field === 'Snapshot key', display: true,
        type: ['Snapshot at', 'Position', 'Previous position', 'Movement', 'Saves', 'Repins'].includes(field) ? 'number' : 'string', canBeUsedToMatch: true
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: { useAppend: true }
  }),
  node('50000000-', 16, 'Continue After Evidence Sheet', 'n8n-nodes-base.code', 2, [1840, 0], {
    jsCode: String.raw`return [{ json: $('Validate and Format Pinterest Brief').first().json }];`
  }),
  node('50000000-', 17, '5. Create Pinterest Brief in Notion', 'n8n-nodes-base.notion', 2.2, [2080, 0], {
    authentication: 'apiKey',
    resource: 'databasePage',
    operation: 'create',
    databaseId: { __rl: true, mode: 'id', value: '00000000-0000-0000-0000-000000000000' },
    title: '={{ $json.title }}',
    simple: true,
    propertiesUi: { propertyValues: [] },
    blockUi: { blockValues: pinterestNotionBlockTypes.map((type, index) => type === 'image' ? {
      type,
      url: `={{ $json.notionBlocks[${index}].url }}`
    } : {
      type,
      richText: false,
      textContent: `={{ $json.notionBlocks[${index}].textContent }}`
    }) },
    options: {}
  }),
  node('50000000-', 18, 'Prepare Pinterest Snapshot Commit', 'n8n-nodes-base.code', 2, [2320, 0], {
    jsCode: String.raw`return $('Validate and Format Pinterest Brief').first().json.snapshotRows.map((row) => ({ json: row }));`
  }),
  node('50000000-', 19, 'Commit Pinterest Search Snapshot', 'n8n-nodes-base.dataTable', 1.1, [2560, 0], pinterestSnapshotUpsertParameters()),
  node('50000000-', 20, 'Pinterest Brief Ready', 'n8n-nodes-base.code', 2, [2800, 0], {
    jsCode: String.raw`const page = $('5. Create Pinterest Brief in Notion').first().json;
const brief = $('Validate and Format Pinterest Brief').first().json;
return [{ json: { status: brief.decisionStatus === 'ready' ? 'Pinterest concepts ready to test' : 'Pinterest evidence needs better queries', decisionStatus: brief.decisionStatus, relevantPinCount: brief.relevantPinCount, title: brief.title, notionUrl: page.url || '', summary: brief.summary, evidenceRows: brief.sheetRows.length } }];`
  }),
  sticky('50000000-', 21, 'Workflow Overview', [-2240, -320], 400, 960, `## Weekly Pinterest Search Momentum Monitor

### How it works

1. Starts manually or every Monday morning and creates a durable Pinterest search snapshot table.
2. Runs FetchCat Pinterest Search Scraper for five tracked queries and rejects incomplete datasets before analysis.
3. Compares every result with dated history. Run one is a baseline, run two is an early comparison, and momentum labels require at least two earlier snapshots.
4. Visually assesses ten balanced current pins and summarizes query-level new, rising, falling, steady, and repeated results.
5. Produces three evidence-linked content briefs, a watch list, and next actions. Sheets and Notion are written before the snapshot is committed.

### Setup steps

- [ ] Add \`fetch_cat/pinterest-search-scraper\` to your Apify account if required.
- [ ] Create HTTP Header Auth with \`Authorization: Bearer YOUR_APIFY_TOKEN\` and select it in all three FetchCat request nodes.
- [ ] Connect OpenAI in 3. Generate Weekly Content Brief.
- [ ] Create a Pinterest Search sheet with the documented headers and select it in 4. Save Pinterest Evidence to Google Sheets.
- [ ] Connect Notion, share a database with the integration, and select it in 5. Create Pinterest Brief in Notion.
- [ ] Edit the decision, publication or offer, audience, style, constraints, and exactly five tracked queries in 1. Set Your Pinterest Research.

### Accuracy controls

The workflow never treats search-result movement as demand growth. Baselines cannot claim movement; one comparison cannot claim an emerging pattern. Ten images are assessed for meaning, and incomplete query results stop the run. Missing public saves and repins remain unknown.`, 1),
  sticky('50000000-', 22, 'Start and configure', [-1808, -256], 576, 432, '## Start and configure\n\nStarts manually or weekly, creates the snapshot table, and exposes all editable research settings in one clearly numbered node.', 7),
  sticky('50000000-', 23, 'Run FetchCat Pinterest scraper', [-1088, -128], 624, 304, '## Run FetchCat Pinterest scraper\n\nValidates the setup and runs `fetch_cat/pinterest-search-scraper` through Cloud-compatible HTTP Request nodes.', 7),
  sticky('50000000-', 24, 'Collect and normalize pins', [-416, -128], 528, 304, '## Collect and normalize pins\n\nDownloads the completed Apify dataset, validates every tracked query, rejects malformed results, deduplicates query and pin IDs, and selects ten balanced images.', 7),
  sticky('50000000-', 25, 'Compare dated snapshots', [112, -128], 528, 304, '## Compare dated snapshots\n\nBuilds baseline, comparison, or momentum context and calculates new, rising, falling, steady, and repeated search-result evidence.', 7),
  sticky('50000000-', 26, 'Assess evidence and decide', [592, -128], 816, 496, '## Assess evidence and decide\n\nOne structured vision request assesses ten current images plus rank history. It creates three content briefs only after relevance passes and limits trend language to the available history.', 7),
  sticky('50000000-', 27, 'Save readable evidence', [1312, -128], 672, 304, '## Save readable evidence\n\nUpserts sortable, linked Google Sheets rows. Same-day retries use Snapshot key to avoid duplicate evidence.', 7),
  sticky('50000000-', 28, 'Publish brief and commit snapshot', [2032, -128], 912, 304, '## Publish brief and commit snapshot\n\nCreates the Notion brief first, then commits the dated Data Table snapshot so failed destination writes remain retryable.', 7)
];

const pinterestWorkflow = workflow(
  'Weekly Pinterest Search Momentum Monitor',
  pinterestNodes,
  connectionMap([
    ['Manual Trigger', 'Ensure Pinterest Snapshot Table'],
    ['Weekly Schedule', 'Ensure Pinterest Snapshot Table'],
    ['Ensure Pinterest Snapshot Table', '1. Set Your Pinterest Research'],
    ['1. Set Your Pinterest Research', 'Build Pinterest Actor Input'],
    ['Build Pinterest Actor Input', '2. Search Pinterest with FetchCat'],
    ['2. Search Pinterest with FetchCat', 'Wait for Queued Pinterest Run'],
    ['Wait for Queued Pinterest Run', 'Validate Pinterest Actor Run'],
    ['Validate Pinterest Actor Run', 'Get Pinterest Search Results'],
    ['Get Pinterest Search Results', 'Normalize Pinterest Pins'],
    ['Normalize Pinterest Pins', 'Load Previous Pinterest Snapshots'],
    ['Load Previous Pinterest Snapshots', 'Compare Search Snapshots'],
    ['Compare Search Snapshots', 'Needs Today\'s Brief'],
    ['Needs Today\'s Brief', '3. Generate Weekly Content Brief'],
    ['Needs Today\'s Brief', 'No New Snapshot Needed', 0, 1],
    ['3. Generate Weekly Content Brief', 'Validate and Format Pinterest Brief'],
    ['Validate and Format Pinterest Brief', 'Expand Pinterest Evidence Rows'],
    ['Expand Pinterest Evidence Rows', '4. Save Pinterest Evidence to Google Sheets'],
    ['4. Save Pinterest Evidence to Google Sheets', 'Continue After Evidence Sheet'],
    ['Continue After Evidence Sheet', '5. Create Pinterest Brief in Notion'],
    ['5. Create Pinterest Brief in Notion', 'Prepare Pinterest Snapshot Commit'],
    ['Prepare Pinterest Snapshot Commit', 'Commit Pinterest Search Snapshot'],
    ['Commit Pinterest Search Snapshot', 'Pinterest Brief Ready']
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
      version: '2.5.1',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Google Sheets', 'Slack', 'n8n Data Tables'],
      testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 3.34 },
      releaseState: 'qa-passed'
    }
  },
  {
    slug: 'pinterest-search-opportunities-brief',
    workflow: pinterestWorkflow,
    metadata: {
      slug: 'pinterest-search-opportunities-brief',
      title: 'Weekly Pinterest Search Momentum Monitor',
      workflowKind: 'actor-template',
      actorId: 'FtsA7YTDVGAJ83XiS',
      actorSlug: 'fetch_cat/pinterest-search-scraper',
      version: '3.0.1',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Google Sheets', 'Notion', 'n8n Data Tables'],
      testLimits: { actorItems: 50, apifyBackedExecutions: 3, budgetUsd: 3.33 },
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
