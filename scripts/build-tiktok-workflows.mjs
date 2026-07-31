const ACTOR_ID = 'B5qu4d1iteAp2TaF1';
const ACTOR_SLUG = 'fetch_cat/tiktok-profile-scraper';

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

function apifyRunParameters(bodyExpression) {
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
    jsonBody: bodyExpression,
    options: {
      timeout: 310000,
      response: { response: { responseFormat: 'json' } }
    }
  };
}

function apifyDatasetParameters(limitExpression) {
  return {
    method: 'GET',
    url: '=https://api.apify.com/v2/datasets/{{ $json.data.defaultDatasetId }}/items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: 'clean', value: 'true' },
        { name: 'limit', value: limitExpression }
      ]
    },
    options: {
      timeout: 60000,
      response: { response: { responseFormat: 'json' } }
    }
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

const simpleFields = [
  { name: 'Updated at', type: 'number' },
  { name: 'Profile' },
  { name: 'TikTok handle' },
  { name: 'Name' },
  { name: 'Bio' },
  { name: 'Followers', type: 'number' },
  { name: 'Following', type: 'number' },
  { name: 'Total likes', type: 'number' },
  { name: 'Videos', type: 'number' },
  { name: 'Likes per video', type: 'number' },
  { name: 'Follower/following ratio', type: 'number' },
  { name: 'Verified', type: 'boolean' },
  { name: 'Private account', type: 'boolean' },
  { name: 'Region' },
  { name: 'Language' },
  { name: 'Bio link' },
  { name: 'Commerce account', type: 'boolean' },
  { name: 'TikTok seller', type: 'boolean' },
  { name: 'Live now', type: 'boolean' },
  { name: 'User ID' }
];

const normalizeProfileCode = String.raw`
const rows = $input.all().map((item) => item.json).filter((item) => item && item.handle && !item.error);
if (rows.length === 0) throw new Error('TikTok returned no public profiles. Check the handles or profile URLs and inspect the Actor run.');
const sheetsEpochOffset = 25569;
const serial = (value) => {
  const date = new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.getTime() / 86400000 + sheetsEpochOffset : null;
};
const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const formula = (url, label) => url ? '=HYPERLINK("' + String(url).replace(/"/g, '""') + '","' + String(label).replace(/"/g, '""') + '")' : '';
return rows.map((profile) => {
  const handleKey = String(profile.handle).trim().replace(/^@/, '').toLowerCase();
  const profileUrl = String(profile.profileUrl || ('https://www.tiktok.com/@' + handleKey));
  return { json: {
    updatedAt: serial(profile.scrapedAt),
    scrapedAtIso: new Date(profile.scrapedAt || Date.now()).toISOString(),
    profileLink: formula(profileUrl, '@' + handleKey),
    profileUrl,
    handle: '@' + handleKey,
    handleKey,
    nickname: String(profile.nickname || ''),
    bio: String(profile.signature || ''),
    followers: numberOrNull(profile.followers),
    following: numberOrNull(profile.following),
    likes: numberOrNull(profile.likes),
    videosCount: numberOrNull(profile.videosCount),
    likesPerVideo: numberOrNull(profile.likesPerVideo),
    followerFollowingRatio: numberOrNull(profile.followerFollowingRatio),
    verified: profile.verified === true,
    privateAccount: profile.privateAccount === true,
    region: String(profile.region || ''),
    language: String(profile.language || ''),
    bioLink: formula(profile.bioLink, 'Open bio link'),
    bioLinkUrl: String(profile.bioLink || ''),
    commerceUser: profile.commerceUser === true,
    tiktokSeller: profile.tiktokSeller === true,
    isLive: profile.isLive === true,
    userId: String(profile.userId || '')
  } };
});`;

