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

const pinterestResearchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'themes', 'underrepresentedAngles', 'contentTests'],
  properties: {
    executiveSummary: { type: 'string', minLength: 1, maxLength: 1200 },
    themes: {
      type: 'array', minItems: 4, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'insight', 'matchTerms', 'evidencePinIds'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          insight: { type: 'string', minLength: 1, maxLength: 500 },
          matchTerms: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'string', minLength: 2, maxLength: 80 } },
          evidencePinIds: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string', minLength: 1 } }
        }
      }
    },
    underrepresentedAngles: {
      type: 'array', minItems: 3, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['angle', 'sampleObservation', 'contentOpportunity', 'evidencePinIds'],
        properties: {
          angle: { type: 'string', minLength: 1, maxLength: 180 },
          sampleObservation: { type: 'string', minLength: 1, maxLength: 500 },
          contentOpportunity: { type: 'string', minLength: 1, maxLength: 500 },
          evidencePinIds: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string', minLength: 1 } }
        }
      }
    },
    contentTests: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['proposedPinTitle', 'visualConcept', 'format', 'audienceProblem', 'differentiatingAngle', 'destinationContent', 'observedPhrases', 'suggestedSearchExpansions', 'evidencePinIds'],
        properties: {
          proposedPinTitle: { type: 'string', minLength: 1, maxLength: 180 },
          visualConcept: { type: 'string', minLength: 1, maxLength: 350 },
          format: { type: 'string', minLength: 1, maxLength: 100 },
          audienceProblem: { type: 'string', minLength: 1, maxLength: 350 },
          differentiatingAngle: { type: 'string', minLength: 1, maxLength: 350 },
          destinationContent: { type: 'string', minLength: 1, maxLength: 350 },
          observedPhrases: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string', minLength: 2, maxLength: 80 } },
          suggestedSearchExpansions: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string', minLength: 2, maxLength: 100 } },
          evidencePinIds: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1 } }
        }
      }
    }
  }
};

