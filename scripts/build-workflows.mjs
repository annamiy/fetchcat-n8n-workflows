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

function mergeParameters() {
  return {
    mode: 'combine',
    combineBy: 'combineByPosition',
    numberInputs: 2,
    options: {
      clashHandling: {
        values: {
          resolveClash: 'preferInput1'
        }
      }
    }
  };
}

function dedupeParameters(expression) {
  return {
    operation: 'removeItemsSeenInPreviousExecutions',
    logic: 'removeItemsWithAlreadySeenKeyValues',
    dedupeValue: expression,
    options: {
      scope: 'node',
      historySize: 10000
    }
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
  required: ['qualified', 'score', 'reason'],
  properties: {
    qualified: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string', minLength: 1, maxLength: 500 }
  }
};

const linkedInNodes = [
  node('10000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1280, 80], {}),
  node('10000000-', 2, 'Daily Schedule', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1280, -100], {
    rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 0 }] }
  }),
  node('10000000-', 3, 'Configuration', 'n8n-nodes-base.code', 2, [-1040, 0], {
    jsCode: String.raw`return [{
  json: {
    keywords: ['automation engineer', 'workflow automation'],
    location: 'Remote',
    candidateProfile: 'Senior automation engineer with n8n, JavaScript, APIs, and data pipeline experience.',
    minimumScore: 70,
    maxItems: 10,
    sheetName: 'Jobs'
  }
}];`
  }),
  node('10000000-', 4, 'Build Actor Input', 'n8n-nodes-base.code', 2, [-800, 0], {
    jsCode: String.raw`const config = $input.first().json;
if (!Array.isArray(config.keywords) || config.keywords.length === 0) throw new Error('Configure at least one job keyword.');
if (!config.candidateProfile || config.candidateProfile.length < 20) throw new Error('Candidate profile must be at least 20 characters.');
const maxItems = Math.max(1, Math.min(Number(config.maxItems) || 10, 10));
return [{ json: {
  actorInput: {
    keywords: config.keywords,
    location: config.location,
    maxItems,
    includeDetails: true,
    datePosted: 'past24h',
    sortBy: 'recent'
  }
} }];`
  }),
  node('10000000-', 5, 'Fetch LinkedIn Jobs', '@apify/n8n-nodes-apify.apify', 1, [-560, 0], actorParameters(
    '0XhGPLTjZjicBXYV5',
    'LinkedIn Jobs Scraper',
    '={{ JSON.stringify($json.actorInput) }}'
  )),
  node('10000000-', 6, 'Normalize and Cap Jobs', 'n8n-nodes-base.code', 2, [-320, 0], {
    jsCode: String.raw`const normalized = [];
for (const item of $input.all().slice(0, 10)) {
  const job = item.json;
  if (!job.jobId || !job.title || !job.jobUrl) continue;
  normalized.push({ json: {
    jobId: String(job.jobId),
    title: String(job.title),
    companyName: String(job.companyName || 'Unknown company'),
    location: String(job.location || 'Not specified'),
    postedAtText: String(job.postedAtText || ''),
    jobUrl: String(job.jobUrl),
    description: String(job.description || '').slice(0, 12000),
    employmentType: String(job.employmentType || ''),
    seniorityLevel: String(job.seniorityLevel || ''),
    applicantsText: String(job.applicantsText || '')
  } });
}
return normalized;`
  }),
  node('10000000-', 7, 'Remove Previously Seen Jobs', 'n8n-nodes-base.removeDuplicates', 2, [-80, 0], dedupeParameters('={{ $json.jobId }}')),
  node('10000000-', 8, 'Score Job Fit', '@n8n/n8n-nodes-langchain.openAi', 2.3, [160, 120], openAiParameters(
    '=Candidate profile:\n{{ $("Configuration").first().json.candidateProfile }}\n\nMinimum score for qualification: {{ $("Configuration").first().json.minimumScore }}\n\nEvaluate this job:\n{{ JSON.stringify($json) }}',
    'linkedin_job_fit',
    linkedInSchema,
    'Score the job against the candidate profile. Set qualified to true exactly when score meets or exceeds the supplied minimum and the fit is credible. Always provide a non-empty reason. Return the strict schema.',
    1200
  )),
  node('10000000-', 9, 'Merge Job and Score', 'n8n-nodes-base.merge', 3.2, [400, 0], mergeParameters()),
  node('10000000-', 10, 'Validate and Filter Scores', 'n8n-nodes-base.code', 2, [640, 0], {
    jsCode: `${parseStructured}\nconst minimumScore = Number($("Configuration").first().json.minimumScore);\nconst output = [];\nfor (const item of $input.all()) {\n  const score = parseStructured(item.json, ['qualified', 'score', 'reason']);\n  if (!score || typeof score.qualified !== 'boolean' || !Number.isInteger(score.score) || score.score < 0 || score.score > 100 || typeof score.reason !== 'string' || !score.reason.trim()) continue;\n  if (!score.qualified || score.score < minimumScore) continue;\n  output.push({ json: {\n    jobId: item.json.jobId,\n    title: item.json.title,\n    company: item.json.companyName,\n    location: item.json.location,\n    posted: item.json.postedAtText,\n    url: item.json.jobUrl,\n    score: score.score,\n    reason: score.reason,\n    scrapedAt: new Date().toISOString()\n  } });\n}\nreturn output;`
  }),
  node('10000000-', 11, 'Append Qualified Jobs', 'n8n-nodes-base.googleSheets', 4.7, [880, 0], {
    operation: 'append',
    documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: 'Jobs' },
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: [],
      value: {
        jobId: '={{ $json.jobId }}',
        title: '={{ $json.title }}',
        company: '={{ $json.company }}',
        location: '={{ $json.location }}',
        posted: '={{ $json.posted }}',
        url: '={{ $json.url }}',
        score: '={{ $json.score }}',
        reason: '={{ $json.reason }}',
        scrapedAt: '={{ $json.scrapedAt }}'
      },
      schema: ['jobId', 'title', 'company', 'location', 'posted', 'url', 'score', 'reason', 'scrapedAt'].map((field) => ({
        id: field,
        displayName: field,
        required: false,
        defaultMatch: false,
        display: true,
        type: field === 'score' ? 'number' : 'string',
        canBeUsedToMatch: true
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: { useAppend: true }
  }),
  node('10000000-', 12, 'Build Slack Digest', 'n8n-nodes-base.code', 2, [1120, 0], {
    jsCode: String.raw`const jobs = $input.all().map((item) => item.json).sort((a, b) => b.score - a.score).slice(0, 5);
if (jobs.length === 0) return [];
const lines = jobs.map((job, index) => (index + 1) + '. *' + job.title + '* at ' + job.company + ' (' + job.score + '/100)\n' + job.location + ' | ' + job.reason + '\n' + job.url);
return [{ json: { slackMessage: '*LinkedIn Job Match Digest*\n\n' + lines.join('\n\n') } }];`
  }),
  node('10000000-', 13, 'Send Slack Digest', 'n8n-nodes-base.slack', 2.5, [1360, 0], {
    resource: 'message',
    operation: 'post',
    select: 'channel',
    channelId: { __rl: true, mode: 'id', value: 'C0000000000' },
    messageType: 'text',
    text: '={{ $json.slackMessage }}',
    otherOptions: { includeLinkToWorkflow: false, unfurl_links: false, unfurl_media: false }
  }),
  sticky('10000000-', 14, 'Setup Notes', [-1320, -440], 720, 260, '## LinkedIn Job Match Digest\n\n1. Configure keywords, location, candidate profile, and score threshold.\n2. Connect Apify, OpenAI, Google Sheets, and Slack credentials.\n3. Select the `Jobs` tab and QA Slack channel.\n4. Keep the schedule unpublished until QA passes.\n\nThe Actor and AI stages are capped at 10 jobs. Previously seen `jobId` values are removed before AI scoring.'),
  sticky('10000000-', 15, 'Delivery Notes', [820, -440], 720, 260, '## Fail-closed delivery\n\nOnly schema-valid scores at or above the configured threshold reach Google Sheets. Slack receives one digest containing at most five jobs. Empty and duplicate runs produce no external writes.')
];

const linkedInWorkflow = workflow(
  'LinkedIn Job Match Digest',
  linkedInNodes,
  connectionMap([
    ['Manual Trigger', 'Configuration'],
    ['Daily Schedule', 'Configuration'],
    ['Configuration', 'Build Actor Input'],
    ['Build Actor Input', 'Fetch LinkedIn Jobs'],
    ['Fetch LinkedIn Jobs', 'Normalize and Cap Jobs'],
    ['Normalize and Cap Jobs', 'Remove Previously Seen Jobs'],
    ['Remove Previously Seen Jobs', 'Merge Job and Score', 0],
    ['Remove Previously Seen Jobs', 'Score Job Fit'],
    ['Score Job Fit', 'Merge Job and Score', 1],
    ['Merge Job and Score', 'Validate and Filter Scores'],
    ['Validate and Filter Scores', 'Append Qualified Jobs'],
    ['Append Qualified Jobs', 'Build Slack Digest'],
    ['Build Slack Digest', 'Send Slack Digest']
  ])
);

const youtubeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'keyIdeas', 'actionItems', 'timestampedMoments'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 4000 },
    keyIdeas: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 500 } },
    actionItems: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 500 } },
    timestampedMoments: {
      type: 'array',
      maxItems: 10,
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

const youtubeNodes = [
  node('20000000-', 2, 'Manual QA Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1160, 120], {}),
  node('20000000-', 3, 'Manual QA Input', 'n8n-nodes-base.code', 2, [-920, 120], {
    jsCode: String.raw`return [{ json: {
  youtubeUrl: 'https://www.youtube.com/watch?v=aircAruvnKk',
  language: 'en',
  researchGoal: 'Summarize the central argument and extract practical next steps.'
} }];`
  }),
  node('20000000-', 1, 'YouTube Research Form', 'n8n-nodes-base.formTrigger', 2.6, [-1160, -80], {
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
      useWorkflowTimezone: true,
      respondWithOptions: {
        values: {
          respondWith: 'redirect',
          redirectUrl: '={{ $("Create Notion Brief").first().json.url }}'
        }
      }
    }
  }),
  node('20000000-', 4, 'Validate Form Input', 'n8n-nodes-base.code', 2, [-680, 0], {
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
  node('20000000-', 5, 'Fetch YouTube Transcript', '@apify/n8n-nodes-apify.apify', 1, [-440, 0], actorParameters(
    'H7e6sHWbYadmHLoNu',
    'YouTube Transcript Scraper',
    '={{ JSON.stringify($json.actorInput) }}'
  )),
  node('20000000-', 6, 'Validate and Cap Transcript', 'n8n-nodes-base.code', 2, [-200, 0], {
    jsCode: String.raw`const rows = $input.all();
if (rows.length !== 1) throw new Error('Expected one transcript result, received ' + rows.length + '.');
const data = rows[0].json;
if (data.captionsAvailable === false || data.error) throw new Error('Captions are unavailable: ' + (data.error || 'no captions found'));
const transcript = String(data.transcriptText || '').trim();
if (transcript.length < 20) throw new Error('Captions are unavailable or empty for this video.');
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
  transcript: transcript.slice(0, 60000),
  transcriptTruncated: transcript.length > 60000
} }];`
  }),
  node('20000000-', 15, 'Remove Duplicate Requests', 'n8n-nodes-base.removeDuplicates', 2, [40, 0], dedupeParameters('={{ $json.dedupeKey }}')),
  node('20000000-', 7, 'Generate Research Brief', '@n8n/n8n-nodes-langchain.openAi', 2.3, [280, 120], openAiParameters(
    '=Research goal:\n{{ $json.researchGoal }}\n\nVideo title: {{ $json.title }}\nChannel: {{ $json.channelName }}\n\nTranscript:\n{{ $json.transcript }}',
    'youtube_research_brief',
    youtubeSchema,
    'Create a concise research brief grounded only in the transcript. Use timestamps only when supported by the transcript. Return the strict schema.',
    3000
  )),
  node('20000000-', 8, 'Merge Transcript and Brief', 'n8n-nodes-base.merge', 3.2, [520, 0], mergeParameters()),
  node('20000000-', 9, 'Validate and Format Brief', 'n8n-nodes-base.code', 2, [760, 0], {
    jsCode: `${parseStructured}\nconst item = $input.first().json;\nconst brief = parseStructured(item, ['summary', 'keyIdeas', 'actionItems', 'timestampedMoments']);\nif (!brief || typeof brief.summary !== 'string' || !Array.isArray(brief.keyIdeas) || !Array.isArray(brief.actionItems) || !Array.isArray(brief.timestampedMoments)) {\n  throw new Error('OpenAI returned an invalid research brief.');\n}\nfor (const moment of brief.timestampedMoments) {\n  if (!moment || typeof moment.timestamp !== 'string' || typeof moment.title !== 'string' || typeof moment.insight !== 'string') throw new Error('OpenAI returned an invalid timestamped moment.');\n}\nconst section = (heading, values) => values.length ? heading + '\\n' + values.map((value) => '- ' + value).join('\\n') : heading + '\\n- None';\nconst moments = brief.timestampedMoments.map((moment) => moment.timestamp + ' - ' + moment.title + ': ' + moment.insight);\nconst notionBody = [\n  item.videoUrl,\n  'Research goal: ' + item.researchGoal,\n  'Summary\\n' + brief.summary,\n  section('Key ideas', brief.keyIdeas),\n  section('Action items', brief.actionItems),\n  section('Timestamped moments', moments),\n  item.transcriptTruncated ? 'Note: Transcript input was capped at 60,000 characters.' : ''\n].filter(Boolean).join('\\n\\n');\nif (notionBody.length > 19000) throw new Error('Formatted Notion brief is too long.');\nconst notionChunks = [];\nfor (const paragraph of notionBody.split('\\n\\n')) {\n  let remaining = paragraph;\n  while (remaining.length > 1900) {\n    let splitAt = remaining.lastIndexOf('\\n', 1900);\n    if (splitAt < 1000) splitAt = remaining.lastIndexOf(' ', 1900);\n    if (splitAt < 1000) splitAt = 1900;\n    notionChunks.push(remaining.slice(0, splitAt).trim());\n    remaining = remaining.slice(splitAt).trim();\n  }\n  if (remaining) notionChunks.push(remaining);\n}\nif (notionChunks.length > 10) throw new Error('Formatted Notion brief requires too many blocks.');\nreturn [{ json: { title: item.title, videoUrl: item.videoUrl, notionBody, notionChunks } }];`
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
      blockValues: Array.from({ length: 10 }, (_, index) => ({
        type: 'paragraph',
        richText: false,
        textContent: `={{ $json.notionChunks[${index}] || '' }}`
      }))
    },
    options: {}
  }),
  node('20000000-', 11, 'Return Notion URL', 'n8n-nodes-base.code', 2, [1240, 0], {
    jsCode: String.raw`const page = $input.first().json;
if (!page.url || !String(page.url).startsWith('https://')) throw new Error('Notion did not return a page URL.');
return [{ json: { url: page.url, formSubmittedText: 'Research brief created: ' + page.url } }];`
  }),
  sticky('20000000-', 12, 'Form Setup Notes', [-1200, -440], 760, 250, '## YouTube Research Brief\n\nConnect Apify, OpenAI, and Notion credentials, then select the `FetchCat n8n QA Briefs` database. The form accepts one public HTTPS YouTube URL, language code, and research goal. Keep the workflow unpublished during QA.'),
  sticky('20000000-', 13, 'QA Notes', [-420, -440], 900, 250, '## Cost and failure controls\n\nThe Actor receives exactly one video. Empty or unavailable captions stop the workflow before OpenAI and Notion. Transcript input is capped at 60,000 characters. Confirm the captioned public video in Manual QA Input before CLI execution.'),
  sticky('20000000-', 14, 'Output Notes', [500, -440], 960, 250, '## Notion output\n\nExact video and research-goal reruns are removed before OpenAI and Notion. OpenAI must satisfy a strict JSON schema. The resulting page contains a summary, key ideas, action items, and timestamped moments. Form submissions redirect to the created Notion page.')
];

const youtubeWorkflow = workflow(
  'YouTube Research Brief to Notion',
  youtubeNodes,
  connectionMap([
    ['YouTube Research Form', 'Validate Form Input'],
    ['Manual QA Trigger', 'Manual QA Input'],
    ['Manual QA Input', 'Validate Form Input'],
    ['Validate Form Input', 'Fetch YouTube Transcript'],
    ['Fetch YouTube Transcript', 'Validate and Cap Transcript'],
    ['Validate and Cap Transcript', 'Remove Duplicate Requests'],
    ['Remove Duplicate Requests', 'Merge Transcript and Brief', 0],
    ['Remove Duplicate Requests', 'Generate Research Brief'],
    ['Generate Research Brief', 'Merge Transcript and Brief', 1],
    ['Merge Transcript and Brief', 'Validate and Format Brief'],
    ['Validate and Format Brief', 'Create Notion Brief'],
    ['Create Notion Brief', 'Return Notion URL']
  ])
);

const redditSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['qualified', 'buyingIntent', 'score', 'reason', 'summary'],
  properties: {
    qualified: { type: 'boolean' },
    buyingIntent: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string', minLength: 1, maxLength: 500 },
    summary: { type: 'string', minLength: 1, maxLength: 500 }
  }
};

const redditNodes = [
  node('30000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1280, 80], {}),
  node('30000000-', 2, 'Every Two Hours', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1280, -100], {
    rule: { interval: [{ field: 'hours', hoursInterval: 2, triggerAtMinute: 0 }] }
  }),
  node('30000000-', 3, 'Configuration', 'n8n-nodes-base.code', 2, [-1040, 0], {
    jsCode: String.raw`return [{ json: {
  searchQuery: 'web scraping',
  subreddit: '',
  sort: 'relevance',
  timeFilter: 'week',
  productContext: 'Managed web-scraping Actors and n8n automation services for business research, monitoring, and lead generation.',
  minimumScore: 70,
  maxItems: 10
} }];`
  }),
  node('30000000-', 4, 'Build Actor Input', 'n8n-nodes-base.code', 2, [-800, 0], {
    jsCode: String.raw`const config = $input.first().json;
if (!config.searchQuery || String(config.searchQuery).length < 3) throw new Error('Configure a Reddit search query.');
if (!config.productContext || String(config.productContext).length < 20) throw new Error('Product context must be at least 20 characters.');
const allowedSorts = new Set(['hot', 'new', 'top', 'rising', 'relevance']);
const allowedTimeFilters = new Set(['hour', 'day', 'week', 'month', 'year', 'all']);
const sort = allowedSorts.has(config.sort) ? config.sort : 'relevance';
const timeFilter = allowedTimeFilters.has(config.timeFilter) ? config.timeFilter : 'week';
const maxItems = Math.max(1, Math.min(Number(config.maxItems) || 10, 10));
return [{ json: { actorInput: {
  searchQuery: String(config.searchQuery),
  searchSubreddit: String(config.subreddit || ''),
  sort,
  timeFilter,
  maxPostsPerSource: maxItems,
  includeComments: false
} } }];`
  }),
  node('30000000-', 5, 'Fetch Reddit Posts', '@apify/n8n-nodes-apify.apify', 1, [-560, 0], actorParameters(
    'DAj0KBMoCNDqMLe82',
    'Reddit Scraper',
    '={{ JSON.stringify($json.actorInput) }}'
  )),
  node('30000000-', 6, 'Normalize and Cap Posts', 'n8n-nodes-base.code', 2, [-320, 0], {
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
  node('30000000-', 7, 'Remove Previously Seen Posts', 'n8n-nodes-base.removeDuplicates', 2, [-80, 0], dedupeParameters('={{ $json.redditId }}')),
  node('30000000-', 8, 'Classify Buying Intent', '@n8n/n8n-nodes-langchain.openAi', 2.3, [160, 120], openAiParameters(
    '=Product context:\n{{ $("Configuration").first().json.productContext }}\n\nMinimum score for qualification: {{ $("Configuration").first().json.minimumScore }}\n\nClassify this Reddit post:\n{{ JSON.stringify($json) }}',
    'reddit_buying_intent',
    redditSchema,
    'Classify explicit buying intent and relevance to the product context. Do not infer sensitive traits. Set qualified to true exactly when buying intent is high or medium and score meets the supplied minimum. Always provide non-empty reason and summary fields. Return the strict schema.',
    1500
  )),
  node('30000000-', 9, 'Merge Post and Classification', 'n8n-nodes-base.merge', 3.2, [400, 0], mergeParameters()),
  node('30000000-', 10, 'Validate and Filter Intent', 'n8n-nodes-base.code', 2, [640, 0], {
    jsCode: `${parseStructured}\nconst minimumScore = Number($("Configuration").first().json.minimumScore);\nconst intents = new Set(['high', 'medium', 'low', 'none']);\nconst output = [];\nfor (const item of $input.all()) {\n  const result = parseStructured(item.json, ['qualified', 'buyingIntent', 'score', 'reason', 'summary']);\n  if (!result || typeof result.qualified !== 'boolean' || !intents.has(result.buyingIntent) || !Number.isInteger(result.score) || result.score < 0 || result.score > 100 || typeof result.reason !== 'string' || !result.reason.trim() || typeof result.summary !== 'string' || !result.summary.trim()) continue;\n  if (!result.qualified || !['high', 'medium'].includes(result.buyingIntent) || result.score < minimumScore) continue;\n  output.push({ json: {\n    redditId: item.json.redditId,\n    subreddit: item.json.subreddit,\n    title: item.json.title,\n    url: item.json.url,\n    createdAt: item.json.createdAt,\n    redditScore: item.json.score,\n    commentCount: item.json.commentCount,\n    intent: result.buyingIntent,\n    intentScore: result.score,\n    reason: result.reason,\n    summary: result.summary\n  } });\n}\nreturn output;`
  }),
  node('30000000-', 11, 'Build Telegram Digest', 'n8n-nodes-base.code', 2, [880, 0], {
    jsCode: String.raw`const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const posts = $input.all().map((item) => item.json).sort((a, b) => b.intentScore - a.intentScore).slice(0, 5);
if (posts.length === 0) return [];
const lines = posts.map((post, index) => {
  const community = post.subreddit ? 'r/' + post.subreddit : 'Reddit';
  const engagement = Number(post.redditScore || 0) + ' points | ' + Number(post.commentCount || 0) + ' comments';
  const created = post.createdAt ? ' | ' + escapeHtml(post.createdAt) : '';
  return (index + 1) + '. <b>' + escapeHtml(post.title) + '</b> [' + post.intent + ', ' + post.intentScore + '/100]\n' + escapeHtml(community) + ' | ' + engagement + created + '\n' + escapeHtml(post.summary) + '\nWhy it matters: ' + escapeHtml(post.reason) + '\n<a href="' + escapeHtml(post.url) + '">Open Reddit post</a>';
});
return [{ json: { telegramMessage: '<b>Reddit Buying-Intent Alerts</b>\n\n' + lines.join('\n\n') } }];`
  }),
  node('30000000-', 12, 'Send Telegram Digest', 'n8n-nodes-base.telegram', 1.2, [1120, 0], {
    resource: 'message',
    operation: 'sendMessage',
    chatId: '-1000000000000',
    text: '={{ $json.telegramMessage }}',
    replyMarkup: 'none',
    additionalFields: { appendAttribution: false, disable_notification: false, parse_mode: 'HTML' }
  }),
  sticky('30000000-', 13, 'Setup Notes', [-1320, -440], 760, 260, '## Reddit Buying-Intent Alerts\n\nConfigure the search query, optional subreddit, sort, time window, product context, and score threshold. Global relevance search is the safest starting point for intent discovery. Connect Apify, OpenAI, and Telegram credentials, then select the dedicated QA group. Keep the two-hour schedule unpublished until QA passes.'),
  sticky('30000000-', 14, 'Safety Notes', [500, -440], 820, 260, '## Monitoring only\n\nComments are disabled and the workflow never replies to or contacts authors. It caps Actor output at 10 posts, deduplicates Reddit IDs before AI, validates strict classifications, and sends one digest containing at most five posts. Empty and duplicate runs send nothing.')
];

const redditWorkflow = workflow(
  'Reddit Buying-Intent Alerts',
  redditNodes,
  connectionMap([
    ['Manual Trigger', 'Configuration'],
    ['Every Two Hours', 'Configuration'],
    ['Configuration', 'Build Actor Input'],
    ['Build Actor Input', 'Fetch Reddit Posts'],
    ['Fetch Reddit Posts', 'Normalize and Cap Posts'],
    ['Normalize and Cap Posts', 'Remove Previously Seen Posts'],
    ['Remove Previously Seen Posts', 'Merge Post and Classification', 0],
    ['Remove Previously Seen Posts', 'Classify Buying Intent'],
    ['Classify Buying Intent', 'Merge Post and Classification', 1],
    ['Merge Post and Classification', 'Validate and Filter Intent'],
    ['Validate and Filter Intent', 'Build Telegram Digest'],
    ['Build Telegram Digest', 'Send Telegram Digest']
  ])
);

const definitions = [
  {
    slug: 'linkedin-job-match-digest',
    workflow: linkedInWorkflow,
    metadata: {
      slug: 'linkedin-job-match-digest',
      title: 'LinkedIn Job Match Digest',
      actorId: '0XhGPLTjZjicBXYV5',
      actorSlug: 'fetch_cat/linkedin-jobs-scraper',
      version: '1.0.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Google Sheets', 'Slack'],
      testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 3.34 },
      releaseState: 'development'
    }
  },
  {
    slug: 'youtube-research-brief-to-notion',
    workflow: youtubeWorkflow,
    metadata: {
      slug: 'youtube-research-brief-to-notion',
      title: 'YouTube Research Brief to Notion',
      actorId: 'H7e6sHWbYadmHLoNu',
      actorSlug: 'fetch_cat/youtube-transcript-scraper',
      version: '1.0.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Notion'],
      testLimits: { actorItems: 1, apifyBackedExecutions: 3, budgetUsd: 3.33, youtubeVideos: 1 },
      releaseState: 'development'
    }
  },
  {
    slug: 'reddit-buying-intent-alerts',
    workflow: redditWorkflow,
    metadata: {
      slug: 'reddit-buying-intent-alerts',
      title: 'Reddit Buying-Intent Alerts',
      actorId: 'DAj0KBMoCNDqMLe82',
      actorSlug: 'fetch_cat/reddit-scraper',
      version: '1.0.0',
      minimumN8nVersion: '2.26.8',
      integrations: ['Apify', 'OpenAI', 'Telegram'],
      testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 3.33 },
      releaseState: 'development'
    }
  }
];

for (const definition of definitions) {
  writeJson(workflowPath(definition.slug), definition.workflow);
  writeJson(workflowPath(definition.slug, 'metadata.json'), definition.metadata);
}

console.log(`Built ${definitions.length} workflows.`);