const simpleNodes = [
  node('60000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1568, 160], {}),
  node('60000000-', 7, 'Daily 09:00 Trigger', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1568, -40], {
    rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 9, triggerAtMinute: 0 }] }
  }),
  node('60000000-', 2, '1. Enter TikTok Profiles', 'n8n-nodes-base.set', 3.4, [-1328, 80], {
    mode: 'manual',
    duplicateItem: false,
    assignments: { assignments: [
      { id: 'tiktok-profiles', name: 'profiles', value: 'tiktok\napify', type: 'string' },
      { id: 'tiktok-limit', name: 'maxProfiles', value: 25, type: 'number' }
    ] },
    options: {}
  }),
  node('60000000-', 3, 'Validate Profiles and Build Actor Input', 'n8n-nodes-base.code', 2, [-1088, 80], {
    jsCode: String.raw`const input = $input.first()?.json || {};
const raw = String(input.profiles || '').split(/[\n,]+/).map((value) => value.trim()).filter(Boolean);
const maxProfiles = Math.max(1, Math.min(500, Math.floor(Number(input.maxProfiles) || 25)));
if (raw.length === 0) throw new Error('Enter at least one TikTok handle or profile URL.');
const handles = [];
const profileUrls = [];
const seen = new Set();
for (const value of raw) {
  const urlMatch = value.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]+)/i);
  const handle = (urlMatch?.[1] || value.replace(/^@/, '')).trim();
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(handle)) throw new Error('Invalid TikTok profile: ' + value);
  const key = handle.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  if (urlMatch) profileUrls.push({ url: 'https://www.tiktok.com/@' + handle });
  else handles.push(handle);
}
if (seen.size > maxProfiles) throw new Error('You entered ' + seen.size + ' unique profiles but maxProfiles is ' + maxProfiles + '.');
return [{ json: { maxProfiles, actorInput: { handles, profileUrls, maxProfiles, includeRecentVideos: false, maxVideosPerProfile: 0, maxConcurrency: 3, runTimeSecs: 180, proxyConfiguration: { useApifyProxy: true } } } }];`
  }),
  node('60000000-', 4, '2. Run FetchCat TikTok Profile Scraper', 'n8n-nodes-base.httpRequest', 4.3, [-848, 80], apifyRunParameters('={{ $json.actorInput }}')),
  node('60000000-', 5, 'Download TikTok Profile Results', 'n8n-nodes-base.httpRequest', 4.3, [-608, 80], apifyDatasetParameters('={{ $("Validate Profiles and Build Actor Input").first().json.maxProfiles }}')),
  node('60000000-', 6, 'Prepare Human-Readable Profile Rows', 'n8n-nodes-base.code', 2, [-368, 80], { jsCode: normalizeProfileCode }),
  node('60000000-', 7, '3. Save Profiles to Google Sheets', 'n8n-nodes-base.googleSheets', 4.7, [-128, 80], {
    operation: 'appendOrUpdate',
    ...sheetRef('TikTok Profiles'),
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['TikTok handle'],
      value: {
        'Updated at': '={{ $json.updatedAt }}',
        Profile: '={{ $json.profileLink }}',
        'TikTok handle': '={{ $json.handle }}',
        Name: '={{ $json.nickname }}',
        Bio: '={{ $json.bio }}',
        Followers: '={{ $json.followers }}',
        Following: '={{ $json.following }}',
        'Total likes': '={{ $json.likes }}',
        Videos: '={{ $json.videosCount }}',
        'Likes per video': '={{ $json.likesPerVideo }}',
        'Follower/following ratio': '={{ $json.followerFollowingRatio }}',
        Verified: '={{ $json.verified }}',
        'Private account': '={{ $json.privateAccount }}',
        Region: '={{ $json.region }}',
        Language: '={{ $json.language }}',
        'Bio link': '={{ $json.bioLink }}',
        'Commerce account': '={{ $json.commerceUser }}',
        'TikTok seller': '={{ $json.tiktokSeller }}',
        'Live now': '={{ $json.isLive }}',
        'User ID': '={{ $json.userId }}'
      },
      schema: sheetSchema(simpleFields, ['TikTok handle']),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: { useAppend: true }
  }),
  sticky('60000000-', 20, 'Workflow Overview', [-2200, -300], 480, 900, `## Export TikTok Profiles to Google Sheets

Collect current public TikTok profile data with \`${ACTOR_SLUG}\` and save one clean, sortable row per creator. This workflow works on n8n Cloud or self-hosted n8n, uses built-in nodes, and does not require OpenAI.

### How it works

1. Starts manually or every day at 09:00 and reads handles or full TikTok profile URLs from one editable Set node.
2. Validates and deduplicates the list before spending Actor credits.
3. Runs the FetchCat TikTok Profile Scraper once for the complete batch.
4. Converts public metrics and account signals into human-readable columns.
5. Updates Google Sheets by TikTok handle, so reruns refresh existing rows instead of creating duplicates.

### Setup

- [ ] Paste up to 500 handles or profile URLs into 1. Enter TikTok Profiles.
- [ ] Create an Apify HTTP Header Auth credential and select it in both FetchCat request nodes.
- [ ] Create a TikTok Profiles sheet with the documented headers.
- [ ] Connect Google Sheets and select the spreadsheet and tab in 3. Save Profiles to Google Sheets.
- [ ] Run manually and inspect the resulting profile table, then publish the workflow to enable the daily schedule.

Recent videos are intentionally disabled because TikTok does not expose them consistently.`, 1),
  sticky('60000000-', 21, 'Enter Profile List', [-1616, -240], 480, 560, '## Enter the profile list\n\nStart manually or every day at 09:00, then use the editable Set node to provide TikTok handles or full profile URLs and choose a batch limit.'),
  sticky('60000000-', 22, 'Run Profile Scraper', [-1136, -240], 480, 480, `## Run the FetchCat Actor\n\nValidates and deduplicates the input, runs \`${ACTOR_SLUG}\` once, and downloads the completed dataset.`),
  sticky('60000000-', 23, 'Save Profile Table', [-656, -240], 768, 480, '## Save a readable profile table\n\nNormalizes dates, metrics, links, and account signals, then updates Google Sheets using TikTok handle as the unique key.')
];

