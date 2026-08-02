import fs from 'node:fs';
import path from 'node:path';
import { root, workflowPath } from './lib.mjs';

const OPENAI_MODEL = 'gpt-5.4-mini';

function id(prefix, number) {
  return `${prefix}0000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function node(prefix, number, name, type, typeVersion, position, parameters, extra = {}) {
  return { parameters, id: id(prefix, number), name, type, typeVersion, position, ...extra };
}

function sticky(prefix, number, name, position, width, height, content, color = 7) {
  return node(prefix, number, name, 'n8n-nodes-base.stickyNote', 1, position, { width, height, content, color });
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

function actorRun(actorId, body = '={{ $json.actorInput }}') {
  return {
    method: 'POST',
    url: `https://api.apify.com/v2/acts/${actorId}/runs`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Accept-Encoding', value: 'identity' }] },
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'waitForFinish', value: '300' }] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: body,
    options: { timeout: 310000, response: { response: { responseFormat: 'json' } } }
  };
}

function actorDataset(limit = '10') {
  return {
    method: 'GET',
    url: '=https://api.apify.com/v2/datasets/{{ $json.data.defaultDatasetId }}/items',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'clean', value: 'true' }, { name: 'limit', value: limit }] },
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
  };
}

const ledgerColumns = [
  { name: 'workflowSlug', type: 'string' },
  { name: 'itemKey', type: 'string' },
  { name: 'destination', type: 'string' },
  { name: 'deliveredAt', type: 'date' }
];

function dataTable(name) {
  return { __rl: true, mode: 'name', value: name };
}

function createLedger() {
  return {
    resource: 'table', operation: 'create', tableName: 'FetchCat Delivery Ledger',
    columns: { column: ledgerColumns }, options: { createIfNotExists: true }
  };
}

function ledgerCheck(slug) {
  return {
    resource: 'row', operation: 'rowNotExists', dataTableId: dataTable('FetchCat Delivery Ledger'),
    matchType: 'allConditions', filters: { conditions: [
      { keyName: 'workflowSlug', condition: 'eq', keyValue: slug },
      { keyName: 'itemKey', condition: 'eq', keyValue: '={{ $json.itemKey }}' }
    ] }
  };
}

