const ACTOR_ID = 'IXhSSJjFf5fz1XAir';
const ACTOR_SLUG = 'fetch_cat/telegram-channel-posts-scraper';
const OPENAI_MODEL = 'gpt-5.4-mini';

function id(prefix, number) {
  return `${prefix}0000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function node(prefix, number, name, type, typeVersion, position, parameters) {
  return { parameters, id: id(prefix, number), name, type, typeVersion, position };
}

function sticky(prefix, number, name, position, width, height, content, color = 7) {
  return node(prefix, number, name, 'n8n-nodes-base.stickyNote', 1, position, { width, height, content, color });
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

function actorRunParameters() {
  return {
    method: 'POST',
    url: `https://api.apify.com/v2/acts/${ACTOR_ID}/runs`,
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
  };
}

function actorDatasetParameters(limitExpression) {
  return {
    method: 'GET',
    url: '=https://api.apify.com/v2/datasets/{{ $json.data.defaultDatasetId }}/items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'clean', value: 'true' },
      { name: 'limit', value: limitExpression }
    ] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
  };
}

function sheetRef(tabName) {
  return {
    documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: tabName }
  };
}

function sheetSchema(fields, matching = []) {
  return fields.map(({ name, type = 'string' }) => ({
    id: name,
    displayName: name,
    required: false,
    defaultMatch: matching.includes(name),
    display: true,
    type,
    canBeUsedToMatch: true
  }));
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

function createLedgerParameters() {
  return {
    resource: 'table',
    operation: 'create',
    tableName: 'FetchCat Delivery Ledger',
    columns: { column: ledgerColumns },
    options: { createIfNotExists: true }
  };
}

function ledgerCheckParameters() {
  return {
    resource: 'row',
    operation: 'rowNotExists',
    dataTableId: dataTable('FetchCat Delivery Ledger'),
    matchType: 'allConditions',
    filters: { conditions: [
      { keyName: 'workflowSlug', condition: 'eq', keyValue: 'telegram-channel-intelligence-monitor' },
      { keyName: 'itemKey', condition: 'eq', keyValue: '={{ $json.itemKey }}' }
    ] }
  };
}

function ledgerInsertParameters() {
  return {
    resource: 'row',
    operation: 'insert',
    dataTableId: dataTable('FetchCat Delivery Ledger'),
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: [],
      value: {
        workflowSlug: 'telegram-channel-intelligence-monitor',
        itemKey: '={{ $json.itemKey }}',
        destination: 'Google Sheets and Telegram',
        deliveredAt: '={{ $now.toISO() }}'
      },
      schema: ledgerColumns.map(({ name }) => ({
        id: name,
        displayName: name,
        required: false,
        defaultMatch: false,
        display: true,
        type: name === 'deliveredAt' ? 'dateTime' : 'string',
        canBeUsedToMatch: true
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: {}
  };
}

function openAiParameters(prompt, schema) {
  return {
    resource: 'text',
    operation: 'response',
    modelId: { __rl: true, mode: 'id', value: OPENAI_MODEL },
    responses: { values: [{ type: 'text', role: 'user', content: prompt }] },
    simplify: true,
    builtInTools: {},
    options: {
      instructions: 'Analyze every supplied Telegram post exactly once. Preserve itemKey values. Use only the supplied public content and metrics. Return the strict schema with concise, factual English. Qualified means the post materially supports the stated intelligence goal and meets the minimum relevance score.',
      maxTokens: 5000,
      reasoning: { reasoningOptions: { effort: 'low', summary: 'none' } },
      store: false,
      textFormat: {
        textOptions: {
          type: 'json_schema',
          verbosity: 'low',
          name: 'telegram_intelligence_batch',
          schema: JSON.stringify(schema),
          description: 'One validated intelligence result for every Telegram post.',
          strict: true
        }
      }
    }
  };
}

const postFields = [
  { name: 'Post key' },
  { name: 'Collected at', type: 'number' },
  { name: 'Channel' },
  { name: 'Channel title' },
  { name: 'Subscribers', type: 'number' },
  { name: 'Post date', type: 'number' },
  { name: 'Post' },
  { name: 'Post ID' },
  { name: 'Text' },
  { name: 'Views', type: 'number' },
  { name: 'Reactions', type: 'number' },
  { name: 'Replies', type: 'number' },
  { name: 'Comments scraped', type: 'number' },
  { name: 'Media count', type: 'number' },
  { name: 'Links' }
];

const normalizePostsCode = String.raw`
const config = $('Validate Channels and Build Actor Input').first().json;
const payloads = $input.all().flatMap((item) => {
  let value = item.json?.data ?? item.json;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new Error('Apify returned invalid JSON.'); }
  }
  return Array.isArray(value) ? value : [value];
});
const sheetsEpochOffset = 25569;
const serial = (value) => {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.getTime() / 86400000 + sheetsEpochOffset : null;
};
const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const formula = (url, label) => url ? '=HYPERLINK("' + String(url).replace(/"/g, '""') + '","' + String(label).replace(/"/g, '""') + '")' : '';
const seen = new Set();
const rows = [];
for (const post of payloads) {
  const channelHandle = String(post.channelHandle || '').trim().replace(/^@/, '').toLowerCase();
  const postId = String(post.postId || '').trim();
  const postUrl = String(post.postUrl || (channelHandle && postId ? 'https://t.me/' + channelHandle + '/' + postId : ''));
  const text = String(post.text || '').trim();
  if (!channelHandle || !postId || !postUrl) continue;
  const itemKey = channelHandle + ':' + postId;
  if (seen.has(itemKey)) continue;
  seen.add(itemKey);
  rows.push({ json: {
    itemKey,
    collectedAt: serial(post.scrapedAt),
    channel: '@' + channelHandle,
    channelHandle,
    channelTitle: String(post.channelTitle || ''),
    subscribers: numberOrNull(post.subscriberCount),
    postDate: serial(post.date),
    postDateIso: post.date ? new Date(post.date).toISOString() : '',
    postLink: formula(postUrl, 'Open post'),
    postUrl,
    postId,
    text: text.slice(0, 12000),
    views: numberOrNull(post.views),
    reactions: numberOrNull(post.reactionCount),
    replies: numberOrNull(post.replyCount),
    commentsScraped: numberOrNull(post.commentsScraped),
    mediaCount: Array.isArray(post.mediaUrls) ? post.mediaUrls.length : 0,
    links: Array.isArray(post.links) ? post.links.join('\n') : '',
    intelligenceGoal: config.intelligenceGoal,
    minimumRelevanceScore: config.minimumRelevanceScore,
    maxAlerts: config.maxAlerts
  } });
  if (rows.length >= config.maximumPostsPerRun) break;
}
if (rows.length === 0) throw new Error('No public Telegram posts were returned. Check the channel handles and date window.');
return rows;`;

const simpleNodes = [
  node('70000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1440, 176], {}),
  node('70000000-', 2, 'Daily 09:00 Trigger', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1440, -16], {
    rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }] }
  }),
  node('70000000-', 3, '1. Enter Telegram Channels', 'n8n-nodes-base.set', 3.4, [-1056, 80], {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments: [
      { id: 'telegram-channels', name: 'channels', value: 'durov\ntelegram', type: 'string' },
      { id: 'telegram-per-channel', name: 'Maximum Posts Per Channel', value: 10, type: 'number' },
      { id: 'telegram-per-run', name: 'Maximum Posts Per Run', value: 20, type: 'number' }
    ] },
    options: {}
  }),
  node('70000000-', 4, 'Validate Channels and Build Actor Input', 'n8n-nodes-base.code', 2, [-816, 80], {
    jsCode: String.raw`const input = $input.first()?.json || {};
const channels = [...new Set(String(input.channels || '').split(/[\n,]+/).map((value) => value.trim().replace(/^@/, '')).filter(Boolean))];
const maxPostsPerChannel = Math.max(1, Math.min(100, Math.floor(Number(input['Maximum Posts Per Channel']) || 10)));
const maximumPostsPerRun = Math.max(1, Math.min(500, Math.floor(Number(input['Maximum Posts Per Run']) || 20)));
if (channels.length === 0) throw new Error('Enter at least one public Telegram channel handle.');
if (channels.some((value) => !/^[A-Za-z0-9_]{3,64}$/.test(value))) throw new Error('Use public Telegram handles without t.me URLs.');
return [{ json: {
  channels, maximumPostsPerRun, maximumPostsPerChannel: maxPostsPerChannel,
  intelligenceGoal: '', minimumRelevanceScore: 0, maxAlerts: 0,
  actorInput: { channels, maxPostsPerChannel, maxPosts: maximumPostsPerRun, includeComments: false, includeCommentCount: true, includeMedia: true, includeRawHtmlSnippet: false }
} }];`
  }),
  node('70000000-', 5, '2. Run Telegram Channel Posts Scraper', 'n8n-nodes-base.httpRequest', 4.3, [-576, 80], actorRunParameters()),
  node('70000000-', 6, 'Download Telegram Post Results', 'n8n-nodes-base.httpRequest', 4.3, [-336, 80], actorDatasetParameters('={{ $("Validate Channels and Build Actor Input").first().json.maximumPostsPerRun }}')),
  node('70000000-', 7, 'Prepare Human-Readable Post Rows', 'n8n-nodes-base.code', 2, [-96, 80], { jsCode: normalizePostsCode }),
  node('70000000-', 8, '3. Save Posts to Google Sheets', 'n8n-nodes-base.googleSheets', 4.7, [144, 80], {
    operation: 'appendOrUpdate',
    ...sheetRef('Telegram Posts'),
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['Post key'],
      value: {
        'Post key': '={{ $json.itemKey }}',
        'Collected at': '={{ $json.collectedAt }}',
        Channel: '={{ $json.channel }}',
        'Channel title': '={{ $json.channelTitle }}',
        Subscribers: '={{ $json.subscribers }}',
        'Post date': '={{ $json.postDate }}',
        Post: '={{ $json.postLink }}',
        'Post ID': '={{ $json.postId }}',
        Text: '={{ $json.text }}',
        Views: '={{ $json.views }}',
        Reactions: '={{ $json.reactions }}',
        Replies: '={{ $json.replies }}',
        'Comments scraped': '={{ $json.commentsScraped }}',
        'Media count': '={{ $json.mediaCount }}',
        Links: '={{ $json.links }}'
      },
      schema: sheetSchema(postFields, ['Post key']),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: { useAppend: true }
  }),
  sticky('70000000-', 20, 'Workflow Overview', [-2080, -420], 480, 920, `## Export Telegram Channel Posts to Google Sheets

Collect public Telegram channel posts with ${ACTOR_SLUG} and keep one clean, sortable row per post in Google Sheets. This workflow works on n8n Cloud or self-hosted n8n, uses only built-in nodes, and does not require OpenAI.

### How it works

1. Starts manually or every day at 09:00.
2. Reads one or more public channel handles and configurable post limits.
3. Runs the Apify Actor once for the complete channel batch.
4. Converts dates, links, engagement, media counts, and post text into human-readable columns.
5. Updates Google Sheets by a stable channel-and-post key, so reruns refresh existing rows without creating duplicates.

### Setup

- [ ] Enter public channel handles without t.me URLs.
- [ ] Choose maximum posts per channel and per workflow run.
- [ ] Create an Apify HTTP Header Auth credential and select it in both HTTP Request nodes.
- [ ] Copy the provided spreadsheet template, connect Google Sheets, and select its Telegram Posts tab.
- [ ] Run manually, inspect the rows, and publish only when you are ready to enable the daily schedule.

Only public posts are collected. The workflow does not join channels, send messages, or access private Telegram data.`, 1),
  sticky('70000000-', 21, 'Start the Export', [-1520, -144], 320, 480, '## Start the export\n\nRun manually during setup or publish the workflow to collect posts every day at 09:00.'),
  sticky('70000000-', 22, 'Configure and Collect', [-1120, -144], 720, 480, '## Configure and collect\n\nEnter public channel handles and post limits, validate them, then run the Apify Actor once for the complete batch.'),
  sticky('70000000-', 23, 'Prepare and Save Posts', [-352, -144], 592, 480, '## Prepare and save posts\n\nCreate readable dates, direct links, metrics, and stable keys, then upsert one row per Telegram post in Google Sheets.')
];