const simpleWorkflow = workflow(
  'Export TikTok Profiles to Google Sheets with Apify',
  simpleNodes,
  connectionMap([
    ['Manual Trigger', '1. Enter TikTok Profiles'],
    ['Daily 09:00 Trigger', '1. Enter TikTok Profiles'],
    ['1. Enter TikTok Profiles', 'Validate Profiles and Build Actor Input'],
    ['Validate Profiles and Build Actor Input', '2. Run FetchCat TikTok Profile Scraper'],
    ['2. Run FetchCat TikTok Profile Scraper', 'Download TikTok Profile Results'],
    ['Download TikTok Profile Results', 'Prepare Human-Readable Profile Rows'],
    ['Prepare Human-Readable Profile Rows', '3. Save Profiles to Google Sheets']
  ])
);

const historyFields = [
  { name: 'Snapshot key' },
  { name: 'Snapshot at', type: 'number' },
  { name: 'Label' },
  { name: 'Profile' },
  { name: 'TikTok handle' },
  { name: 'Name' },
  { name: 'Followers', type: 'number' },
  { name: 'Follower change', type: 'number' },
  { name: 'Follower growth %', type: 'number' },
  { name: 'Total likes', type: 'number' },
  { name: 'Total likes change', type: 'number' },
  { name: 'Videos', type: 'number' },
  { name: 'Video count change', type: 'number' },
  { name: 'Qualification' },
  { name: 'Change status' }
];