function ledgerInsert(destination) {
  return {
    resource: 'row', operation: 'insert', dataTableId: dataTable('FetchCat Delivery Ledger'),
    columns: {
      mappingMode: 'defineBelow', matchingColumns: [],
      value: {
        workflowSlug: '={{ $json.workflowSlug }}', itemKey: '={{ $json.itemKey }}', destination,
        deliveredAt: '={{ $now.toISO() }}'
      },
      schema: ledgerColumns.map(({ name }) => ({ id: name, displayName: name, required: false, defaultMatch: false, display: true, type: name === 'deliveredAt' ? 'dateTime' : 'string', canBeUsedToMatch: true })),
      attemptToConvertTypes: false, convertFieldsToString: false
    }, options: {}
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
    for (const key of ['output_text', 'outputText', 'text', 'content', 'output', 'message', 'response', 'data']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) { const found = visit(value[key]); if (found) return found; }
    }
    for (const nested of Array.isArray(value) ? value : Object.values(value)) { const found = visit(nested); if (found) return found; }
    return null;
  }
  return visit(root);
}`;

const analysisSchema = {
  type: 'object', additionalProperties: false, required: ['results'], properties: {
    results: { type: 'array', minItems: 1, maxItems: 10, items: {
      type: 'object', additionalProperties: false,
      required: ['itemKey', 'qualified', 'score', 'insight', 'action'],
      properties: {
        itemKey: { type: 'string', minLength: 1 }, qualified: { type: 'boolean' },
        score: { type: 'integer', minimum: 0, maximum: 100 },
        insight: { type: 'string', minLength: 1, maxLength: 700 },
        action: { type: 'string', minLength: 1, maxLength: 500 }
      }
    } }
  }
};

function openAi(prompt, instructions) {
  return {
    resource: 'text', operation: 'response', modelId: { __rl: true, mode: 'id', value: OPENAI_MODEL },
    responses: { values: [{ type: 'text', role: 'user', content: prompt }] }, simplify: true, builtInTools: {},
    options: {
      instructions, maxTokens: 5000, reasoning: { reasoningOptions: { effort: 'low', summary: 'none' } }, store: false,
      textFormat: { textOptions: { type: 'json_schema', verbosity: 'low', name: 'fetchcat_demand_batch', schema: JSON.stringify(analysisSchema), description: instructions, strict: true } }
    }
  };
}

const outputFields = [
  { name: 'Observed at', type: 'number' }, { name: 'Item' }, { name: 'Source' }, { name: 'Metric' },
  { name: 'Status' }, { name: 'Insight' }, { name: 'Recommended action' }, { name: 'Link' }, { name: 'Item key' }
];

function sheetNode(tabName) {
  return {
    operation: 'appendOrUpdate',
    documentId: { __rl: true, mode: 'id', value: '0000000000000000000000000000000000000000000' },
    sheetName: { __rl: true, mode: 'id', value: '0', cachedResultName: tabName },
    columns: {
      mappingMode: 'defineBelow', matchingColumns: ['Item key'],
      value: Object.fromEntries(outputFields.map(({ name }) => [name, `={{ $json[${JSON.stringify(name)}] }}`])),
      schema: outputFields.map(({ name, type = 'string' }) => ({ id: name, displayName: name, required: false, defaultMatch: name === 'Item key', display: true, type, canBeUsedToMatch: true })),
      attemptToConvertTypes: false, convertFieldsToString: false
    }, options: { useAppend: true }
  };
}

function notifier(kind) {
  if (kind === 'Telegram') return {
    type: 'n8n-nodes-base.telegram', version: 1.2,
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '-1000000000000', text: '={{ $json.notification }}', additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } }
  };
  return {
    type: 'n8n-nodes-base.slack', version: 2.5,
    parameters: { resource: 'message', operation: 'post', select: 'channel', channelId: { __rl: true, mode: 'id', value: 'C0000000000' }, messageType: 'text', text: '={{ $json.notification }}', otherOptions: { includeLinkToWorkflow: false, unfurl_links: false, unfurl_media: false } }
  };
}

const baseDefinitions = [
  {
    prefix: '31000000-', slug: 'google-maps-lead-enrichment', title: 'Generate and Enrich Google Maps Leads with Apify, Google Sheets and Slack',
    actors: [{ id: 'P2qkhkJQ7mqgRhmBb', slug: 'fetch_cat/google-maps-places-scraper' }, { id: 'K27h8iMIysshjJNjA', slug: 'fetch_cat/website-contact-finder' }],
    schedule: { field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 9 }, notify: 'Slack', ai: false,
    tab: 'Enriched leads', config: [
      ['queries', 'independent bike shops, cycling studios', 'string'], ['locations', 'Lisbon, Portugal', 'string'], ['maxItems', 10, 'number']
    ],
    inputCode: `const c=$input.first().json; const queries=String(c.queries||'').split(',').map(v=>v.trim()).filter(Boolean); const locations=String(c.locations||'').split(';').map(v=>v.trim()).filter(Boolean); if(!queries.length||!locations.length) throw new Error('Add comma-separated categories and semicolon-separated locations.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); const maxResultsPerQuery=Math.max(1,Math.ceil(maxItems/(queries.length*locations.length))); return [{json:{maxItems,actorInput:{queries,locations,maxResultsPerQuery,language:'en',proxyConfiguration:{useApifyProxy:false}}}}];`,
    secondaryInputCode: `const places=$('Download Actor Results').all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]); const domains=[...new Set(places.map(p=>String(p.website||'').trim()).filter(Boolean))].slice(0,10); return [{json:{actorInput:{domains,maxPagesPerDomain:5,crawlDepth:1,includeSitemap:false,sameDomainOnly:true,includePhones:true,includeSocialLinks:true,validateMx:false,proxyConfiguration:{useApifyProxy:false}}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]); const places=$('Download Actor Results').all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; const host=v=>{try{return new URL(String(v).startsWith('http')?v:'https://'+v).hostname.replace(/^www\./,'')}catch{return String(v||'').replace(/^www\./,'')}}; const contacts=new Map(rows.filter(r=>r.domain).map(r=>[host(r.domain),r])); return places.filter(p=>p.googleMapsUrl&&p.title).map(p=>{const c=contacts.get(host(p.website))||{}; const emails=Array.isArray(c.emails)?c.emails.join(', '):String(c.email||''); const phones=Array.isArray(c.phones)?c.phones.join(', '):String(c.phone||p.phone||''); return {json:{itemKey:String(p.googleMapsUrl),title:String(p.title),source:String(p.category||p.address||''),metric:[p.rating?('Rating '+p.rating):'',p.reviewCount?('Reviews '+p.reviewCount):''].filter(Boolean).join(' | '),status:emails?'Public email found':(p.website?'Website found':'No website'),summary:[emails,phones,p.website].filter(Boolean).join(' | '),url:String(p.googleMapsUrl),observedAt:serial(p.scrapedAt)}};});`,
    instructions: 'No AI is used. Public business contact fields are exported for human review; the workflow never sends outreach.'
  },
  {
    prefix: '32000000-', slug: 'tiktok-viral-content-opportunities', title: 'Find Viral TikTok Content Opportunities with Apify, OpenAI, Google Sheets and Telegram',
    actors: [{ id: 'Hr2nEnEpaumFwoDx9', slug: 'fetch_cat/tiktok-trends-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 9 }, notify: 'Telegram', ai: true,
    tab: 'TikTok opportunities', config: [['keywords','women cycling, cycling outfit','string'],['country','US','string'],['language','en','string'],['minimumScore',65,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const keywords=String(c.keywords||'').split(',').map(v=>v.trim()).filter(Boolean); if(!keywords.length) throw new Error('Add at least one keyword.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,minimumScore:Number(c.minimumScore)||65,actorInput:{keywords,country:String(c.country||'US'),language:String(c.language||'en'),trendType:'video',maxItems,proxyConfiguration:{useApifyProxy:true}}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(v=>v.sourceUrl||v.videoUrl).map(v=>{const url=String(v.videoUrl||v.sourceUrl); return {json:{itemKey:url,title:String(v.title||v.description||v.hashtag||'TikTok trend').slice(0,180),source:v.authorUsername?'@'+String(v.authorUsername).replace(/^@/,''):String(v.region||v.keywordOrUrl||''),metric:[v.viewCount?Number(v.viewCount).toLocaleString()+' views':'',v.likeCount?Number(v.likeCount).toLocaleString()+' likes':'',v.rank?('Rank '+v.rank):''].filter(Boolean).join(' | '),status:'New '+String(v.trendType||'trend')+' result',summary:JSON.stringify({description:v.description,hashtag:v.hashtag,sound:v.soundTitle,shares:v.shareCount,comments:v.commentCount}),url,observedAt:serial(v.scrapedAt)}};});`,
    instructions: 'Identify genuinely reusable content formats and audience angles. Suggest original work inspired by patterns; never recommend copying a creator.'
  },
  {
    prefix: '33000000-', slug: 'youtube-trending-content-ideas', title: 'Turn Trending YouTube Videos into Content Ideas with Apify, OpenAI, Google Sheets and Telegram',
    actors: [{ id: 'onwGBK577QyLVoyjw', slug: 'fetch_cat/youtube-search-results-scraper' }], schedule: { field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 9 }, notify: 'Telegram', ai: true,
    tab: 'YouTube ideas', config: [['queries','women cycling, cycling training','string'],['country','US','string'],['minimumScore',65,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const queries=String(c.queries||'').split(',').map(v=>v.trim()).filter(Boolean); if(!queries.length) throw new Error('Add at least one YouTube query.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); const maxResultsPerQuery=Math.max(1,Math.ceil(maxItems/queries.length)); return [{json:{maxItems,minimumScore:Number(c.minimumScore)||65,actorInput:{queries,maxResultsPerQuery,resultType:'videos',sortBy:'viewCount',uploadDate:'month',country:String(c.country||'US'),language:'en',proxyConfiguration:{useApifyProxy:true}}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(v=>v.videoId&&v.url).map(v=>({json:{itemKey:String(v.videoId),title:String(v.title||''),source:String(v.channelTitle||v.channelName||''),metric:[v.viewCount?Number(v.viewCount).toLocaleString()+' views':'',v.subscriberCount?Number(v.subscriberCount).toLocaleString()+' subscribers':''].filter(Boolean).join(' | '),status:'Recent high-performing video',summary:JSON.stringify({query:v.query,rank:v.rank,published:v.publishedText,duration:v.duration}),url:String(v.url),observedAt:serial(v.scrapedAt)}}));`,
    instructions: 'Find transferable audience questions, formats, and gaps. Propose an original content idea and a concrete next production step.'
  },
  {
    prefix: '34000000-', slug: 'meta-ads-competitor-monitor', title: 'Monitor Competitor Meta Ads with Apify, OpenAI, Google Sheets and Slack',
    actors: [{ id: '0xeVLpUizP1FnAjJh', slug: 'fetch_cat/facebook-ads-library-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 9 }, notify: 'Slack', ai: true,
    tab: 'Meta ads', config: [['query','Nike','string'],['country','ALL','string'],['minimumScore',60,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const query=String(c.query||'').trim(); if(!query) throw new Error('Add an advertiser, page, or keyword query.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,minimumScore:Number(c.minimumScore)||60,actorInput:{query,searchType:'keyword_unordered',country:String(c.country||'ALL'),activeStatus:'all',maxItems,enrichLandingPages:false,proxyConfiguration:{useApifyProxy:true}}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(a=>a.libraryId).map(a=>({json:{itemKey:String(a.libraryId)+'|'+String(a.creativeVariantId||''),title:String(a.advertiserName||'Meta advertiser'),source:String(a.adStatus||'')+' | '+String((a.platforms||[]).join(', ')),metric:String(a.startedAt||''),status:'Unseen creative',summary:JSON.stringify({text:a.adText,cta:a.callToAction,landingUrl:a.landingUrl,mediaType:a.mediaType}),url:String(a.libraryUrl||a.landingUrl||''),observedAt:serial(a.scrapedAt)}}));`,
    instructions: 'Classify the format, offer, hook, call to action, and landing-page angle. Highlight strategically useful patterns without reproducing ad copy.'
  },
  {
    prefix: '35000000-', slug: 'amazon-price-stock-monitor', title: 'Track Amazon Prices and Stock with Apify, Google Sheets and Telegram',
    actors: [{ id: 'Thc7tZ9fJwTGvhgzE', slug: 'fetch_cat/amazon-products-search-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 9 }, notify: 'Telegram', ai: false,
    tab: 'Amazon tracker', config: [['queries','wireless headphones','string'],['asins','','string'],['marketplace','US','string'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const queries=String(c.queries||'').split(',').map(v=>v.trim()).filter(Boolean); const asins=String(c.asins||'').split(',').map(v=>v.trim()).filter(Boolean); if(!queries.length&&!asins.length) throw new Error('Add at least one product query or ASIN.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,actorInput:{queries,asins,marketplace:String(c.marketplace||'US'),maxItems,enrichDetails:true}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(p=>p.asin).map(p=>{const availability=String(p.availability||'').replace(/\\s+\\{.*$/s,'').trim()||'Availability unknown'; const seller=String(p.seller||p.buyBoxSoldBy||p.brand||''); const metric=String(p.priceDisplay||[p.currency,p.price].filter(v=>v!==undefined&&v!=='').join(' ')); const listPrice=p.listPrice?('List price '+(typeof p.listPrice==='number'&&p.currency?p.currency+' ':'')+p.listPrice):''; return {json:{itemKey:[p.asin,p.price,availability,seller].join('|'),title:String(p.productTitle||p.title||p.asin),source:String(p.brand||seller),metric,status:availability,summary:[listPrice,p.prime?'Prime':'',p.rating?('Rating '+p.rating+'/5'):'' ,p.reviewCount?(Number(p.reviewCount).toLocaleString()+' reviews'):''].filter(Boolean).join(' | '),url:String(p.url||''),observedAt:serial(p.scrapedAt)}};});`,
    instructions: 'No AI is used. A new price, availability, or seller combination is treated as a changed product state.'
  },
  {
    prefix: '36000000-', slug: 'google-reviews-response-drafts', title: 'Monitor Google Reviews and Draft Responses with Apify, OpenAI, Google Sheets and Slack',
    actors: [{ id: 'Oy3VMd7sXQLhyNCNU', slug: 'fetch_cat/google-maps-reviews-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 8 }, notify: 'Slack', ai: true,
    tab: 'Google reviews', scoreLabel: 'Priority', config: [['placeUrls','https://www.google.com/maps/place/Lisbon+Bike+Shop/data=!4m7!3m6!1s0xd1ecd2eddafd85d:0x30e8ae839f8d5acb!8m2!3d38.7549055!4d-9.1965983!16s%2Fg%2F12m8ywd6s!19sChIJXdiv3S7NHg0Ry1qNn4Ou6DA','string'],['brandVoice','Warm, concise and helpful','string'],['minimumScore',1,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const startUrls=String(c.placeUrls||'').split(',').map(v=>v.trim()).filter(Boolean).map(url=>({url})); if(!startUrls.length) throw new Error('Add at least one public Google Maps place URL.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,minimumScore:Number(c.minimumScore)||1,context:String(c.brandVoice||''),actorInput:{startUrls,maxItems,reviewsPerPlace:maxItems,sort:'newest',language:'en',country:'US',proxyConfiguration:{useApifyProxy:true}}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(r=>r.reviewUrl||r.text).map(r=>({json:{itemKey:String(r.reviewUrl||[r.placeUrl,r.reviewerName,r.relativeDate,r.text].join('|')),title:String(r.placeTitle||'Google review'),source:String(r.reviewerName||'Anonymous'),metric:String(r.rating||'')+'/5',status:r.ownerResponse?'Already answered':'Needs review',summary:String(r.text||'').slice(0,3000),url:String(r.reviewUrl||r.placeUrl||''),observedAt:serial(r.scrapedAt)}}));`,
    instructions: 'Classify sentiment, topic, and urgency. Draft a concise response in the configured brand voice. Never claim the response was posted.'
  },
  {
    prefix: '37000000-', slug: 'zillow-listing-price-monitor', title: 'Monitor Zillow Listings and Price Drops with Apify, Google Sheets and Telegram',
    actors: [{ id: 'dWFnXVVnn84CXqdrz', slug: 'fetch_cat/zillow-property-listings-scraper' }], schedule: { field: 'hours', hoursInterval: 6 }, notify: 'Telegram', ai: false,
    tab: 'Zillow tracker', config: [['locations','Austin, TX','string'],['listingType','for_sale','string'],['minBeds',2,'number'],['maxPrice',750000,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const locations=String(c.locations||'').split(';').map(v=>v.trim()).filter(Boolean); if(!locations.length) throw new Error('Add semicolon-separated Zillow locations or search URLs.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,actorInput:{locations,listingType:String(c.listingType||'for_sale'),minBeds:Number(c.minBeds)||0,maxPrice:Number(c.maxPrice)||undefined,maxItems,maxPages:1,proxyConfiguration:{useApifyProxy:true}}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; const readable=v=>String(v||'Active').toLowerCase().split('_').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '); return rows.filter(p=>p.zpid&&p.url).map(p=>{const amount=Number(p.unformattedPrice); const priceText=String(p.price||(!Number.isNaN(amount)?new Intl.NumberFormat('en-US',{style:'currency',currency:String(p.currency||'USD'),maximumFractionDigits:0}).format(amount):'Price unavailable')); const status=readable(p.homeStatus||p.status); return {json:{itemKey:[p.zpid,Number.isNaN(amount)?priceText:amount,status,p.openHouse].join('|'),title:String(p.address||p.zpid),source:String(p.listingType||''),metric:priceText,status,summary:[p.beds?(p.beds+' beds'):'',p.baths?(p.baths+' baths'):'',p.area?(p.area+' sq ft'):'',p.openHouse?('Open house '+p.openHouse):''].filter(Boolean).join(' | '),url:String(p.url),observedAt:serial(p.scrapedAt)}};});`,
    instructions: 'No AI is used. A new price, status, or open-house combination creates a new alertable listing state.'
  },
  {
    prefix: '38000000-', slug: 'google-trends-opportunity-monitor', title: 'Track Google Trends Opportunities with Apify, OpenAI, Google Sheets and Slack',
    actors: [{ id: 'n6s1IUm6NCZ7ymr8t', slug: 'fetch_cat/google-trends-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 8 }, notify: 'Slack', ai: true,
    tab: 'Trend opportunities', config: [['countries','US,GB','string'],['niche','cycling, outdoor fitness','string'],['seoGoal','Find timely editorial opportunities','string'],['minimumScore',65,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const geos=String(c.countries||'US').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean); const niche=String(c.niche||'').trim(); if(!niche) throw new Error('Describe the niche to evaluate.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,minimumScore:Number(c.minimumScore)||65,context:niche+' | '+String(c.seoGoal||''),actorInput:{mode:'trending_now',geos,hl:'en',maxItems}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(t=>t.title||t.query).map(t=>{const volume=t.traffic??t.searchVolumeLabel??''; const metric=volume!==''&&/^\\d+(?:\\.\\d+)?$/.test(String(volume))?Number(volume).toLocaleString()+' searches':String(volume); return {json:{itemKey:[t.geo||'',t.title||t.query,t.observedAt||t.scrapedAt].join('|'),title:String(t.title||t.query),source:String(t.geo||''),metric,status:'Trending now',summary:JSON.stringify({rank:t.rank,relatedQueries:t.relatedQueries,articles:t.articles}),url:String(t.url||''),observedAt:serial(t.observedAt||t.scrapedAt)}};});`,
    instructions: 'Evaluate fit against the configured niche and SEO goal. Explain the timely angle, audience relevance, and a concrete content action without inventing search volume.'
  },
  {
    prefix: '39000000-', slug: 'mobile-app-review-monitor', title: 'Monitor App Store and Google Play Reviews with Apify, OpenAI, Google Sheets and Slack',
    actors: [{ id: '2B1XcWTM5BwOC6pjr', slug: 'fetch_cat/apple-app-store-reviews-scraper' }, { id: 'xNpv1zJdooz9PbmvH', slug: 'fetch_cat/google-play-reviews-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 8 }, notify: 'Slack', ai: true,
    tab: 'App reviews', scoreLabel: 'Priority', secondaryDatasetLimit: '={{ $("Validate Settings and Build Actor Input").first().json.perStoreLimit }}', config: [['appUrlsOrIds','id284882215','string'],['googlePlayApps','com.spotify.music','string'],['minimumScore',1,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const appUrlsOrIds=String(c.appUrlsOrIds||'').split(',').map(v=>v.trim()).filter(Boolean); if(!appUrlsOrIds.length) throw new Error('Add at least one App Store ID or URL.'); const maxItems=Math.max(2,Math.min(Number(c.maxItems)||10,10)); const perStoreLimit=Math.max(1,Math.ceil(maxItems/2)); return [{json:{maxItems,perStoreLimit,minimumScore:Number(c.minimumScore)||1,actorInput:{appUrlsOrIds,country:'us',sort:'mostRecent',maxReviewsPerApp:perStoreLimit}}}];`,
    secondaryInputCode: `const c=$('1. Configure This Workflow').first().json; const apps=String(c.googlePlayApps||'').split(',').map(v=>v.trim()).filter(Boolean); if(!apps.length) throw new Error('Add at least one Google Play package ID.'); const perStoreLimit=$('Validate Settings and Build Actor Input').first().json.perStoreLimit; return [{json:{actorInput:{apps,maxReviews:perStoreLimit,country:'us',language:'en',sort:'newest'}}}];`,
    normalizeCode: `const apple=$('Download Actor Results').all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]); const google=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]); const rows=[]; for(let i=0;rows.length<10&&(i<apple.length||i<google.length);i++){if(apple[i]) rows.push(apple[i]); if(rows.length<10&&google[i]) rows.push(google[i]);} const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(r=>r.reviewId||r.content||r.reviewText).map(r=>({json:{itemKey:String(r.reviewId||[r.appId,r.authorName||r.reviewerName,r.updatedAt||r.reviewDate].join('|')),title:String(r.appName||'App review'),source:String(r.authorName||r.reviewerName||'Anonymous'),metric:String(r.rating||'')+'/5',status:(r.developerResponse||r.developerReply||r.developerReplyText)?'Already answered':'Needs review',summary:String(r.content||r.reviewText||'').slice(0,3000),url:String(r.reviewUrl||r.appUrl||''),observedAt:serial(r.updatedAt||r.reviewDate)}}));`,
    instructions: 'Classify sentiment, bugs, feature requests, and urgency. Draft a factual response for human approval; never claim it was posted.'
  },
  {
    prefix: '40000000-', slug: 'product-hunt-launch-monitor', title: 'Track Product Hunt Launches with Apify, OpenAI, Notion and Slack',
    actors: [{ id: 'mOmo4KI8yGG6b874f', slug: 'fetch_cat/product-hunt-scraper' }], schedule: { field: 'days', daysInterval: 1, triggerAtHour: 10 }, notify: 'Slack', ai: true, notion: true,
    tab: 'Product Hunt launches', config: [['topics','developer tools, artificial intelligence','string'],['marketContext','Automation tools for small businesses','string'],['minimumScore',65,'number'],['maxItems',10,'number']],
    inputCode: `const c=$input.first().json; const topics=String(c.topics||'').split(',').map(v=>v.trim()).filter(Boolean); if(!topics.length) throw new Error('Add at least one Product Hunt topic.'); const maxItems=Math.max(1,Math.min(Number(c.maxItems)||10,10)); return [{json:{maxItems,minimumScore:Number(c.minimumScore)||65,context:String(c.marketContext||''),actorInput:{discoveryWindow:'daily',topics,maxItems,includeDetails:true,includeComments:false,includeReviews:false,includeHistory:false,enrichWithBuiltWith:false}}}];`,
    normalizeCode: `const rows=$input.all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]).slice(0,10); const serial=d=>new Date(d||Date.now()).getTime()/86400000+25569; return rows.filter(p=>p.productUrl&&p.title).map(p=>({json:{itemKey:String(p.productUrl),title:String(p.title),source:String((p.topics||p.categories||[]).join(', ')),metric:[p.votes?(p.votes+' votes'):'',p.comments?(p.comments+' comments'):''].filter(Boolean).join(' | '),status:'New launch',summary:String(p.tagline||'')+' | '+JSON.stringify({makers:p.makers,rank:p.rank,outboundUrl:p.outboundUrl}),url:String(p.productUrl),observedAt:serial(p.launchDate||p.scrapedAt)}}));`,
    instructions: 'Assess launch relevance to the configured market context, summarize positioning, and recommend a concrete research or competitive action.'
  }
];

function setParameters(fields) {
  return { mode: 'manual', duplicateItem: false, assignments: { assignments: fields.map(([name, value, type], index) => ({ id: `config-${index + 1}`, name, value, type })) }, options: {} };
}

function overview(def) {
  const actorList = def.actors.map((actor) => `\`${actor.slug}\``).join(' and ');
  const aiStep = def.ai ? `evaluates every unseen item in one strict ${OPENAI_MODEL} batch,` : 'uses deterministic rules without AI,';
  return `## ${def.title}\n\n### How it works\n\n1. Starts manually or on the editable schedule and creates the delivery ledger if it is missing.\n2. Reads all user settings from the numbered configuration node and validates limits before any paid request.\n3. Runs ${actorList} through Cloud-compatible HTTP Request nodes and downloads at most 10 public results.\n4. Normalizes stable IDs and human-readable fields, skips states already delivered, ${aiStep} and prepares one concise destination batch.\n5. Writes the selected results to ${def.notion ? 'Notion' : 'Google Sheets'}, sends one ${def.notify} digest, then records item keys only after both destinations succeed. Failed deliveries remain retryable.\n\n### Setup\n\n- [ ] Add the Actor to Apify if required and create HTTP Header Auth with \`Authorization: Bearer YOUR_APIFY_TOKEN\`.\n- [ ] Select that credential in both Apify request nodes.\n${def.ai ? `- [ ] Connect OpenAI in the numbered analysis node. The model is pinned to \`${OPENAI_MODEL}\`.\n` : ''}- [ ] Connect ${def.notion ? 'Notion and select a database' : `Google Sheets and select the \`${def.tab}\` tab`}.\n- [ ] Connect ${def.notify} and choose the private QA destination.\n- [ ] Edit the numbered configuration node, run manually twice, and confirm the duplicate run sends nothing.\n- [ ] Publish the workflow only when you are ready to enable its schedule.\n\n### Customization\n\nChange the schedule, search inputs, threshold, result limit, destination, and digest wording without editing Code nodes. Keep live tests at 10 Actor items or fewer.`;
}

function buildWorkflow(def) {
  const n = [];
  n.push(node(def.prefix, 1, 'Manual Trigger', 'n8n-nodes-base.manualTrigger', 1, [-1520, 160], {}));
  n.push(node(def.prefix, 2, 'Schedule Trigger', 'n8n-nodes-base.scheduleTrigger', 1.3, [-1520, -20], { rule: { interval: [def.schedule] } }));
  n.push(node(def.prefix, 3, 'Ensure Delivery Ledger', 'n8n-nodes-base.dataTable', 1.1, [-1280, 80], createLedger()));
  n.push(node(def.prefix, 4, '1. Configure This Workflow', 'n8n-nodes-base.set', 3.4, [-1040, 80], setParameters(def.config)));
  n.push(node(def.prefix, 5, 'Validate Settings and Build Actor Input', 'n8n-nodes-base.code', 2, [-800, 80], { jsCode: def.inputCode }));
  n.push(node(def.prefix, 6, `2. Run ${def.actors[0].slug}`, 'n8n-nodes-base.httpRequest', 4.3, [-560, 80], actorRun(def.actors[0].id)));
  n.push(node(def.prefix, 7, 'Download Actor Results', 'n8n-nodes-base.httpRequest', 4.3, [-320, 80], actorDataset('={{ $("Validate Settings and Build Actor Input").first().json.maxItems }}')));
  let normalizeInput = 'Download Actor Results';
  if (def.actors[1]) {
    n.push(node(def.prefix, 50, 'Build Secondary Actor Input', 'n8n-nodes-base.code', 2, [-80, 80], { jsCode: def.secondaryInputCode }));
    n.push(node(def.prefix, 51, `Run ${def.actors[1].slug}`, 'n8n-nodes-base.httpRequest', 4.3, [160, 80], actorRun(def.actors[1].id)));
    n.push(node(def.prefix, 52, 'Download Secondary Actor Results', 'n8n-nodes-base.httpRequest', 4.3, [400, 80], actorDataset(def.secondaryDatasetLimit ?? '10')));
    normalizeInput = 'Download Secondary Actor Results';
  }
  const offset = def.actors[1] ? 720 : 0;
  n.push(node(def.prefix, 8, 'Normalize Public Results', 'n8n-nodes-base.code', 2, [-80 + offset, 80], { jsCode: def.normalizeCode }));
  n.push(node(def.prefix, 9, 'Keep Undelivered Items', 'n8n-nodes-base.dataTable', 1.1, [160 + offset, 80], ledgerCheck(def.slug)));
  n.push(node(def.prefix, 10, 'Build One Bounded Batch', 'n8n-nodes-base.code', 2, [400 + offset, 80], { jsCode: `const items=$input.all().map(i=>i.json).slice(0,10); if(!items.length) return []; return [{json:{items,itemKeys:items.map(i=>i.itemKey),minimumScore:Number($('Validate Settings and Build Actor Input').first().json.minimumScore)||0,context:String($('Validate Settings and Build Actor Input').first().json.context||'')}}];` }));

  let prepareSource = 'Build One Bounded Batch';
  if (def.ai) {
    n.push(node(def.prefix, 11, '3. Analyze Results in One Batch', '@n8n/n8n-nodes-langchain.openAi', 2.3, [640 + offset, 80], openAi('=Context: {{ $json.context }}\nMinimum score: {{ $json.minimumScore }}\nAnalyze every supplied item exactly once and preserve itemKey:\n{{ JSON.stringify($json.items) }}', def.instructions)));
    n.push(node(def.prefix, 12, 'Validate Structured Analysis', 'n8n-nodes-base.code', 2, [880 + offset, 80], { jsCode: `${parseStructured}\nconst batch=$('Build One Bounded Batch').first().json; const parsed=parseStructured($input.first().json,['results']); if(!parsed||!Array.isArray(parsed.results)) throw new Error('OpenAI returned invalid structured output.'); const expected=new Set(batch.itemKeys); const actual=parsed.results.map(r=>String(r.itemKey)); if(actual.length!==expected.size||new Set(actual).size!==actual.length||actual.some(k=>!expected.has(k))) throw new Error('OpenAI result keys do not exactly match the input batch.'); const byKey=new Map(batch.items.map(i=>[i.itemKey,i])); const selected=[]; for(const r of parsed.results){if(typeof r.qualified!=='boolean'||!Number.isInteger(r.score)||r.score<0||r.score>100||!String(r.insight||'').trim()||!String(r.action||'').trim()) throw new Error('Malformed analysis result.'); if(r.qualified&&r.score>=batch.minimumScore) selected.push({...byKey.get(String(r.itemKey)),score:r.score,insight:String(r.insight).trim(),action:String(r.action).trim()});} return [{json:{allKeys:batch.itemKeys,selected}}];` }));
    prepareSource = 'Validate Structured Analysis';
  }

  const prepareNumber = def.ai ? 13 : 11;
  const prepareCode = def.ai
    ? `const source=$input.first().json; const selected=[...source.selected].sort((a,b)=>b.score-a.score); if(!selected.length) return []; const serial=v=>v||Date.now()/86400000+25569; const safe=v=>{const s=String(v??''); return /^[=+\\-@]/.test(s)?"'"+s:s}; const rows=selected.map(i=>({ 'Observed at':serial(i.observedAt),'Item':safe(i.title),'Source':safe(i.source),'Metric':safe(i.metric),'Status':safe(i.status+(i.score!==undefined?' | ${def.scoreLabel ?? 'Score'} '+i.score+'/100':'')),'Insight':safe(i.insight),'Recommended action':safe(i.action),'Link':i.url?'=HYPERLINK("'+String(i.url).replace(/"/g,'""')+'","Open source")':'','Item key':safe(i.itemKey) })); const lines=selected.slice(0,5).map((i,x)=>(x+1)+'. '+i.title+'\\n'+i.metric+' | '+i.status+'\\n'+i.insight+'\\n'+i.url); return [{json:{allKeys:source.allKeys,rows,notification:${JSON.stringify(def.title)}+'\\n\\n'+lines.join('\\n\\n')}}];`
    : `const items=$input.first().json.items; if(!items.length) return []; const serial=v=>v||Date.now()/86400000+25569; const safe=v=>{const s=String(v??''); return /^[=+\\-@]/.test(s)?"'"+s:s}; const rows=items.map(i=>({ 'Observed at':serial(i.observedAt),'Item':safe(i.title),'Source':safe(i.source),'Metric':safe(i.metric),'Status':safe(i.status),'Insight':safe(i.summary),'Recommended action':'Review this new or changed result','Link':i.url?'=HYPERLINK("'+String(i.url).replace(/"/g,'""')+'","Open source")':'','Item key':safe(i.itemKey) })); const lines=items.slice(0,5).map((i,x)=>(x+1)+'. '+i.title+'\\n'+i.metric+' | '+i.status+'\\n'+i.summary+'\\n'+i.url); return [{json:{allKeys:$input.first().json.itemKeys,rows,notification:${JSON.stringify(def.title)}+'\\n\\n'+lines.join('\\n\\n')}}];`;
  n.push(node(def.prefix, prepareNumber, 'Prepare Human-Readable Delivery', 'n8n-nodes-base.code', 2, [1120 + offset, 80], { jsCode: prepareCode }));
  n.push(node(def.prefix, prepareNumber + 1, 'Expand Rows for Destination', 'n8n-nodes-base.code', 2, [1360 + offset, 80], { jsCode: 'return $json.rows.map(row=>({json:row}));' }));
  if (def.notion) {
    n.push(node(def.prefix, prepareNumber + 2, '4. Save Launches to Notion', 'n8n-nodes-base.notion', 2.2, [1600 + offset, 80], {
      resource: 'databasePage', operation: 'create', databaseId: { __rl: true, mode: 'id', value: '00000000-0000-0000-0000-000000000000' },
      title: '={{ $json["Item"] }}', simple: true, propertiesUi: { propertyValues: [] },
      blockUi: { blockValues: [
        { type: 'heading_2', richText: false, textContent: 'Launch evidence' },
        { type: 'paragraph', richText: false, textContent: '={{ $json["Source"] + " | " + $json["Metric"] + " | " + $json["Status"] }}' },
        { type: 'heading_2', richText: false, textContent: 'Why it matters' },
        { type: 'paragraph', richText: false, textContent: '={{ $json["Insight"] }}' },
        { type: 'heading_2', richText: false, textContent: 'Recommended action' },
        { type: 'paragraph', richText: false, textContent: '={{ $json["Recommended action"] }}' },
        { type: 'paragraph', richText: false, textContent: '={{ $json["Link"] }}' }
      ] }, options: {}
    }));
  } else {
    n.push(node(def.prefix, prepareNumber + 2, `4. Save Results to ${def.tab}`, 'n8n-nodes-base.googleSheets', 4.7, [1600 + offset, 80], sheetNode(def.tab)));
  }
  n.push(node(def.prefix, prepareNumber + 3, 'Restore Delivery Batch', 'n8n-nodes-base.code', 2, [1840 + offset, 80], { jsCode: `return [{json:$('Prepare Human-Readable Delivery').first().json}];` }));
  const notification = notifier(def.notify);
  n.push(node(def.prefix, prepareNumber + 4, `5. Send One ${def.notify} Digest`, notification.type, notification.version, [2080 + offset, 80], notification.parameters));
  n.push(node(def.prefix, prepareNumber + 5, 'Prepare Delivered Item Keys', 'n8n-nodes-base.code', 2, [2320 + offset, 80], { jsCode: `return $('Prepare Human-Readable Delivery').first().json.allKeys.map(itemKey=>({json:{workflowSlug:${JSON.stringify(def.slug)},itemKey}}));` }, { executeOnce: true }));
  n.push(node(def.prefix, prepareNumber + 6, 'Commit Delivered Item Keys', 'n8n-nodes-base.dataTable', 1.1, [2560 + offset, 80], ledgerInsert(`${def.notion ? 'Notion' : 'Google Sheets'} and ${def.notify}`)));

  n.push(sticky(def.prefix, 80, 'Workflow Overview', [-2112, -416], 496, 1040, overview(def), 1));
  const groups = def.actors[1] ? [
    [-1568,-160,432,480,'## Start safely\n\nRun manually or on schedule and create durable delivery state.'],
    [-1088,-160,432,480,'## Configure and validate\n\nEdit visible inputs and validate limits before paid requests.'],
    [-608,-160,672,480,`## Collect primary data\n\nRun \`${def.actors[0].slug}\` and build the second Actor input.`],
    [112,-160,672,480,`## Enrich or combine\n\nRun \`${def.actors[1].slug}\` and normalize both public datasets.`],
    [832,-160,672,480,'## Deduplicate and analyze\n\nSkip delivered states and prepare one bounded batch.'],
    [1552,-160,672,480,`## Save selected results\n\nWrite readable rows to ${def.notion ? 'Notion' : 'Google Sheets'} before alerting.`],
    [2272,-160,672,480,`## Deliver results\n\nSave the destination rows and send one ${def.notify} digest after the write succeeds.`],
    [2992,-160,432,480,'## Commit delivery state\n\nRecord delivered keys only after every required destination succeeds.']
  ] : [
    [-1568,-160,432,480,'## Start safely\n\nRun manually or on schedule and create durable delivery state.'],
    [-1088,-160,432,480,'## Configure and validate\n\nEdit visible inputs and validate limits before paid requests.'],
    [-608,-160,672,480,`## Collect and normalize\n\nRun \`${def.actors[0].slug}\`, download its dataset, and normalize public fields.`],
    [112,-160,672,480,'## Deduplicate and batch\n\nSkip delivered states and prepare one bounded batch.'],
    [832,-160,432,480,def.ai?'## Analyze one batch\n\nValidate strict AI output and preserve every source key.':'## Prepare delivery\n\nBuild readable rows using deterministic source states.'],
    [1312,-160,672,480,`## Save selected results\n\nWrite readable rows to ${def.notion ? 'Notion' : 'Google Sheets'} before alerting.`],
    [2032,-160,672,480,`## Notify and commit\n\nSend one ${def.notify} digest, then record delivered keys after success.`]
  ];
  groups.forEach((g, index) => n.push(sticky(def.prefix, 81 + index, `Section ${index + 1}`, [g[0], g[1]], g[2], g[3], g[4], 7)));

  const edges = [
    ['Manual Trigger','Ensure Delivery Ledger'], ['Schedule Trigger','Ensure Delivery Ledger'],
    ['Ensure Delivery Ledger','1. Configure This Workflow'], ['1. Configure This Workflow','Validate Settings and Build Actor Input'],
    ['Validate Settings and Build Actor Input',`2. Run ${def.actors[0].slug}`], [`2. Run ${def.actors[0].slug}`,'Download Actor Results'],
    ['Normalize Public Results','Keep Undelivered Items'],
    ['Keep Undelivered Items','Build One Bounded Batch']
  ];
  if (def.actors[1]) edges.push(['Download Actor Results','Build Secondary Actor Input'],['Build Secondary Actor Input',`Run ${def.actors[1].slug}`],[`Run ${def.actors[1].slug}`,'Download Secondary Actor Results'],['Download Secondary Actor Results','Normalize Public Results']);
  else edges.push(['Download Actor Results','Normalize Public Results']);
  if (def.ai) edges.push(['Build One Bounded Batch','3. Analyze Results in One Batch'],['3. Analyze Results in One Batch','Validate Structured Analysis'],['Validate Structured Analysis','Prepare Human-Readable Delivery']);
  else edges.push(['Build One Bounded Batch','Prepare Human-Readable Delivery']);
  edges.push(['Prepare Human-Readable Delivery','Expand Rows for Destination'],['Expand Rows for Destination',def.notion?'4. Save Launches to Notion':`4. Save Results to ${def.tab}`],[def.notion?'4. Save Launches to Notion':`4. Save Results to ${def.tab}`,'Restore Delivery Batch'],['Restore Delivery Batch',`5. Send One ${def.notify} Digest`],[`5. Send One ${def.notify} Digest`,'Prepare Delivered Item Keys'],['Prepare Delivered Item Keys','Commit Delivered Item Keys']);
  return { name: def.title, nodes: n, connections: connectionMap(edges), pinData: {}, active: false, settings: { executionOrder: 'v1', timezone: 'Europe/Lisbon', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' } };
}

function readme(def) {
  const actors = def.actors.map((actor) => `[${actor.slug}](https://apify.com/${actor.slug})`).join(' and ');
  return `# ${def.title}\n\nThis n8n template uses ${actors} to collect public data, keeps each run at 10 items or fewer by default, and delivers a readable ${def.notion ? 'Notion' : 'Google Sheets'} record plus one ${def.notify} digest. It runs on n8n Cloud or self-hosted n8n using built-in nodes only.\n\n## What it does\n\n- Starts manually and on an editable schedule; imported schedules remain inactive until you publish the workflow.\n- Validates user input before calling Apify and downloads only the completed Actor dataset.\n- Normalizes stable source IDs and stores delivery state in the shared n8n Data Table ledger.\n${def.ai ? `- Sends all unseen results through one strict \`${OPENAI_MODEL}\` batch, validates every returned key, and fails closed on malformed output.\n` : '- Uses deterministic state keys and does not require an AI credential.\n'}- Writes results before sending one digest, then commits delivered keys only after both destinations succeed.\n- Never contacts people, replies, posts content, changes prices, or takes marketplace actions.\n\n## Setup\n\n1. Import \`workflow.json\` into n8n.\n2. Open \`1. Configure This Workflow\` and replace the example search values.\n3. In Apify, create an API token. In n8n create **HTTP Header Auth** with header \`Authorization\` and value \`Bearer YOUR_APIFY_TOKEN\`, then select it in both Apify HTTP Request nodes.\n${def.ai ? '4. Connect OpenAI in `3. Analyze Results in One Batch`.\n' : ''}5. ${def.notion ? 'Create or copy a Notion database with Name, Item key, Source, Metric, Insight, Recommended action, and Link properties, then select it in the Notion node.' : `Create or copy a Google Sheet with a \`${def.tab}\` tab and these headers: ${outputFields.map(f=>f.name).join(', ')}. Select it in the Google Sheets node.`}\n6. Connect ${def.notify} and choose the destination channel or chat.\n7. Run manually twice. Verify the first run delivers results and the second sends nothing for identical item states.\n8. Publish the workflow only when you want the schedule to start.\n\n## Configuration\n\nAll ordinary settings are in the numbered Set node. The default maximum is 10 Actor results per run. Increase cadence or result counts only after checking Apify, n8n, and OpenAI usage. ${def.instructions}\n\n## Reliability and limitations\n\nThe workflow records an item only after required destinations succeed. Public fields vary by source, and absent metrics stay blank rather than being invented. A low result limit or infrequent schedule can miss items that fall outside the newest returned results. AI analysis is a research aid and should be reviewed by a person.\n\n## QA\n\nTest with isolated QA destinations and no more than three Apify-backed executions: happy path, duplicate rerun, and one empty or malformed-input path. Confirm no duplicate rows or alerts and inspect the execution data before enabling the schedule.\n`;
}

function creatorDraft(def) {
  return `![${def.title} workflow](assets/workflow-overview.png)\n\n# ${def.title}\n\nAutomate a practical monitoring and research workflow with ${def.actors.map(a=>`\`${a.slug}\``).join(' and ')}. The template is compatible with n8n Cloud and self-hosted n8n, uses only built-in nodes, caps default collection at 10 items, and prevents duplicate delivery with transaction-safe state.\n\n## Requirements\n\n- Apify account and API token\n${def.ai ? `- OpenAI credential for one batched \`${OPENAI_MODEL}\` request per non-empty run\n` : ''}- ${def.notion ? 'Notion database' : `Google Sheet with a \`${def.tab}\` tab`}\n- ${def.notify} destination\n\n## Customization\n\nEdit search values, threshold, result limit, and schedule in the numbered configuration and trigger nodes. Destination fields and digest wording can be adapted without changing the scraper integration.\n\n## Additional information\n\nSchedules are inactive after import. Run manually twice before publishing. The first run delivers unseen results; an identical rerun sends nothing. The workflow never performs outreach or publishes generated content.\n`;
}

function svg(def, output = false) {
  const subtitle = output ? `${def.notion ? 'Notion' : def.tab} + ${def.notify}` : 'Configure → Collect → Analyze → Deliver → Commit';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#f7f8fa"/><rect x="70" y="70" width="1460" height="760" rx="8" fill="#fff" stroke="#d8dde6"/><text x="120" y="170" font-family="Arial" font-size="44" fill="#17191c">${def.title.replace(/&/g,'&amp;')}</text><text x="120" y="230" font-family="Arial" font-size="26" fill="#5e6673">${subtitle.replace(/&/g,'&amp;')}</text><rect x="120" y="330" width="250" height="120" rx="8" fill="#ffebad"/><rect x="440" y="330" width="250" height="120" rx="8" fill="#eaf0ff"/><rect x="760" y="330" width="250" height="120" rx="8" fill="#e8f5ee"/><rect x="1080" y="330" width="250" height="120" rx="8" fill="#f2ebff"/><text x="175" y="402" font-family="Arial" font-size="24">Configure</text><text x="515" y="402" font-family="Arial" font-size="24">Collect</text><text x="835" y="402" font-family="Arial" font-size="24">Prepare</text><text x="1160" y="402" font-family="Arial" font-size="24">Deliver</text><path d="M370 390h70M690 390h70M1010 390h70" stroke="#727a87" stroke-width="5"/><text x="120" y="650" font-family="Arial" font-size="24" fill="#5e6673">Actor: ${def.actors.map(a=>a.slug).join(' + ')}</text></svg>`;
}

function writeArtifacts(def) {
  const dir = workflowPath(def.slug, '');
  fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), readme(def));
  fs.writeFileSync(path.join(dir, 'creator-draft.md'), creatorDraft(def));
  fs.writeFileSync(path.join(dir, 'fixtures/input.json'), `${JSON.stringify({ description: `Synthetic public-data fixture for ${def.slug}`, items: [{ itemKey: 'fixture-1', title: 'Example public result', source: 'Example source', metric: '123', status: 'New', summary: 'Synthetic fixture only', url: 'https://example.com/public-item', observedAt: 46000 }] }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'fixtures/expected-output.json'), `${JSON.stringify({ assertions: ['The first unseen item is prepared for the configured destination.', 'An identical delivered item key produces no second row or digest.', 'Credentials, private destination IDs, and pinned execution data are absent from the public export.'] }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'assets/workflow-overview.svg'), svg(def));
  fs.writeFileSync(path.join(dir, 'assets/output-preview.svg'), svg(def, true));
  for (const filename of ['workflow-overview.png','output-preview.png']) {
    const destination = path.join(dir, 'assets', filename);
    if (!fs.existsSync(destination)) {
      const source = path.join(root, 'workflows/telegram-channel-intelligence-monitor/assets', filename);
      fs.copyFileSync(source, destination);
    }
  }
}

export function buildDemandWorkflowDefinitions() {
  return baseDefinitions.map((def) => {
    writeArtifacts(def);
    return {
      slug: def.slug,
      workflow: buildWorkflow(def),
      metadata: {
        slug: def.slug, title: def.title, workflowKind: 'actor-template', actorId: def.actors[0].id, actorSlug: def.actors[0].slug,
        additionalActors: def.actors.slice(1), version: '1.0.0', minimumN8nVersion: '2.26.8',
        integrations: ['Apify', ...(def.ai ? ['OpenAI'] : []), def.notion ? 'Notion' : 'Google Sheets', def.notify, 'n8n Data Tables'],
        testLimits: { actorItems: 10, apifyBackedExecutions: 3, budgetUsd: 1 }, releaseState: def.slug === 'meta-ads-competitor-monitor' ? 'development' : 'qa-passed'
      }
    };
  });
}