const pinterestResearchNodes = [
  node('51000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1760, 80], {}),
  node('51000000-', 3, '1. Set Your Research Niche', 'n8n-nodes-base.set', 3.4, [-1520, 80], {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments: [
      { id: 'pinterest-niche', name: 'niche', value: 'female cycling', type: 'string' },
      { id: 'pinterest-queries', name: 'searches', value: 'female cycling', type: 'string' },
      { id: 'pinterest-locale', name: 'locale', value: 'en-US', type: 'string' },
      { id: 'pinterest-country', name: 'country', value: 'US', type: 'string' },
      { id: 'pinterest-limit', name: 'maxResultsPerSearch', value: 100, type: 'number' },
      { id: 'pinterest-details', name: 'includePinDetails', value: true, type: 'boolean' }
    ] },
    options: {}
  }),
  node('51000000-', 4, 'Build FetchCat Research Input', 'n8n-nodes-base.code', 2, [-1280, 80], {
    jsCode: String.raw`const input = $input.first()?.json;
if (!input) throw new Error('Configure 1. Set Your Research Niche.');
const niche = String(input.niche || '').trim();
if (niche.length < 2 || niche.length > 120) throw new Error('Research niche must contain 2 to 120 characters.');
const queries = String(input.searches || niche).split(/[\n,]+/).map((value) => value.trim()).filter(Boolean);
if (queries.length < 1 || queries.length > 5) throw new Error('Configure between one and five search phrases, separated by commas or new lines.');
if (new Set(queries.map((query) => query.toLowerCase())).size !== queries.length) throw new Error('Search phrases must be unique.');
if (queries.some((query) => query.length < 2 || query.length > 150)) throw new Error('Each search phrase must contain 2 to 150 characters.');
const maxResultsPerQuery = Math.max(20, Math.min(Number(input.maxResultsPerSearch) || 100, 500));
return [{ json: {
  config: { niche, queries, maxResultsPerQuery },
  actorInput: {
    queries,
    maxResultsPerQuery,
    includePinDetails: Boolean(input.includePinDetails),
    locale: String(input.locale || 'en-US').trim(),
    country: String(input.country || 'US').trim()
  }
} }];`
  }),
  node('51000000-', 5, '2. Collect Pinterest Results with FetchCat', 'n8n-nodes-base.httpRequest', 4.3, [-1040, 80], {
    method: 'POST',
    url: 'https://api.apify.com/v2/acts/FtsA7YTDVGAJ83XiS/run-sync-get-dataset-items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Accept-Encoding', value: 'identity' }] },
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'clean', value: 'true' },
      { name: 'format', value: 'json' },
      { name: 'timeout', value: '300' }
    ] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ $json.actorInput }}',
    options: { timeout: 310000, response: { response: { responseFormat: 'json' } } }
  }),
  node('51000000-', 9, 'Normalize and Deduplicate Pins', 'n8n-nodes-base.code', 2, [-800, 80], {
    jsCode: String.raw`const config = $('Build FetchCat Research Input').first().json.config;
const payload = $input.all().flatMap((item) => {
  const value = item.json?.data ?? item.json;
  return Array.isArray(value) ? value : [value];
});
const researchAt = new Date().toISOString();
const researchDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
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
  const description = String(pin.description || '').trim();
  unique.set(key, {
    researchDate,
    researchAt,
    query,
    pinId,
    position,
    title: (!rawTitle || ['pin', 'pinterest'].includes(rawTitle.toLowerCase()) ? description : rawTitle).slice(0, 220) || 'Untitled Pinterest pin',
    pinUrl,
    description: description.slice(0, 1000),
    imageUrl: String(pin.imageUrl || pin.thumbnailUrl || '').trim(),
    creatorName: String(pin.creatorName || pin.creatorUsername || '').trim(),
    boardName: String(pin.boardName || '').trim(),
    domain: String(pin.domain || '').trim(),
    outboundUrl: String(pin.outboundUrl || '').trim(),
    isVideo: Boolean(pin.isVideo),
    saveCount: pin.saveCount !== null && pin.saveCount !== undefined && pin.saveCount !== '' && Number.isFinite(Number(pin.saveCount)) ? Number(pin.saveCount) : null,
    repinCount: pin.repinCount !== null && pin.repinCount !== undefined && pin.repinCount !== '' && Number.isFinite(Number(pin.repinCount)) ? Number(pin.repinCount) : null
  });
}
const pins = [...unique.values()].sort((a, b) => a.query.localeCompare(b.query) || a.position - b.position);
const returnedQueries = new Set(pins.map((row) => row.query.toLowerCase()));
const emptyQueries = config.queries.filter((query) => !returnedQueries.has(query.toLowerCase()));
if (emptyQueries.length) throw new Error('Pinterest returned no usable pins for: ' + emptyQueries.join(', ') + '. Refine those searches and retry.');
if (pins.length < 10) throw new Error('Pinterest returned fewer than ten usable pins. Broaden the research niche and retry.');
return pins.map((json) => ({ json }));`
  }),
  node('51000000-', 10, 'Build Research Evidence', 'n8n-nodes-base.code', 2, [-560, 80], {
    jsCode: String.raw`const pins = $input.all().map((item) => item.json);
const config = $('Build FetchCat Research Input').first().json.config;
const sheetsEpochOffset = 25569;
const researchSerial = new Date(pins[0].researchAt).getTime() / 86400000 + sheetsEpochOffset;
const escapeFormula = (value) => String(value || '').replace(/"/g, '""');
const sourceRows = pins.map((pin) => {
  return {
    researchAt: researchSerial,
    niche: config.niche,
    query: pin.query,
    position: pin.position,
    pinLink: '=HYPERLINK("' + escapeFormula(pin.pinUrl) + '","View pin")',
    title: pin.title,
    description: pin.description,
    creator: pin.creatorName,
    board: pin.boardName,
    domain: pin.domain,
    destinationLink: pin.outboundUrl ? '=HYPERLINK("' + escapeFormula(pin.outboundUrl) + '","Open destination")' : '',
    imageLink: pin.imageUrl ? '=HYPERLINK("' + escapeFormula(pin.imageUrl) + '","View image")' : '',
    format: pin.isVideo ? 'Video' : 'Image',
    saves: pin.saveCount,
    repins: pin.repinCount,
    pinId: pin.pinId,
    researchKey: pins[0].researchDate + '|' + config.niche.toLowerCase() + '|' + pin.query.toLowerCase() + '|' + pin.pinId
  };
});
const stopWords = new Set('a an and are as at be by for from how in into is it of on or that the this to with you your pinterest pin ideas'.split(' '));
const phraseCounts = new Map();
for (const pin of pins) {
  const words = (pin.title + ' ' + pin.description).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word));
  const phrases = new Set();
  for (let i = 0; i < words.length - 1; i += 1) phrases.add(words[i] + ' ' + words[i + 1]);
  for (const phrase of phrases) phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
}
const recurringPhrases = [...phraseCounts].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([phrase, count]) => ({ phrase, pins: count }));
const compactPins = [];
let packetSize = 0;
for (const pin of pins) {
  const compact = { pinId: pin.pinId, query: pin.query, position: pin.position, title: pin.title.slice(0, 180), description: pin.description.slice(0, 260), creator: pin.creatorName, domain: pin.domain, format: pin.isVideo ? 'Video' : 'Image' };
  const size = JSON.stringify(compact).length;
  if (packetSize + size > 105000) break;
  compactPins.push(compact);
  packetSize += size;
}
const stats = {
  niche: config.niche,
  searches: config.queries,
  totalPins: pins.length,
  analyzedPins: compactPins.length,
  uniqueCreators: new Set(pins.map((pin) => pin.creatorName).filter(Boolean).map((value) => value.toLowerCase())).size,
  uniqueDomains: new Set(pins.map((pin) => pin.domain).filter(Boolean).map((value) => value.toLowerCase())).size,
  imagePins: pins.filter((pin) => !pin.isVideo).length,
  videoPins: pins.filter((pin) => pin.isVideo).length,
  pinsWithSaveData: pins.filter((pin) => pin.saveCount !== null).length
};
return [{ json: { stats, sourceRows, pins, researchPacket: { stats, recurringPhrases, pins: compactPins } } }];`
  }),
  node('51000000-', 11, '3. Analyze Content Landscape and Opportunities', '@n8n/n8n-nodes-langchain.openAi', 2.3, [-320, 80], openAiParameters(
    '=Research niche: {{ $json.stats.niche }}\n\nAnalyze this Pinterest evidence:\n{{ JSON.stringify($json.researchPacket) }}',
    'pinterest_content_opportunity_research',
    pinterestResearchSchema,
    'Analyze only the supplied Pinterest results. Identify recurring content themes, underrepresented angles in this sample, and five production-ready content tests. Every evidencePinId must exactly match a supplied pinId. matchTerms and observedPhrases must be literal phrases found in supplied titles or descriptions. suggestedSearchExpansions are brainstorming prompts, not verified Pinterest keywords, and must never be described as popular, trending, high-volume, or demanded. Use concise natural English. Never claim search volume, trend growth, engagement, clicks, sales, or demand. Return the strict schema.',
    7000
  )),
  node('51000000-', 20, 'Keep Only Supplied Evidence Citations', 'n8n-nodes-base.code', 2, [-80, 80], {
    jsCode: `${parseStructured}\nconst evidence = $('Build Research Evidence').first().json;\nconst parsed = parseStructured($input.first().json, ['executiveSummary', 'themes', 'underrepresentedAngles', 'contentTests']);\nif (!parsed) throw new Error('OpenAI returned an invalid Pinterest research report.');\nconst suppliedIds = new Set(evidence.pins.map((pin) => String(pin.pinId)));\nlet discardedInvalidCitations = 0;\nfor (const item of [...parsed.themes, ...parsed.underrepresentedAngles, ...parsed.contentTests]) {\n  if (!Array.isArray(item.evidencePinIds) || item.evidencePinIds.length === 0) throw new Error('A Pinterest finding has no evidence pins.');\n  const validIds = [...new Set(item.evidencePinIds.map(String).filter((pinId) => suppliedIds.has(pinId)))];\n  discardedInvalidCitations += item.evidencePinIds.length - validIds.length;\n  if (validIds.length === 0) throw new Error('A Pinterest finding cites no supplied pins.');\n  item.evidencePinIds = validIds;\n}\nreturn [{ json: { ...parsed, discardedInvalidCitations } }];`
  }),
  node('51000000-', 12, 'Validate Evidence and Build Report', 'n8n-nodes-base.code', 2, [160, 80], {
    jsCode: `${parseStructured}\nconst evidence = $('Build Research Evidence').first().json;\nconst parsed = parseStructured($input.first().json, ['executiveSummary', 'themes', 'underrepresentedAngles', 'contentTests']);\nif (!parsed || !Array.isArray(parsed.themes) || !Array.isArray(parsed.underrepresentedAngles) || !Array.isArray(parsed.contentTests) || parsed.contentTests.length !== 5) throw new Error('OpenAI returned an invalid Pinterest research report.');\nconst byId = new Map(evidence.pins.map((pin) => [String(pin.pinId), pin]));\nconst validateEvidence = (items) => {\n  for (const item of items) {\n    if (!Array.isArray(item.evidencePinIds) || item.evidencePinIds.length === 0) throw new Error('A Pinterest finding has no evidence pins.');\n    if (item.evidencePinIds.some((pinId) => !byId.has(String(pinId)))) throw new Error('OpenAI cited a Pinterest pin that was not supplied.');\n  }\n};\nvalidateEvidence(parsed.themes); validateEvidence(parsed.underrepresentedAngles); validateEvidence(parsed.contentTests);\nconst linkEvidence = (ids) => ids.map((id) => byId.get(String(id))).map((pin) => pin.title + ' - ' + pin.pinUrl).join('\\n');\nconst allText = evidence.pins.map((pin) => (pin.title + ' ' + pin.description).toLowerCase());\nconst briefRows = [];\nconst add = (section, finding, evidenceText, matchingPins, order) => briefRows.push({ section, finding, evidence: evidenceText, matchingPins, sortOrder: order });\nadd('Summary', parsed.executiveSummary, evidence.stats.totalPins + ' source pins across ' + evidence.stats.searches.length + ' search phrase(s).', evidence.stats.totalPins, 1);\nparsed.themes.forEach((theme, index) => {\n  const terms = theme.matchTerms.map((term) => String(term).toLowerCase());\n  const count = allText.filter((text) => terms.some((term) => text.includes(term))).length;\n  add('Leading theme', theme.name + ': ' + theme.insight, 'Matched terms: ' + theme.matchTerms.join(', ') + '\\n' + linkEvidence(theme.evidencePinIds), count, 100 + index);\n});\nparsed.underrepresentedAngles.forEach((angle, index) => add('Underrepresented angle', angle.angle + '\\nSample observation: ' + angle.sampleObservation + '\\nContent opportunity: ' + angle.contentOpportunity, linkEvidence(angle.evidencePinIds), null, 200 + index));\nparsed.contentTests.forEach((test, index) => add('Content test', 'Proposed pin title: ' + test.proposedPinTitle + '\\nFormat: ' + test.format + '\\nVisual concept: ' + test.visualConcept + '\\nAudience problem: ' + test.audienceProblem + '\\nDifferentiating angle: ' + test.differentiatingAngle + '\\nDestination content: ' + test.destinationContent + '\\nObserved phrases: ' + test.observedPhrases.join(', ') + '\\nUnvalidated search-expansion ideas: ' + test.suggestedSearchExpansions.join(', '), linkEvidence(test.evidencePinIds), null, 300 + index));\nconst researchSerial = evidence.sourceRows[0].researchAt;\nconst dateKey = evidence.pins[0].researchDate;\nbriefRows.forEach((row) => { row.researchAt = researchSerial; row.niche = evidence.stats.niche; row.researchKey = dateKey + '|' + evidence.stats.niche.toLowerCase() + '|' + row.section.toLowerCase() + '|' + row.sortOrder; });\nreturn [{ json: { ...evidence, analysis: parsed, briefRows } }];`
  }),
  node('51000000-', 13, 'Prepare Pin Rows', 'n8n-nodes-base.code', 2, [400, 80], {
    jsCode: 'return $json.sourceRows.map((row) => ({ json: row }));'
  }),
  node('51000000-', 14, '4. Save Source Pins', 'n8n-nodes-base.googleSheets', 4.7, [640, 80], {
    operation: 'appendOrUpdate',
    documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: 'Pins' },
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['Research key'],
      value: {
        'Research at': '={{ $json.researchAt }}', Niche: '={{ $json.niche }}', Search: '={{ $json.query }}', Position: '={{ $json.position }}',
        Pin: '={{ $json.pinLink }}', Title: '={{ $json.title }}', Description: '={{ $json.description }}', Creator: '={{ $json.creator }}', Board: '={{ $json.board }}', Domain: '={{ $json.domain }}',
        Destination: '={{ $json.destinationLink }}', Image: '={{ $json.imageLink }}', Format: '={{ $json.format }}', Saves: '={{ $json.saves }}', Repins: '={{ $json.repins }}',
        'Pinterest pin ID': '={{ $json.pinId }}', 'Research key': '={{ $json.researchKey }}'
      },
      schema: ['Research at', 'Niche', 'Search', 'Position', 'Pin', 'Title', 'Description', 'Creator', 'Board', 'Domain', 'Destination', 'Image', 'Format', 'Saves', 'Repins', 'Pinterest pin ID', 'Research key'].map((field) => ({
        id: field, displayName: field, required: false, defaultMatch: field === 'Research key', display: true,
        type: ['Research at', 'Position', 'Saves', 'Repins'].includes(field) ? 'number' : 'string', canBeUsedToMatch: true
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: {}
  }),
  { ...node('51000000-', 17, 'Prepare Research Brief Rows', 'n8n-nodes-base.code', 2, [880, 80], {
    jsCode: "return $('Validate Evidence and Build Report').first().json.briefRows.map((row) => ({ json: row }));"
  }), executeOnce: true },
  node('51000000-', 18, '5. Save Research Brief', 'n8n-nodes-base.googleSheets', 4.7, [1120, 80], {
    operation: 'appendOrUpdate', documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: 'Research Brief' },
    columns: { mappingMode: 'defineBelow', matchingColumns: ['Research key'], value: {
      'Research at': '={{ $json.researchAt }}', Niche: '={{ $json.niche }}', Section: '={{ $json.section }}', Finding: '={{ $json.finding }}', Evidence: '={{ $json.evidence }}',
      'Matching pins': '={{ $json.matchingPins }}', 'Sort order': '={{ $json.sortOrder }}', 'Research key': '={{ $json.researchKey }}'
    }, schema: ['Research at', 'Niche', 'Section', 'Finding', 'Evidence', 'Matching pins', 'Sort order', 'Research key'].map((field) => ({
      id: field, displayName: field, required: false, defaultMatch: field === 'Research key', display: true,
      type: ['Research at', 'Matching pins', 'Sort order'].includes(field) ? 'number' : 'string', canBeUsedToMatch: true
    })), attemptToConvertTypes: false, convertFieldsToString: false }, options: {}
  }),
  { ...node('51000000-', 19, 'Research Complete', 'n8n-nodes-base.code', 2, [1360, 80], {
    jsCode: String.raw`const report = $('Validate Evidence and Build Report').first().json;
return [{ json: { status: 'Pinterest content opportunity research saved', ...report.stats, themeRows: report.analysis.themes.length, underrepresentedAngles: report.analysis.underrepresentedAngles.length, contentTests: report.analysis.contentTests.length, discardedInvalidCitations: report.analysis.discardedInvalidCitations || 0, note: 'Findings describe the supplied Pinterest results. Search-expansion ideas are unvalidated brainstorming prompts, not Pinterest keyword or demand data.' } }];`
  }), executeOnce: true },
  sticky('51000000-', 21, 'Workflow Overview', [-2240, -400], 400, 1100, `## Pinterest Content Opportunity Research

### How it works

1. Accepts a niche and one to five Pinterest search phrases.
2. Runs \`fetch_cat/pinterest-search-scraper\` for up to 500 public pins per search.
3. Saves every source pin with its position, creator, board, domain, format, and public metrics.
4. Uses one structured AI request to identify themes, underrepresented angles, and five production-ready content briefs.
5. Removes invalid citations, rejects unsupported findings, and saves the evidence and report to two Google Sheet tabs.

### Setup

- [ ] Edit the niche, searches, locale, country, and result limit in **1. Set Your Research Niche**.
- [ ] Connect Apify HTTP Header Auth in **2. Collect Pinterest Results with FetchCat**.
- [ ] Create \`Pins\` and \`Research Brief\` tabs with the documented headers.
- [ ] Select the same spreadsheet and matching tab in each Google Sheets node.
- [ ] Connect OpenAI in **3. Analyze Content Landscape and Opportunities**.
- [ ] Run manually and inspect the source pins before acting on recommendations.

### Interpretation

Themes and underrepresented angles are grounded in cited pins. Matching counts use literal terms found in titles and descriptions. Suggested search expansions are clearly marked as unvalidated brainstorming prompts. Nothing measures Pinterest search volume, trend growth, clicks, sales, or demand.`, 1),
  sticky('51000000-', 22, 'Configure niche', [-1808, -224], 480, 400, '## Configure niche\n\nEnter one clear research niche and one to five searches. The default collects 100 pins per search; raise it to 500 only when the extra breadth is useful.', 7),
  sticky('51000000-', 23, 'Collect and normalize', [-1328, -224], 720, 400, '## Collect and normalize\n\nFetchCat collects public Pinterest results. The workflow validates IDs, URLs, positions, titles, descriptions, creators, boards, domains, formats, and available save data.', 7),
  sticky('51000000-', 24, 'Build evidence', [-608, -224], 480, 400, '## Build evidence\n\nCreates source rows, recurring phrases, and a bounded evidence packet. Large result sets are capped before the single AI request.', 7),
  sticky('51000000-', 25, 'Analyze and validate', [-128, -224], 480, 400, '## Analyze and validate\n\nOpenAI proposes themes, underrepresented angles, and production briefs using supplied pin IDs. Invalid citations are removed; a finding with no supplied evidence or malformed output stops the workflow before any Sheet write.', 7),
  sticky('51000000-', 26, 'Save research', [352, -224], 1104, 400, '## Save research\n\nWrites source pins and the readable brief to separate tabs. Creator, board, domain, and destination fields remain on each pin when Pinterest exposes them. Date-and-niche keys make same-day reruns update existing research instead of duplicating it.', 7)
];