const currentFields = [
  { name: 'Updated at', type: 'number' },
  { name: 'Label' },
  { name: 'Profile' },
  { name: 'TikTok handle' },
  { name: 'Name' },
  { name: 'Bio' },
  { name: 'Followers', type: 'number' },
  { name: 'Follower change', type: 'number' },
  { name: 'Follower growth %', type: 'number' },
  { name: 'Following', type: 'number' },
  { name: 'Total likes', type: 'number' },
  { name: 'Total likes change', type: 'number' },
  { name: 'Videos', type: 'number' },
  { name: 'Video count change', type: 'number' },
  { name: 'Likes per video', type: 'number' },
  { name: 'Verified', type: 'boolean' },
  { name: 'Region' },
  { name: 'Language' },
  { name: 'Bio link' },
  { name: 'Qualification' },
  { name: 'Change status' }
];

const monitorNodes = [
  node('61000000-', 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-2080, 160], {}),
  node('61000000-', 2, 'Weekly Monday Trigger', 'n8n-nodes-base.scheduleTrigger', 1.3, [-2080, -40], {
    rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 9, triggerAtMinute: 0 }] }
  }),
  { ...node('61000000-', 3, '1. Read Creator Watchlist', 'n8n-nodes-base.googleSheets', 4.7, [-1808, 80], {
    operation: 'read',
    ...sheetRef('Creators'),
    options: {}
  }), alwaysOutputData: true },
  node('61000000-', 4, 'Validate Watchlist and Build Actor Input', 'n8n-nodes-base.code', 2, [-1568, 80], {
    jsCode: String.raw`const rows = $input.all().map((item) => item.json || {});
const isActive = (value) => !['false', 'no', '0', 'inactive'].includes(String(value ?? '').trim().toLowerCase());
const numberOr = (value, fallback) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? fallback : Number(value);
const configs = [];
const seen = new Set();
for (const row of rows) {
  const source = String(row['TikTok handle or URL'] || row['TikTok handle'] || row.Handle || row.handle || '').trim();
  if (!source || !isActive(row.Active)) continue;
  const urlMatch = source.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]+)/i);
  const handle = (urlMatch?.[1] || source.replace(/^@/, '')).trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,64}$/.test(handle)) throw new Error('Invalid TikTok creator in Creators sheet: ' + source);
  if (seen.has(handle)) continue;
  seen.add(handle);
  const minimumFollowers = Math.max(0, numberOr(row['Minimum followers'], 0));
  const maximumFollowers = Math.max(minimumFollowers, numberOr(row['Maximum followers'], 1000000000));
  configs.push({
    handle,
    label: String(row.Label || row.Niche || '').trim(),
    minimumFollowers,
    maximumFollowers,
    alertGrowthPercent: Math.max(0, numberOr(row['Alert growth %'], 5)),
    alertFollowerGain: Math.max(0, numberOr(row['Alert follower gain'], 1000))
  });
}
if (configs.length === 0) throw new Error('Add at least one active creator to the Creators sheet.');
if (configs.length > 500) throw new Error('The monitor supports at most 500 active creators per run.');
return [{ json: {
  configs,
  actorInput: { handles: configs.map((entry) => entry.handle), profileUrls: [], maxProfiles: configs.length, includeRecentVideos: false, maxVideosPerProfile: 0, maxConcurrency: 3, runTimeSecs: 270, proxyConfiguration: { useApifyProxy: true } }
} }];`
  }),
  node('61000000-', 5, '2. Run FetchCat TikTok Profile Scraper', 'n8n-nodes-base.httpRequest', 4.3, [-1328, 80], apifyRunParameters('={{ $json.actorInput }}')),
  node('61000000-', 6, 'Download Current TikTok Profiles', 'n8n-nodes-base.httpRequest', 4.3, [-1088, 80], apifyDatasetParameters('={{ $("Validate Watchlist and Build Actor Input").first().json.configs.length }}')),
  node('61000000-', 7, 'Normalize Current Creator Metrics', 'n8n-nodes-base.code', 2, [-848, 80], { jsCode: normalizeProfileCode }),
  { ...node('61000000-', 8, 'Read Previous Creator Metrics', 'n8n-nodes-base.googleSheets', 4.7, [-608, 80], {
    operation: 'read',
    ...sheetRef('Current Profiles'),
    options: {}
  }), executeOnce: true, alwaysOutputData: true },
  node('61000000-', 9, 'Compare Growth and Qualification', 'n8n-nodes-base.code', 2, [-368, 80], {
    jsCode: String.raw`const current = $('Normalize Current Creator Metrics').all().map((item) => item.json);
const previousRows = $input.all().map((item) => item.json || {});
const configs = $('Validate Watchlist and Build Actor Input').first().json.configs;
const configByHandle = new Map(configs.map((entry) => [entry.handle, entry]));
const normalizeHandle = (value) => String(value || '').trim().replace(/^@/, '').toLowerCase();
const numberOrNull = (value) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
const previousByHandle = new Map();
for (const row of previousRows) {
  const handle = normalizeHandle(row['TikTok handle'] || row.Handle || row.handle);
  if (handle) previousByHandle.set(handle, row);
}
const round = (value, digits = 2) => value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
const rows = current.map((profile) => {
  const config = configByHandle.get(profile.handleKey) || { label: '', minimumFollowers: 0, maximumFollowers: 1000000000, alertGrowthPercent: 5, alertFollowerGain: 1000 };
  const previous = previousByHandle.get(profile.handleKey);
  const previousFollowers = numberOrNull(previous?.Followers);
  const previousLikes = numberOrNull(previous?.['Total likes']);
  const previousVideos = numberOrNull(previous?.Videos);
  const baseline = previousFollowers === null;
  const followerChange = baseline || profile.followers === null ? null : profile.followers - previousFollowers;
  const followerGrowthPercent = followerChange === null || previousFollowers <= 0 ? null : round((followerChange / previousFollowers) * 100);
  const likesChange = previousLikes === null || profile.likes === null ? null : profile.likes - previousLikes;
  const videoChange = previousVideos === null || profile.videosCount === null ? null : profile.videosCount - previousVideos;
  let qualification = 'Qualified';
  if (profile.followers === null) qualification = 'Needs review';
  else if (profile.followers < config.minimumFollowers) qualification = 'Below minimum';
  else if (profile.followers > config.maximumFollowers) qualification = 'Above maximum';
  const previousQualification = String(previous?.Qualification || '');
  const qualificationChanged = Boolean(previousQualification && previousQualification !== qualification);
  const meaningfulGrowth = (followerGrowthPercent ?? 0) >= config.alertGrowthPercent || (followerChange ?? 0) >= config.alertFollowerGain;
  const meaningfulDecline = (followerGrowthPercent ?? 0) <= -config.alertGrowthPercent;
  const shouldAlert = baseline || meaningfulGrowth || meaningfulDecline || qualificationChanged;
  let changeStatus = 'No material change';
  if (baseline) changeStatus = 'Baseline created';
  else if (meaningfulGrowth) changeStatus = 'Growth alert';
  else if (meaningfulDecline) changeStatus = 'Decline alert';
  else if (qualificationChanged) changeStatus = 'Qualification changed';
  return {
    ...profile,
    label: config.label,
    followerChange,
    followerGrowthPercent,
    likesChange,
    videoChange,
    qualification,
    changeStatus,
    shouldAlert,
    snapshotKey: profile.scrapedAtIso + '|' + profile.handleKey
  };
});
const alertRows = rows.filter((row) => row.shouldAlert).sort((a, b) => (b.followerGrowthPercent ?? -Infinity) - (a.followerGrowthPercent ?? -Infinity));
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const formatNumber = (value) => value === null ? 'unavailable' : Number(value).toLocaleString('en-US');
const formatSigned = (value) => (value > 0 ? '+' : '') + formatNumber(value);
const formatPercent = (value) => value === null ? 'unavailable' : (value > 0 ? '+' : '') + value + '%';
const title = rows.every((row) => row.changeStatus === 'Baseline created') ? 'TikTok creator baseline created' : 'TikTok creator changes';
const lines = alertRows.slice(0, 10).map((row, index) => {
  const label = row.label ? ' | ' + escapeHtml(row.label) : '';
  const heading = (index + 1) + '. <a href="' + escapeHtml(row.profileUrl) + '"><b>' + escapeHtml(row.handle) + '</b></a>' + label;
  const totals = formatNumber(row.followers) + ' followers | ' + formatNumber(row.videosCount) + ' videos';
  if (row.changeStatus === 'Baseline created') {
    return heading + '\n' + totals + '\n' + escapeHtml(row.qualification) + ' | First snapshot saved. Future runs will show changes.';
  }
  return heading + '\n' + totals + '\nFollower change: ' + formatSigned(row.followerChange) + ' (' + formatPercent(row.followerGrowthPercent) + ') | Video change: ' +
    formatSigned(row.videoChange) + '\n' + escapeHtml(row.qualification) + ' | ' + escapeHtml(row.changeStatus);
});
const telegramMessage = '<b>' + title + '</b>\n\n' + lines.join('\n\n') + (alertRows.length > 10 ? '\n\n+' + (alertRows.length - 10) + ' more changed creators in Google Sheets.' : '');
return [{ json: { rows, shouldAlert: alertRows.length > 0, alertCount: alertRows.length, telegramMessage } }];`
  }),
  node('61000000-', 10, 'Has Baseline or Meaningful Changes', 'n8n-nodes-base.if', 2.2, [-128, 80], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [
      { id: 'tiktok-monitor-alert', leftValue: '={{ $json.shouldAlert }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }
    ], combinator: 'and' },
    options: {}
  }),
  node('61000000-', 11, '3. Send Creator Changes to Telegram', 'n8n-nodes-base.telegram', 1.2, [112, -80], {
    resource: 'message',
    operation: 'sendMessage',
    chatId: '-1000000000000',
    text: '={{ $json.telegramMessage }}',
    replyMarkup: 'none',
    additionalFields: { appendAttribution: false, disable_notification: false, parse_mode: 'HTML' }
  }),
  { ...node('61000000-', 12, 'Prepare Snapshot Rows', 'n8n-nodes-base.code', 2, [352, 80], {
    jsCode: String.raw`return [{ json: $('Compare Growth and Qualification').first().json }];`
  }), executeOnce: true },
  node('61000000-', 13, 'Expand Snapshot History', 'n8n-nodes-base.code', 2, [592, 80], {
    jsCode: 'return $json.rows.map((row) => ({ json: row }));'
  }),
  node('61000000-', 14, '4. Append Snapshot History', 'n8n-nodes-base.googleSheets', 4.7, [832, 80], {
    operation: 'append',
    ...sheetRef('Snapshot History'),
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: [],
      value: {
        'Snapshot key': '={{ $json.snapshotKey }}',
        'Snapshot at': '={{ $json.updatedAt }}',
        Label: '={{ $json.label }}',
        Profile: '={{ $json.profileLink }}',
        'TikTok handle': '={{ $json.handle }}',
        Name: '={{ $json.nickname }}',
        Followers: '={{ $json.followers }}',
        'Follower change': '={{ $json.followerChange }}',
        'Follower growth %': '={{ $json.followerGrowthPercent }}',
        'Total likes': '={{ $json.likes }}',
        'Total likes change': '={{ $json.likesChange }}',
        Videos: '={{ $json.videosCount }}',
        'Video count change': '={{ $json.videoChange }}',
        Qualification: '={{ $json.qualification }}',
        'Change status': '={{ $json.changeStatus }}'
      },
      schema: sheetSchema(historyFields),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: {}
  }),
  { ...node('61000000-', 15, 'Continue After History', 'n8n-nodes-base.code', 2, [1072, 80], {
    jsCode: String.raw`return [{ json: $('Prepare Snapshot Rows').first().json }];`
  }), executeOnce: true },
  node('61000000-', 16, 'Expand Current Profiles', 'n8n-nodes-base.code', 2, [1312, 80], {
    jsCode: 'return $json.rows.map((row) => ({ json: row }));'
  }),
  node('61000000-', 17, '5. Update Current Profiles', 'n8n-nodes-base.googleSheets', 4.7, [1552, 80], {
    operation: 'appendOrUpdate',
    ...sheetRef('Current Profiles'),
    columns: {
      mappingMode: 'defineBelow',
      matchingColumns: ['TikTok handle'],
      value: {
        'Updated at': '={{ $json.updatedAt }}',
        Label: '={{ $json.label }}',
        Profile: '={{ $json.profileLink }}',
        'TikTok handle': '={{ $json.handle }}',
        Name: '={{ $json.nickname }}',
        Bio: '={{ $json.bio }}',
        Followers: '={{ $json.followers }}',
        'Follower change': '={{ $json.followerChange }}',
        'Follower growth %': '={{ $json.followerGrowthPercent }}',
        Following: '={{ $json.following }}',
        'Total likes': '={{ $json.likes }}',
        'Total likes change': '={{ $json.likesChange }}',
        Videos: '={{ $json.videosCount }}',
        'Video count change': '={{ $json.videoChange }}',
        'Likes per video': '={{ $json.likesPerVideo }}',
        Verified: '={{ $json.verified }}',
        Region: '={{ $json.region }}',
        Language: '={{ $json.language }}',
        'Bio link': '={{ $json.bioLink }}',
        Qualification: '={{ $json.qualification }}',
        'Change status': '={{ $json.changeStatus }}'
      },
      schema: sheetSchema(currentFields, ['TikTok handle']),
      attemptToConvertTypes: false,
      convertFieldsToString: false
    },
    options: { useAppend: true }
  }),
  { ...node('61000000-', 18, 'Creator Monitor Complete', 'n8n-nodes-base.code', 2, [1792, 80], {
    jsCode: String.raw`const result = $('Compare Growth and Qualification').first().json;
return [{ json: { status: 'complete', profilesUpdated: result.rows.length, alertsSent: result.alertCount } }];`
  }), executeOnce: true },
  sticky('61000000-', 30, 'Workflow Overview', [-2720, -380], 480, 1040, `## Monitor TikTok Creator Growth

Track a reusable TikTok creator or competitor watchlist with \`${ACTOR_SLUG}\`, Google Sheets, and Telegram. The workflow works on n8n Cloud or self-hosted n8n and uses deterministic thresholds rather than an AI model.

### How it works

1. Starts manually or every Monday at 09:00.
2. Reads active creators and alert thresholds from the Creators sheet.
3. Scrapes every profile in one efficient FetchCat Actor run.
4. Compares current followers, likes, videos, and qualification with the previous snapshot.
5. Sends a Telegram baseline on the first run and later alerts only for meaningful growth, decline, or qualification changes.
6. Appends dated history and updates the latest profile table after successful alert delivery.

### Setup

- [ ] Create the Creators, Current Profiles, and Snapshot History tabs with the documented headers.
- [ ] Add handles, labels, qualification limits, and alert thresholds to Creators.
- [ ] Select the same spreadsheet and appropriate tab in all Google Sheets nodes.
- [ ] Connect one Apify HTTP Header Auth credential to both FetchCat request nodes.
- [ ] Connect Telegram, run manually to create the baseline, then publish the schedule.

Recent-video monitoring is intentionally excluded because TikTok exposes that data inconsistently.`, 1),
  sticky('61000000-', 31, 'Load Creator Watchlist', [-2128, -280], 512, 560, '## Load the creator watchlist\n\nStarts manually or weekly and reads active handles, labels, qualification limits, and alert thresholds from Google Sheets.'),
  sticky('61000000-', 32, 'Run Batch Profile Check', [-1616, -280], 720, 560, `## Run one profile batch\n\nValidates up to 500 unique creators, runs \`${ACTOR_SLUG}\` once, and downloads the current public profile metrics.`),
  sticky('61000000-', 33, 'Compare with Previous Metrics', [-896, -280], 720, 560, '## Compare growth and qualification\n\nNormalizes current metrics, reads the previous profile table, and calculates follower, likes, video, and qualification changes.'),
  sticky('61000000-', 34, 'Route Meaningful Alerts', [-176, -280], 672, 640, '## Route meaningful alerts\n\nSends a readable first-run baseline or significant changes to Telegram. Quiet runs continue without a notification.'),
  sticky('61000000-', 35, 'Save Snapshot History', [544, -280], 672, 560, '## Save dated history\n\nAppends one dated row per creator so users can sort, chart, and audit changes over time.'),
  sticky('61000000-', 36, 'Update Current Profiles', [1264, -280], 672, 560, '## Update the latest profile table\n\nUpserts one current row per handle only after any required Telegram alert succeeds, then returns a concise execution summary.')
];