const simpleWorkflow = workflow(
  'Export Telegram Channel Posts to Google Sheets with Apify',
  simpleNodes,
  connectionMap([
    ['Manual Trigger', '1. Enter Telegram Channels'],
    ['Daily 09:00 Trigger', '1. Enter Telegram Channels'],
    ['1. Enter Telegram Channels', 'Validate Channels and Build Actor Input'],
    ['Validate Channels and Build Actor Input', '2. Run Telegram Channel Posts Scraper'],
    ['2. Run Telegram Channel Posts Scraper', 'Download Telegram Post Results'],
    ['Download Telegram Post Results', 'Prepare Human-Readable Post Rows'],
    ['Prepare Human-Readable Post Rows', '3. Save Posts to Google Sheets']
  ])
);

const intelligenceFields = [
  { name: 'Post key' },
  { name: 'Analyzed at', type: 'number' },
  { name: 'Channel' },
  { name: 'Post date', type: 'number' },
  { name: 'Post' },
  { name: 'Topic' },
  { name: 'Urgency' },
  { name: 'Relevance score', type: 'number' },
  { name: 'Sentiment' },
  { name: 'Summary' },
  { name: 'Why it matters' },
  { name: 'Views', type: 'number' },
  { name: 'Reactions', type: 'number' },
  { name: 'Replies', type: 'number' }
];

const intelligenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemKey', 'qualified', 'relevanceScore', 'urgency', 'topic', 'sentiment', 'summary', 'whyItMatters'],
        properties: {
          itemKey: { type: 'string' },
          qualified: { type: 'boolean' },
          relevanceScore: { type: 'integer', minimum: 0, maximum: 100 },
          urgency: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
          topic: { type: 'string', minLength: 1, maxLength: 120 },
          sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'mixed'] },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
          whyItMatters: { type: 'string', minLength: 1, maxLength: 500 }
        }
      }
    }
  }
};

const monitorNodes = [
  node('71000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-2200, 176], {}),
  node('71000000-', 2, 'Hourly Intelligence Trigger', 'n8n-nodes-base.scheduleTrigger', 1.3, [-2200, -16], {
    rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 0 }] }
  }),
  node('71000000-', 3, 'Ensure Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-1960, 80], createLedgerParameters()),
  node('71000000-', 4, '1. Configure Channel Intelligence', 'n8n-nodes-base.set', 3.4, [-1680, 80], {
    mode: 'manual', duplicateItem: false,
    assignments: { assignments: [
      { id: 'monitor-channels', name: 'channels', value: 'durov\ntelegram', type: 'string' },
      { id: 'monitor-goal', name: 'Intelligence Goal', value: 'Track important product announcements, market shifts, partnerships, risks, and competitor moves that require a business response.', type: 'string' },
      { id: 'monitor-score', name: 'Minimum Relevance Score', value: 70, type: 'number' },
      { id: 'monitor-per-channel', name: 'Maximum Posts Per Channel', value: 10, type: 'number' },
      { id: 'monitor-per-run', name: 'Maximum Posts Per Run', value: 20, type: 'number' },
      { id: 'monitor-alerts', name: 'Maximum Alerts Per Digest', value: 5, type: 'number' }
    ] }, options: {}
  }),
  node('71000000-', 5, 'Validate Channels and Build Actor Input', 'n8n-nodes-base.code', 2, [-1440, 80], {
    jsCode: String.raw`const input = $input.first()?.json || {};
const channels = [...new Set(String(input.channels || '').split(/[\n,]+/).map((value) => value.trim().replace(/^@/, '')).filter(Boolean))];
const intelligenceGoal = String(input['Intelligence Goal'] || '').trim();
const minimumRelevanceScore = Math.max(0, Math.min(100, Math.floor(Number(input['Minimum Relevance Score']) || 70)));
const maxPostsPerChannel = Math.max(1, Math.min(50, Math.floor(Number(input['Maximum Posts Per Channel']) || 10)));
const maximumPostsPerRun = Math.max(1, Math.min(100, Math.floor(Number(input['Maximum Posts Per Run']) || 20)));
const maxAlerts = Math.max(1, Math.min(10, Math.floor(Number(input['Maximum Alerts Per Digest']) || 5)));
if (channels.length === 0) throw new Error('Enter at least one public Telegram channel handle.');
if (channels.some((value) => !/^[A-Za-z0-9_]{3,64}$/.test(value))) throw new Error('Use public Telegram handles without t.me URLs.');
if (intelligenceGoal.length < 20 || intelligenceGoal.length > 2000) throw new Error('Intelligence Goal must contain 20 to 2000 characters.');
return [{ json: {
  channels, intelligenceGoal, minimumRelevanceScore, maximumPostsPerRun, maxAlerts,
  actorInput: { channels, maxPostsPerChannel, maxPosts: maximumPostsPerRun, includeComments: false, includeCommentCount: true, includeMedia: true, includeRawHtmlSnippet: false }
} }];`
  }),
  node('71000000-', 6, '2. Run Telegram Channel Posts Scraper', 'n8n-nodes-base.httpRequest', 4.3, [-1200, 80], actorRunParameters()),
  node('71000000-', 7, 'Download Telegram Post Results', 'n8n-nodes-base.httpRequest', 4.3, [-960, 80], actorDatasetParameters('={{ $("Validate Channels and Build Actor Input").first().json.maximumPostsPerRun }}')),
  node('71000000-', 8, 'Normalize Public Telegram Posts', 'n8n-nodes-base.code', 2, [-720, 80], { jsCode: normalizePostsCode }),
  node('71000000-', 9, 'Keep Undelivered Posts', 'n8n-nodes-base.dataTable', 1.1, [-480, 80], ledgerCheckParameters()),
  node('71000000-', 10, 'Build One Intelligence Batch', 'n8n-nodes-base.code', 2, [-240, 80], {
    jsCode: String.raw`const posts = $input.all().map((item) => item.json);
if (posts.length === 0) return [];
return [{ json: {
  posts: posts.map((post) => ({ itemKey: post.itemKey, channel: post.channel, date: post.postDateIso, text: post.text, views: post.views, reactions: post.reactions, replies: post.replies })),
  sourcePosts: posts,
  allKeys: posts.map((post) => post.itemKey),
  intelligenceGoal: posts[0].intelligenceGoal,
  minimumRelevanceScore: posts[0].minimumRelevanceScore,
  maxAlerts: posts[0].maxAlerts
} }];`
  }),
  node('71000000-', 11, '3. Analyze Telegram Posts in One Batch', '@n8n/n8n-nodes-langchain.openAi', 2.3, [0, 80], openAiParameters(
    '=Intelligence goal:\n{{ $json.intelligenceGoal }}\n\nMinimum relevance score: {{ $json.minimumRelevanceScore }}\n\nAnalyze every post and preserve itemKey:\n{{ JSON.stringify($json.posts) }}',
    intelligenceSchema
  )),
  node('71000000-', 12, 'Validate Intelligence Results', 'n8n-nodes-base.code', 2, [240, 80], {
    jsCode: String.raw`const source = $('Build One Intelligence Batch').first().json;
const raw = $input.first()?.json || {};
const seen = new Set();
function findStructured(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const text = value.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
    if (!text.startsWith('{')) return null;
    try { return findStructured(JSON.parse(text)); } catch { return null; }
  }
  if (typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value.results)) return value;
  const preferred = ['output_text', 'outputText', 'text', 'content', 'output', 'message', 'response', 'data'];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = findStructured(value[key]);
      if (found) return found;
    }
  }
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    const found = findStructured(nested);
    if (found) return found;
  }
  return null;
}
const parsed = findStructured(raw);
if (!parsed) throw new Error('OpenAI returned an invalid Telegram intelligence batch.');
const expected = new Set(source.allKeys);
const actual = parsed.results.map((row) => String(row.itemKey));
if (actual.length !== expected.size || new Set(actual).size !== actual.length || actual.some((key) => !expected.has(key))) throw new Error('OpenAI result keys do not exactly match the Telegram input batch.');
const byKey = new Map(source.sourcePosts.map((post) => [post.itemKey, post]));
const allowedUrgency = new Set(['critical', 'high', 'normal', 'low']);
const allowedSentiment = new Set(['positive', 'neutral', 'negative', 'mixed']);
const qualified = [];
for (const result of parsed.results) {
  if (typeof result.qualified !== 'boolean' || !Number.isInteger(result.relevanceScore) || result.relevanceScore < 0 || result.relevanceScore > 100 || !allowedUrgency.has(result.urgency) || !allowedSentiment.has(result.sentiment) || !String(result.topic || '').trim() || !String(result.summary || '').trim() || !String(result.whyItMatters || '').trim()) throw new Error('OpenAI returned a malformed Telegram intelligence result.');
  if (!result.qualified || result.relevanceScore < source.minimumRelevanceScore) continue;
  qualified.push({ ...byKey.get(result.itemKey), relevanceScore: result.relevanceScore, urgency: result.urgency, topic: String(result.topic).trim(), sentiment: result.sentiment, summary: String(result.summary).trim(), whyItMatters: String(result.whyItMatters).trim() });
}
qualified.sort((a, b) => b.relevanceScore - a.relevanceScore);
return [{ json: { allKeys: source.allKeys, maxAlerts: source.maxAlerts, qualifiedPosts: qualified } }];`
  }),
  node('71000000-', 13, 'Has Relevant Intelligence', 'n8n-nodes-base.if', 2.2, [480, 80], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [
      { id: 'telegram-qualified', leftValue: '={{ $json.qualifiedPosts.length }}', rightValue: 0, operator: { type: 'number', operation: 'gt' } }
    ], combinator: 'and' }, options: {}
  }),
  node('71000000-', 14, 'Expand Intelligence Rows', 'n8n-nodes-base.code', 2, [720, -16], {
    jsCode: String.raw`return $json.qualifiedPosts.map((post) => ({ json: post }));`
  }),
  node('71000000-', 15, '4. Save Intelligence to Google Sheets', 'n8n-nodes-base.googleSheets', 4.7, [960, -16], {
    operation: 'appendOrUpdate', ...sheetRef('Telegram Intelligence'),
    columns: {
      mappingMode: 'defineBelow', matchingColumns: ['Post key'],
      value: {
        'Post key': '={{ $json.itemKey }}',
        'Analyzed at': '={{ $now.toMillis() / 86400000 + 25569 }}',
        Channel: '={{ $json.channel }}',
        'Post date': '={{ $json.postDate }}',
        Post: '={{ $json.postLink }}',
        Topic: '={{ $json.topic }}',
        Urgency: '={{ $json.urgency }}',
        'Relevance score': '={{ $json.relevanceScore }}',
        Sentiment: '={{ $json.sentiment }}',
        Summary: '={{ $json.summary }}',
        'Why it matters': '={{ $json.whyItMatters }}',
        Views: '={{ $json.views }}',
        Reactions: '={{ $json.reactions }}',
        Replies: '={{ $json.replies }}'
      },
      schema: sheetSchema(intelligenceFields, ['Post key']),
      attemptToConvertTypes: false, convertFieldsToString: false
    }, options: { useAppend: true }
  }),
  node('71000000-', 16, 'Build Telegram Intelligence Digest', 'n8n-nodes-base.code', 2, [1200, -16], {
    jsCode: String.raw`const result = $('Validate Intelligence Results').first().json;
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const posts = result.qualifiedPosts.slice(0, result.maxAlerts);
const lines = posts.map((post, index) => (index + 1) + '. <a href="' + escapeHtml(post.postUrl) + '"><b>' + escapeHtml(post.topic) + '</b></a>\n' + escapeHtml(post.channel) + ' | ' + escapeHtml(post.urgency.toUpperCase()) + ' | ' + post.relevanceScore + '/100\n' + escapeHtml(post.summary) + '\nWhy it matters: ' + escapeHtml(post.whyItMatters));
return [{ json: { telegramMessage: '<b>Telegram channel intelligence</b>\n\n' + lines.join('\n\n') + (result.qualifiedPosts.length > posts.length ? '\n\n+' + (result.qualifiedPosts.length - posts.length) + ' more relevant posts saved in Google Sheets.' : '') } }];`
  }),
  node('71000000-', 17, '5. Send Intelligence Digest to Telegram', 'n8n-nodes-base.telegram', 1.2, [1440, -16], {
    resource: 'message', operation: 'sendMessage', chatId: '-1000000000000', text: '={{ $json.telegramMessage }}', replyMarkup: 'none',
    additionalFields: { appendAttribution: false, disable_notification: false, parse_mode: 'HTML' }
  }),
  node('71000000-', 18, 'Prepare Delivered Post Keys', 'n8n-nodes-base.code', 2, [1680, 80], {
    jsCode: String.raw`return $('Validate Intelligence Results').first().json.allKeys.map((itemKey) => ({ json: { itemKey } }));`
  }),
  node('71000000-', 19, 'Commit Delivered Posts', 'n8n-nodes-base.dataTable', 1.1, [1920, 80], ledgerInsertParameters()),
  { ...node('71000000-', 20, 'Intelligence Monitor Complete', 'n8n-nodes-base.code', 2, [2160, 80], {
    jsCode: String.raw`const result = $('Validate Intelligence Results').first().json;
return [{ json: { status: 'complete', postsEvaluated: result.allKeys.length, relevantPosts: result.qualifiedPosts.length, telegramAlertSent: result.qualifiedPosts.length > 0 } }];`
  }), executeOnce: true },
  sticky('71000000-', 30, 'Workflow Overview', [-2840, -460], 480, 1040, `## Monitor Telegram Channels for Market Intelligence

Turn public Telegram channel posts into a focused intelligence feed with ${ACTOR_SLUG}, OpenAI, Google Sheets, and Telegram. The workflow works on n8n Cloud or self-hosted n8n and makes one structured AI call per non-empty batch.

### How it works

1. Starts manually or once every hour and creates its delivery ledger if needed.
2. Reads public channel handles, an intelligence goal, relevance threshold, and item limits from one editable Set node.
3. Runs the Apify Actor once, normalizes the newest posts, and removes IDs already delivered.
4. Classifies all unseen posts in one strict OpenAI batch.
5. Saves relevant posts to Google Sheets and sends at most five in one Telegram digest.
6. Records evaluated IDs only after required destinations succeed, so delivery failures remain retryable.

### Setup

- [ ] Enter public channel handles and describe the business questions that matter.
- [ ] Connect Apify HTTP Header Auth in both request nodes.
- [ ] Connect OpenAI and keep the pinned low-cost model.
- [ ] Copy the spreadsheet template and select its Telegram Intelligence tab.
- [ ] Create a Telegram bot with BotFather, connect it, and enter the destination chat ID.
- [ ] Run manually twice to verify delivery and deduplication before publishing the hourly schedule.

The workflow monitors public content only. It never joins channels, contacts authors, or sends automated replies.`, 1),
  sticky('71000000-', 31, 'Start and Prepare State', [-2280, -144], 560, 480, '## Start and prepare state\n\nRun manually or hourly and create the durable delivery ledger idempotently before collecting posts.'),
  sticky('71000000-', 32, 'Configure Intelligence', [-1760, -144], 560, 480, '## Configure intelligence\n\nEnter public channel handles, the intelligence goal, score threshold, post limits, and digest limit in one editable node.'),
  sticky('71000000-', 33, 'Collect Public Posts', [-1280, -144], 560, 480, '## Collect public posts\n\nRun the Telegram Channel Posts Scraper once and download the bounded public dataset after the Actor finishes.'),
  sticky('71000000-', 34, 'Normalize and Deduplicate', [-800, -144], 720, 480, '## Normalize and deduplicate\n\nCreate stable post keys and readable metrics, remove previously delivered IDs, and assemble one bounded analysis batch.'),
  sticky('71000000-', 35, 'Analyze and Validate', [-80, -144], 720, 480, '## Analyze and validate\n\nUse one structured OpenAI call, require exactly one result per input post, and keep only posts meeting the configured relevance threshold.'),
  sticky('71000000-', 36, 'Deliver Relevant Intelligence', [640, -144], 960, 480, '## Deliver relevant intelligence\n\nUpsert qualified posts to Google Sheets and send one concise Telegram digest with direct links, scores, summaries, and business implications.'),
  sticky('71000000-', 37, 'Commit Delivery State', [1600, -144], 720, 480, '## Commit delivery state\n\nRecord every evaluated key only after required delivery succeeds, then return a concise execution summary. Failed deliveries remain retryable.')
];