const pinterestResearchWorkflow = workflow(
  'Analyze Pinterest Content Opportunities with Apify, OpenAI and Google Sheets',
  pinterestResearchNodes,
  connectionMap([
    ['Manual Trigger', '1. Set Your Research Niche'],
    ['1. Set Your Research Niche', 'Build FetchCat Research Input'],
    ['Build FetchCat Research Input', '2. Collect Pinterest Results with FetchCat'],
    ['2. Collect Pinterest Results with FetchCat', 'Normalize and Deduplicate Pins'],
    ['Normalize and Deduplicate Pins', 'Build Research Evidence'],
    ['Build Research Evidence', '3. Analyze Content Landscape and Opportunities'],
    ['3. Analyze Content Landscape and Opportunities', 'Keep Only Supplied Evidence Citations'],
    ['Keep Only Supplied Evidence Citations', 'Validate Evidence and Build Report'],
    ['Validate Evidence and Build Report', 'Prepare Pin Rows'],
    ['Prepare Pin Rows', '4. Save Source Pins'],
    ['4. Save Source Pins', 'Prepare Research Brief Rows'],
    ['Prepare Research Brief Rows', '5. Save Research Brief'],
    ['5. Save Research Brief', 'Research Complete']
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

const vintedNodes = [
  node('50000000-', 1, 'Manual Start Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1840, 100], {}),
  node('50000000-', 2, 'Hourly Alert Trigger', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1840, -100], {
    rule: { interval: [{ field: 'hours', hoursInterval: 1 }] }
  }),
  node('50000000-', 3, 'Create Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-1568, 0], createTableParameters('FetchCat Delivery Ledger', ledgerColumns)),
  node('50000000-', 5, 'Set Vinted Search Parameters', 'n8n-nodes-base.set', 3.4, [-1328, 0], {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments: [
      { id: 'vinted-search', name: 'searchText', value: 'cycling jersey', type: 'string' },
      { id: 'vinted-audience', name: 'audience', value: 'Women', type: 'string' },
      { id: 'vinted-domain', name: 'domain', value: 'www.vinted.fr', type: 'string' },
      { id: 'vinted-min-price', name: 'minimumPrice', value: 0, type: 'number' },
      { id: 'vinted-max-price', name: 'maximumPrice', value: 150, type: 'number' },
      { id: 'vinted-brands', name: 'allowedBrands', value: 'MAAP, Pas Normal Studios, PNS', type: 'string' },
      { id: 'vinted-sizes', name: 'allowedSizes', value: 'S, XS', type: 'string' },
      { id: 'vinted-colors', name: 'allowedColors', value: 'blue, bleu, black, noir, white, blanc, multi, multicolor, multicolour, multicolore, red, rouge, yellow, jaune', type: 'string' },
      { id: 'vinted-brand-ids', name: 'brandIds', value: '', type: 'string' },
      { id: 'vinted-catalog-ids', name: 'catalogIds', value: '', type: 'string' },
      { id: 'vinted-results', name: 'maxResults', value: 10, type: 'number' }
    ] },
    options: {}
  }),
  node('50000000-', 6, 'Validate Search Settings', 'n8n-nodes-base.code', 2, [-848, 0], {
    jsCode: String.raw`const input = $input.first()?.json || {};
const searchText = String(input.searchText || '').trim();
const domain = String(input.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
const minimumPrice = Number(input.minimumPrice ?? 0);
const maximumPrice = Number(input.maximumPrice ?? 0);
const maxResults = Number(input.maxResults ?? 10);
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const parseList = (value) => String(value || '').split(',').map(normalize).filter(Boolean);
const parseIds = (value, label) => {
  const ids = String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean).map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error(label + ' must contain comma-separated positive numeric Vinted IDs.');
  return [...new Set(ids)];
};
const audienceMap = { any: 'Any', women: 'Women', men: 'Men', girls: 'Girls', boys: 'Boys' };
const audience = audienceMap[normalize(input.audience || 'Any')];
const allowedBrands = parseList(input.allowedBrands);
const allowedSizes = parseList(input.allowedSizes);
const allowedColors = parseList(input.allowedColors);
const brandIds = parseIds(input.brandIds, 'Brand IDs');
const catalogIds = parseIds(input.catalogIds, 'Catalog IDs');
if (searchText.length < 2 || searchText.length > 200) throw new Error('Search text must be 2 to 200 characters.');
if (!audience) throw new Error('Audience must be Any, Women, Men, Girls, or Boys.');
if (!/^www\.vinted\.[a-z.]{2,10}$/.test(domain)) throw new Error('Use a public Vinted domain such as www.vinted.fr, www.vinted.de, or www.vinted.co.uk.');
if (!Number.isFinite(minimumPrice) || minimumPrice < 0) throw new Error('Minimum price must be zero or greater.');
if (!Number.isFinite(maximumPrice) || maximumPrice <= 0 || maximumPrice < minimumPrice) throw new Error('Maximum price must be greater than or equal to minimum price.');
if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) throw new Error('Maximum results must be an integer from 1 to 50.');
const audienceTerm = audience === 'Any' ? '' : audience.toLowerCase();
const searchTerms = new Set(normalize(searchText).split(' ').filter(Boolean));
const actorSearchText = audienceTerm && !searchTerms.has(audienceTerm) ? searchText + ' ' + audienceTerm : searchText;
const monitorKey = [domain, normalize(searchText), audience, minimumPrice, maximumPrice, [...allowedBrands].sort().join(','), [...allowedSizes].sort().join(','), [...allowedColors].sort().join(','), [...brandIds].sort((a, b) => a - b).join(','), [...catalogIds].sort((a, b) => a - b).join(',')].join('|');
const focusedBrands = brandIds.length ? [] : allowedBrands;
const searchCount = Math.max(1, focusedBrands.length);
const itemsPerSearch = Math.ceil(maxResults / searchCount);
const makeActorInput = (focusedBrand = '') => ({
  searchText: focusedBrand ? focusedBrand + ' ' + actorSearchText : actorSearchText,
  domain,
  priceMin: minimumPrice,
  priceMax: maximumPrice,
  maxItems: itemsPerSearch,
  order: 'newest_first',
  includeSeller: true,
  ...(brandIds.length ? { brandIds } : {}),
  ...(catalogIds.length ? { catalogIds } : {})
});
const actorInputs = focusedBrands.length ? focusedBrands.map(makeActorInput) : [makeActorInput()];
return [{ json: {
  searchText, actorSearchText, audience, domain, minimumPrice, maximumPrice, allowedBrands, allowedSizes, allowedColors, brandIds, catalogIds,
  maxResults, monitorKey, searchCount, itemsPerSearch, actorInputs
} }];`
  }),
  node('50000000-', 32, 'Build Brand Search Queries', 'n8n-nodes-base.code', 2, [-608, -96], {
    jsCode: String.raw`const config = $('Validate Search Settings').first().json;
return config.actorInputs.map((actorInput, index) => ({ json: {
  actorInput,
  searchNumber: index + 1,
  searchCount: config.actorInputs.length
} }));`
  }),
  node('50000000-', 8, 'Start FetchCat Vinted Search', 'n8n-nodes-base.httpRequest', 4.3, [-160, -100], {
    method: 'POST',
    url: 'https://api.apify.com/v2/acts/F1GAwbqJ9xc9h7P87/runs',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Accept-Encoding', value: 'identity' }] },
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'waitForFinish', value: '300' }] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ $json.actorInput }}',
    options: { timeout: 310000, response: { response: { responseFormat: 'json' } } }
  }),
  node('50000000-', 9, 'Download Vinted Search Results', 'n8n-nodes-base.httpRequest', 4.3, [80, -100], {
    method: 'GET',
    url: '=https://api.apify.com/v2/datasets/{{ $json.data.defaultDatasetId }}/items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'clean', value: 'true' },
      { name: 'limit', value: '={{ $("Validate Search Settings").first().json.maxResults }}' }
    ] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
  }),
  node('50000000-', 10, 'Normalize and Filter Listings', 'n8n-nodes-base.code', 2, [304, 96], {
    jsCode: String.raw`const config = $('Validate Search Settings').first().json;
const rawListings = $input.all().flatMap((item) => {
  let payload = item.json?.data ?? item.json;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { throw new Error('Apify returned invalid JSON.'); }
  }
  return Array.isArray(payload) ? payload : [payload];
}).slice(0, config.maxResults);
const normalized = [];
const seenListingIds = new Set();
const filterProgress = { validListings: 0, withinPrice: 0, matchingBrand: 0, matchingSize: 0 };
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const containsPhrase = (text, phrase) => (' ' + text + ' ').includes(' ' + phrase + ' ');
for (const listing of rawListings) {
  const id = String(listing.id || '').trim();
  const title = String(listing.title || '').trim();
  const url = String(listing.url || '').trim();
  const priceAmount = Number(listing.priceAmount);
  const brand = String(listing.brandTitle || '').trim();
  const size = String(listing.sizeTitle || '').trim();
  const normalizedTitle = normalize(title);
  const normalizedBrand = normalize(brand);
  const normalizedSize = normalize(size);
  const sizeParts = new Set([normalizedSize, ...String(size || '').split(/[\/,;|()[\]]+/).map(normalize).filter(Boolean)]);
  const matchedColors = config.allowedColors.filter((color) => containsPhrase(normalizedTitle, color));
  if (!id || !title || !/^https:\/\//.test(url) || !Number.isFinite(priceAmount)) continue;
  if (seenListingIds.has(id)) continue;
  seenListingIds.add(id);
  filterProgress.validListings += 1;
  if (priceAmount < config.minimumPrice || priceAmount > config.maximumPrice) continue;
  filterProgress.withinPrice += 1;
  if (config.allowedBrands.length && !config.allowedBrands.includes(normalizedBrand)) continue;
  filterProgress.matchingBrand += 1;
  if (config.allowedSizes.length && !config.allowedSizes.some((allowedSize) => sizeParts.has(allowedSize))) continue;
  filterProgress.matchingSize += 1;
  normalized.push({ json: {
    listingId: id,
    itemKey: config.monitorKey + '|' + id,
    monitorKey: config.monitorKey,
    title,
    priceAmount,
    currency: String(listing.currency || ''),
    brand: brand || 'Brand not specified',
    size: size || 'Size not specified',
    matchedColors,
    audience: config.audience,
    searchText: config.searchText,
    condition: String(listing.status || 'Condition not specified'),
    seller: String(listing.sellerLogin || 'Seller not specified'),
    favoriteCount: Number.isFinite(Number(listing.favoriteCount)) ? Number(listing.favoriteCount) : null,
    viewCount: Number.isFinite(Number(listing.viewCount)) && Number(listing.viewCount) > 0 ? Number(listing.viewCount) : null,
    photoUrl: Array.isArray(listing.photoUrls) && listing.photoUrls[0] ? String(listing.photoUrls[0]) : '',
    url,
    scrapedAt: String(listing.scrapedAt || '')
  } });
}
if (normalized.length) return normalized;
const stages = [
  ['valid listing data', filterProgress.validListings],
  ['price', filterProgress.withinPrice],
  ['brand', filterProgress.matchingBrand],
  ['size', filterProgress.matchingSize]
];
const blockedAt = rawListings.length === 0 ? 'search results' : (stages.find(([, count]) => count === 0)?.[0] || 'configured filters');
return [{ json: {
  noMatches: true,
  status: 'No listings matched all configured filters.',
  returnedCount: rawListings.length,
  blockedAt,
  filterProgress,
  returnedBrands: [...new Set(rawListings.map((listing) => String(listing.brandTitle || 'Brand not specified').trim()))].sort(),
  returnedSizes: [...new Set(rawListings.map((listing) => String(listing.sizeTitle || 'Size not specified').trim()))].sort(),
  suggestion: rawListings.length === 0
    ? 'Broaden searchText or confirm the selected Vinted domain.'
    : 'Clear or broaden the blocking filter, use exact Vinted brand/catalog IDs when available, or increase maxResults for wider coverage.'
} }];`
  }),
  node('50000000-', 29, 'Check for Matching Listings', 'n8n-nodes-base.if', 2.2, [544, 0], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [
      { id: 'vinted-matches-condition', leftValue: '={{ $json.noMatches !== true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ], combinator: 'and' },
    options: {}
  }),
  node('50000000-', 11, 'Keep Undelivered Listings', 'n8n-nodes-base.dataTable', 1.1, [784, -96], ledgerCheckParameters('vinted-new-listing-alerts', '={{ $json.itemKey }}')),
  node('50000000-', 30, 'Show No-Match Details', 'n8n-nodes-base.code', 2, [784, 96], {
    jsCode: String.raw`return $input.all();`
  }),
  node('50000000-', 12, 'Build Telegram Alert Batch', 'n8n-nodes-base.code', 2, [1008, -96], {
    jsCode: String.raw`const listings = $input.all().map((item) => item.json);
if (listings.length === 0) return [];
return [{ json: { listings } }];`
  }),
  node('50000000-', 17, 'Format Telegram Messages', 'n8n-nodes-base.code', 2, [1248, 256], {
    jsCode: String.raw`const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const all = $json.listings;
const config = $('Validate Search Settings').first().json;
const messages = [];
for (let offset = 0; offset < all.length; offset += 5) {
  const chunk = all.slice(offset, offset + 5);
  const lines = chunk.map((listing, index) => {
    const position = offset + index + 1;
    const price = listing.priceAmount.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (listing.currency ? ' ' + listing.currency : '');
    const engagement = [listing.viewCount === null ? null : listing.viewCount + ' views', listing.favoriteCount === null ? null : listing.favoriteCount + ' favorites'].filter(Boolean).join(' | ');
    return position + '. <b>' + escapeHtml(listing.title.slice(0, 110)) + '</b>\n' +
      '<b>Price:</b> ' + escapeHtml(price) + '\n' +
      '<b>Brand:</b> ' + escapeHtml(listing.brand) + ' | <b>Size:</b> ' + escapeHtml(listing.size) +
      (listing.matchedColors.length ? ' | <b>Color:</b> ' + escapeHtml(listing.matchedColors.join(', ')) : '') + '\n' +
      '<b>Condition:</b> ' + escapeHtml(listing.condition) + ' | <b>Seller:</b> ' + escapeHtml(listing.seller) +
      (engagement ? '\n' + escapeHtml(engagement) : '') + '\n' +
      '<a href="' + escapeHtml(listing.url) + '">Open Vinted listing</a>';
  });
  const heading = offset === 0
    ? '<b>' + all.length + ' new Vinted ' + (all.length === 1 ? 'match' : 'matches') + '</b>'
    : '<b>Vinted matches continued</b>';
  const criteria = offset === 0 ? '\n<b>Search:</b> ' + escapeHtml(config.searchText) + ' | <b>Audience:</b> ' + escapeHtml(config.audience) : '';
  messages.push({ json: { telegramMessage: heading + criteria + '\n\n' + lines.join('\n\n') } });
}
return messages;`
  }),
  node('50000000-', 18, 'Send New Listings to Telegram', 'n8n-nodes-base.telegram', 1.2, [1488, 256], {
    resource: 'message',
    operation: 'sendMessage',
    chatId: '-1000000000000',
    text: '={{ $json.telegramMessage }}',
    replyMarkup: 'none',
    additionalFields: { appendAttribution: false, disable_notification: false, parse_mode: 'HTML' }
  }),
  node('50000000-', 19, 'Prepare Delivery Records', 'n8n-nodes-base.code', 2, [1712, 304], {
    jsCode: String.raw`return $('Build Telegram Alert Batch').first().json.listings.map((listing) => ({ json: { workflowSlug: 'vinted-new-listing-alerts', itemKey: listing.itemKey } }));`
  }),
  node('50000000-', 20, 'Record Delivered Listings', 'n8n-nodes-base.dataTable', 1.1, [2000, 304], ledgerInsertParameters('Telegram')),
  sticky('50000000-', 21, 'Workflow Overview', [-2448, -256], 480, 720, '## Vinted New-Listing Alerts to Telegram\n\nMonitor a focused public Vinted search and receive Telegram alerts for matching listings that have not been delivered before. This workflow runs `fetch_cat/vinted-search-scraper` through Apify, works on n8n Cloud or self-hosted n8n, and does not require OpenAI.\n\n### How it works\n\n1. Starts manually or on the editable hourly schedule.\n2. Validates the marketplace, query, audience, price, brand, size, color labels, and result limit.\n3. Runs focused FetchCat searches and downloads the newest Vinted listings.\n4. Filters results and removes listing IDs already present in the delivery ledger.\n5. Sends readable Telegram alerts and records IDs only after delivery succeeds.\n\n### Setup\n\n- [ ] Edit `Set Vinted Search Parameters` for your marketplace and saved-search criteria.\n- [ ] Connect one Apify HTTP Header Auth credential to both FetchCat HTTP Request nodes.\n- [ ] Connect a Telegram Bot credential and choose the destination chat.\n- [ ] Adjust `Hourly Alert Trigger` when a different interval is worth the extra executions.\n- [ ] Run manually, confirm the current matches arrive, then publish the workflow.' , 1),
  sticky('50000000-', 22, 'Trigger Workflow', [-1888, -256], 240, 512, '## Trigger the monitor\n\nStarts manually for testing or on the editable hourly schedule.'),
  sticky('50000000-', 23, 'Initialize and Configure Search', [-1616, -208], 1152, 368, '## Initialize and configure search\n\nCreates the delivery ledger, reads the saved-search parameters, validates every value, and builds one focused Actor input per brand name. A size such as `M`, `38`, or `10` matches Vinted\'s combined value `M / 38 / 10`.'),
  sticky('50000000-', 24, 'Execute Search', [-208, -240], 432, 304, '## Execute the FetchCat search\n\nStarts `fetch_cat/vinted-search-scraper` through Apify and downloads the completed dataset.'),
  sticky('50000000-', 25, 'Process and Filter Results', [256, -240], 672, 496, '## Process and filter results\n\nNormalizes listings, applies price, brand, and size filters, explains empty results, and keeps only IDs absent from the delivery ledger.'),
  sticky('50000000-', 31, 'Prepare and Send Alerts', [960, -208], 672, 640, '## Prepare and send alerts\n\nBatches unseen listings, formats readable Telegram messages, and sends current matches immediately, including on the first run.'),
  sticky('50000000-', 27, 'Log and Finalize', [1664, 160], 480, 304, '## Record successful delivery\n\nWrites listing IDs only after Telegram succeeds so interrupted deliveries remain retryable.'),
];