const monitorWorkflow = workflow(
  'Monitor TikTok Creator Growth with Apify, Google Sheets and Telegram',
  monitorNodes,
  connectionMap([
    ['Manual Trigger', '1. Read Creator Watchlist'],
    ['Weekly Monday Trigger', '1. Read Creator Watchlist'],
    ['1. Read Creator Watchlist', 'Validate Watchlist and Build Actor Input'],
    ['Validate Watchlist and Build Actor Input', '2. Run FetchCat TikTok Profile Scraper'],
    ['2. Run FetchCat TikTok Profile Scraper', 'Download Current TikTok Profiles'],
    ['Download Current TikTok Profiles', 'Normalize Current Creator Metrics'],
    ['Normalize Current Creator Metrics', 'Read Previous Creator Metrics'],
    ['Read Previous Creator Metrics', 'Compare Growth and Qualification'],
    ['Compare Growth and Qualification', 'Has Baseline or Meaningful Changes'],
    ['Has Baseline or Meaningful Changes', '3. Send Creator Changes to Telegram'],
    ['Has Baseline or Meaningful Changes', 'Prepare Snapshot Rows', 0, 1],
    ['3. Send Creator Changes to Telegram', 'Prepare Snapshot Rows'],
    ['Prepare Snapshot Rows', 'Expand Snapshot History'],
    ['Expand Snapshot History', '4. Append Snapshot History'],
    ['4. Append Snapshot History', 'Continue After History'],
    ['Continue After History', 'Expand Current Profiles'],
    ['Expand Current Profiles', '5. Update Current Profiles'],
    ['5. Update Current Profiles', 'Creator Monitor Complete']
  ])
);

export function buildTikTokDefinitions() {
  return [
    {
      slug: 'tiktok-profiles-to-google-sheets',
      workflow: simpleWorkflow,
      metadata: {
        slug: 'tiktok-profiles-to-google-sheets',
        title: simpleWorkflow.name,
        workflowKind: 'actor-template',
        actorId: ACTOR_ID,
        actorSlug: ACTOR_SLUG,
        version: '1.1.0',
        minimumN8nVersion: '2.26.8',
        integrations: ['Apify', 'Google Sheets'],
        testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 1 },
        releaseState: 'qa-passed'
      }
    },
    {
      slug: 'tiktok-creator-growth-monitor',
      workflow: monitorWorkflow,
      metadata: {
        slug: 'tiktok-creator-growth-monitor',
        title: monitorWorkflow.name,
        workflowKind: 'actor-template',
        actorId: ACTOR_ID,
        actorSlug: ACTOR_SLUG,
        version: '1.0.1',
        minimumN8nVersion: '2.26.8',
        integrations: ['Apify', 'Google Sheets', 'Telegram'],
        testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 1 },
        releaseState: 'qa-passed'
      }
    }
  ];
}