const monitorWorkflow = workflow(
  'Monitor Telegram Channels for Market Intelligence with Apify, OpenAI, Google Sheets and Telegram',
  monitorNodes,
  connectionMap([
    ['Manual Trigger', 'Ensure Delivery Ledger'],
    ['Hourly Intelligence Trigger', 'Ensure Delivery Ledger'],
    ['Ensure Delivery Ledger', '1. Configure Channel Intelligence'],
    ['1. Configure Channel Intelligence', 'Validate Channels and Build Actor Input'],
    ['Validate Channels and Build Actor Input', '2. Run Telegram Channel Posts Scraper'],
    ['2. Run Telegram Channel Posts Scraper', 'Download Telegram Post Results'],
    ['Download Telegram Post Results', 'Normalize Public Telegram Posts'],
    ['Normalize Public Telegram Posts', 'Keep Undelivered Posts'],
    ['Keep Undelivered Posts', 'Build One Intelligence Batch'],
    ['Build One Intelligence Batch', '3. Analyze Telegram Posts in One Batch'],
    ['3. Analyze Telegram Posts in One Batch', 'Validate Intelligence Results'],
    ['Validate Intelligence Results', 'Has Relevant Intelligence'],
    ['Has Relevant Intelligence', 'Expand Intelligence Rows'],
    ['Expand Intelligence Rows', '4. Save Intelligence to Google Sheets'],
    ['4. Save Intelligence to Google Sheets', 'Build Telegram Intelligence Digest'],
    ['Build Telegram Intelligence Digest', '5. Send Intelligence Digest to Telegram'],
    ['5. Send Intelligence Digest to Telegram', 'Prepare Delivered Post Keys'],
    ['Has Relevant Intelligence', 'Prepare Delivered Post Keys', 0, 1],
    ['Prepare Delivered Post Keys', 'Commit Delivered Posts'],
    ['Commit Delivered Posts', 'Intelligence Monitor Complete']
  ])
);

export function buildTelegramDefinitions() {
  return [
    {
      slug: 'telegram-channel-posts-to-google-sheets',
      workflow: simpleWorkflow,
      metadata: {
        slug: 'telegram-channel-posts-to-google-sheets',
        title: simpleWorkflow.name,
        workflowKind: 'actor-template',
        actorId: ACTOR_ID,
        actorSlug: ACTOR_SLUG,
        version: '1.0.0',
        minimumN8nVersion: '2.26.8',
        integrations: ['Apify', 'Google Sheets'],
        testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 1 },
        releaseState: 'qa-passed'
      }
    },
    {
      slug: 'telegram-channel-intelligence-monitor',
      workflow: monitorWorkflow,
      metadata: {
        slug: 'telegram-channel-intelligence-monitor',
        title: monitorWorkflow.name,
        workflowKind: 'actor-template',
        actorId: ACTOR_ID,
        actorSlug: ACTOR_SLUG,
        version: '1.0.0',
        minimumN8nVersion: '2.26.8',
        integrations: ['Apify', 'OpenAI', 'Google Sheets', 'Telegram', 'n8n Data Tables'],
        testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 1 },
        releaseState: 'qa-passed'
      }
    }
  ];
}
