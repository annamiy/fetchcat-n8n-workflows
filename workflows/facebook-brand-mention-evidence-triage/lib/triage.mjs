// Pure functions inlined into n8n Code nodes by the builder; no network access.
export function normalize(items, settings, executionId) {
  const stop = message => ({ valid: false, message });
  const query = String(settings.query ?? '').trim();
  const requested = Number(settings.resultsCount);
  if (!query || !Number.isInteger(requested) || requested < 1 || requested > 10) return stop('Use a nonempty query and 1–10 results.');
  const runKey = String(settings.runKey || executionId);
  const rows = items.filter(p => p && Object.keys(p).length);
  if (!rows.length) return stop('Empty bounded search; completeness unverified. This does not mean no mentions exist. No sheet writes or AI calls.');
  if (rows.length > requested) return stop('Unexpected dataset size; no writes.');
  const seen = new Set();
  const posts = [];
  let bytesLeft = 4000;
  for (const p of rows) {
    if (typeof p.postId !== 'string' || !p.postId.trim() || seen.has(p.postId)) return stop('Missing or duplicate postId; no writes.');
    seen.add(p.postId);
    if (typeof p.url !== 'string' || !/^https:\/\/(?:www\.)?facebook\.com\//i.test(p.url)) return stop('Unexpected public post URL; no writes.');
    if (p.searchQuery !== query) return stop('Dataset query differs from configured query; no writes.');
    if (p.postText !== null && typeof p.postText !== 'string') return stop('Unexpected postText contract; no writes.');
    const e = p.matchEvidence;
    if (!e || typeof e.textContainsQuery !== 'boolean' || typeof e.authorContainsQuery !== 'boolean') return stop('Missing matchEvidence flags; no writes.');
    const text = p.postText;
    const missing = !text?.trim();
    // A true flag alone is not enough: the supplied text must contain the query too.
    const literal = !missing && e.textContainsQuery && text.toLowerCase().includes(query.toLowerCase());
    const bucket = missing ? 'missing-text' : literal ? 'literal-text' : e.authorContainsQuery ? 'author-only' : 'context-only';
    let excerpt = literal ? text.slice(0, 1000) : '';
    // Keep the literal match in the excerpt even when it is late in the post.
    if (literal && !excerpt.toLowerCase().includes(query.toLowerCase())) {
      const start = Math.max(0, text.toLowerCase().indexOf(query.toLowerCase()) - 100);
      excerpt = text.slice(start, start + 1000);
    }
    while (new TextEncoder().encode(excerpt).length > bytesLeft) excerpt = excerpt.slice(0, -1);
    if (literal && !excerpt.toLowerCase().includes(query.toLowerCase())) excerpt = '';
    bytesLeft -= new TextEncoder().encode(excerpt).length;
    const count = value => Number.isInteger(value) && value >= 0 ? value : null;
    posts.push({ postId: p.postId, url: p.url, postText: text, publishedAt: p.publishedAt ?? null, collectedAt: p.collectedAt ?? null,
      textContainsQuery: e.textContainsQuery, authorContainsQuery: e.authorContainsQuery, matchBucket: bucket,
      reactionsCount: count(p.reactionsCount), commentsCount: count(p.commentsCount), sharesCount: count(p.sharesCount), excerpt });
  }
  const eligible = posts.filter(p => p.matchBucket === 'literal-text' && p.excerpt).map(p => ({ postId: p.postId, text: p.excerpt }));
  return { valid: true, runKey, query, requested, posts, eligible, hasEligible: eligible.length > 0, classifications: [] };
}

export function validateAI(response, batch) {
  const stop = message => ({ valid: false, message: `AI validation failed: ${message}. No destination writes.` });
  try {
    if (response.error || response.status === 'incomplete') return stop('incomplete/error response');
    let parsed = response;
    if (!Array.isArray(parsed.classifications)) {
      const texts = (response.output ?? []).flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text);
      if (texts.length !== 1) return stop('expected one structured JSON response');
      parsed = JSON.parse(texts[0]);
    }
    if (!Array.isArray(parsed.classifications) || parsed.classifications.length !== batch.eligible.length) return stop('missing or extra IDs');
    const expected = new Map(batch.eligible.map(p => [p.postId, p.text]));
    const seen = new Set();
    for (const c of parsed.classifications) {
      if (!expected.has(c.postId) || seen.has(c.postId)) return stop('unknown or duplicate ID');
      seen.add(c.postId);
      if (!['complaint', 'question', 'endorsement', 'other'].includes(c.discussionType)) return stop('invalid discussion type');
      if (typeof c.rationale !== 'string' || !c.rationale.trim() || c.rationale.length > 100) return stop('invalid rationale');
      if (typeof c.evidenceQuote !== 'string' || !c.evidenceQuote.trim() || c.evidenceQuote.length > 60 || !expected.get(c.postId).includes(c.evidenceQuote)) return stop('unsupported source quote');
    }
    return { ...batch, valid: true, classifications: parsed.classifications };
  } catch { return stop('malformed JSON'); }
}

export function delivery(batch) {
  const safe = v => typeof v === 'string' && /^[\s]*[=+@\-\t\r\n]/.test(v) ? "'" + v : v ?? '';
  const byId = new Map(batch.classifications.map(c => [c.postId, c]));
  const common = p => ({ 'Record key': safe(JSON.stringify([batch.runKey, p.postId])), 'Run key': safe(batch.runKey), 'Post ID': safe(p.postId), 'Post URL': p.url });
  const audit = batch.posts.map(p => ({ ...common(p), Query: safe(batch.query), Published: safe(p.publishedAt), Collected: safe(p.collectedAt), 'Post text': safe(p.postText), 'Text contains query': p.textContainsQuery, 'Author contains query': p.authorContainsQuery, 'Match bucket': p.matchBucket, Reactions: safe(p.reactionsCount), Comments: safe(p.commentsCount), Shares: safe(p.sharesCount) }));
  // Review status is deliberately NOT mapped: a refresh must never overwrite human decisions.
  const triage = batch.posts.filter(p => byId.has(p.postId)).map(p => {
    const c = byId.get(p.postId);
    return { ...common(p), 'Discussion type': c.discussionType, Rationale: safe(c.rationale), 'Source quote': safe(c.evidenceQuote) };
  });
  const review = batch.posts.filter(p => !byId.has(p.postId)).map(p => ({ ...common(p), 'Match bucket': p.matchBucket,
    Reason: p.matchBucket === 'literal-text' ? 'Literal match; excluded from AI by batch text budget. Human review required.' : p.matchBucket === 'missing-text' ? 'No usable post text (possibly media-only); human review required.' : 'Author/context evidence is not a confirmed text mention; human review required.' }));
  const bucketCount = bucket => batch.posts.filter(p => p.matchBucket === bucket).length;
  const summary = [{ 'Run key': safe(batch.runKey), Query: safe(batch.query), Requested: batch.requested, Returned: batch.posts.length,
    'Literal text matches': bucketCount('literal-text'), 'Author-only matches': bucketCount('author-only'), 'Context-only matches': bucketCount('context-only'), 'Missing text': bucketCount('missing-text'), Classified: triage.length,
    'Coverage note': `Bounded search; completeness unverified. Returned ${batch.posts.length}/${batch.requested}; a full count is not exhaustive. Match flags are literal evidence, not brand identity. AI uses excerpts; review before acting.` }];
  return { audit, triage, review, summary };
}