const vintedWorkflow = workflow(
  'Vinted New-Listing Alerts to Telegram',
  vintedNodes,
  connectionMap([
    ['Manual Start Trigger', 'Create Delivery Ledger'],
    ['Hourly Alert Trigger', 'Create Delivery Ledger'],
    ['Create Delivery Ledger', 'Set Vinted Search Parameters'],
    ['Set Vinted Search Parameters', 'Validate Search Settings'],
    ['Validate Search Settings', 'Build Brand Search Queries'],
    ['Build Brand Search Queries', 'Start FetchCat Vinted Search'],
    ['Start FetchCat Vinted Search', 'Download Vinted Search Results'],
    ['Download Vinted Search Results', 'Normalize and Filter Listings'],
    ['Normalize and Filter Listings', 'Check for Matching Listings'],
    ['Check for Matching Listings', 'Keep Undelivered Listings'],
    ['Check for Matching Listings', 'Show No-Match Details', 0, 1],
    ['Keep Undelivered Listings', 'Build Telegram Alert Batch'],
    ['Build Telegram Alert Batch', 'Format Telegram Messages'],
    ['Format Telegram Messages', 'Send New Listings to Telegram'],
    ['Send New Listings to Telegram', 'Prepare Delivery Records'],
    ['Prepare Delivery Records', 'Record Delivered Listings']
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
    slug: 'pinterest-content-opportunity-research',
    workflow: pinterestResearchWorkflow,
    metadata: {
      slug: 'pinterest-content-opportunity-research',
      title: 'Analyze Pinterest Content Opportunities with Apify, OpenAI and Google Sheets',
      workflowKind: 'actor-template',
      actorId: 'FtsA7YTDVGAJ83XiS',
      actorSlug: 'fetch_cat/pinterest-search-scraper',
      version: '1.2.1',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Google Sheets'],
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
    slug: 'vinted-new-listing-alerts',
    workflow: vintedWorkflow,
    metadata: {
      slug: 'vinted-new-listing-alerts',
      title: 'Vinted New-Listing Alerts to Telegram',
      workflowKind: 'actor-template',
      actorId: 'F1GAwbqJ9xc9h7P87',
      actorSlug: 'fetch_cat/vinted-search-scraper',
      version: '2.0.1',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'Telegram', 'n8n Data Tables'],
      testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 1 },
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
