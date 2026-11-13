# Triage Facebook brand mentions with Apify, OpenAI and Google Sheets

A manual evidence-validation workbench for brand researchers, using [fetch_cat/facebook-post-search-scraper](https://apify.com/fetch_cat/facebook-post-search-scraper). This is not a sentiment monitor, exhaustive listening service or automatic response generator.

## Setup (about 15 minutes)

Requires n8n Cloud or self-hosted n8n 2.47.4+, the verified Apify node `@apify/n8n-nodes-apify` 0.9.0, and existing Apify, OpenAI and Google Sheets credentials. No Facebook account, cookies, private URLs or group list is needed.

**Development blocker:** public sheet creation cannot complete because the existing FetchCat template Drive credential has no usable access token. The sheet-copy link and real editor/output screenshots are not yet available. Do not submit this development package for publication. Once that credential is restored, run `node scripts/sheet-template.mjs facebook-brand-mention-evidence-triage`, then replace `COPY_URL_PENDING` in the workflow overview and documents with the printed public copy URL. Never substitute an unrelated account.

1. Make a copy of the sheet template (COPY_URL_PENDING).
2. Import `workflow.json` and connect Apify, OpenAI and Google Sheets on their nodes.
3. In **1. Set your brand search**, paste your copied sheet URL into `sheetUrl`. All four destination nodes use it. Keep the supplied tabs and row-1 headers unchanged.
4. Edit the query; defaults are Starbucks, 10 posts, top ranking, 60 seconds and a $0.15 Actor-charge guard. Inputs omit proxy settings, dates, location and legacy aliases.
5. Leave `runKey` blank for a new execution snapshot. Reuse a run key only when refreshing the exact same query/snapshot. Run manually and keep the workflow inactive. No schedule is supplied.

## Behavior

- **Search audit:** every valid returned post, source text, match flags and nullable engagement counts. No author profiles, images, IDs or media are retained.
- **Mention triage:** complaint/question/endorsement/other for literal text matches only, with a short rationale and exact source quote. The model receives untrusted excerpts as data, never tools or permission to act. No replies or personal-trait inference.
- **Needs review:** author-only, context-only, missing-text/media-only results, plus literal matches excluded from the AI text budget. These are never counted as confirmed text mentions.
- **Run summary:** requested/returned counts and the match funnel. Always says bounded search; completeness unverified, even when the requested count was returned.

Literal eligibility requires both the Actor's `matchEvidence.textContainsQuery` flag and a case-insensitive substring in the actual source text. `authorContainsQuery` alone is not a text mention. The flags cannot establish brand identity: aliases, ambiguous names and nonliteral references need human review. Null text or counts remain blank, never invented text or zero engagement. Unknown matchEvidence contracts stop rather than guessing.

The AI call is one `gpt-5.4-mini` Responses batch maximum, with no reasoning, 800 output tokens, at most 1,000 characters per post and 4,000 UTF-8 bytes across excerpts. Excerpts center on a late literal match where necessary. Any post excluded by the total text budget goes to human review. Output must cover exactly the eligible post IDs with no duplicates/unknown IDs, valid types and verbatim source quotes. Invalid/incomplete JSON ends with a readable message and no destination writes. No eligible text means zero AI calls. Empty results produce an explicit coverage message with zero destination writes, not “no mentions exist.” Blocking/provider errors fail visibly; no silent retries.

## Reruns and human decisions

Search audit, Mention triage and Needs review upsert by **Record key**, a serialized `[runKey, postId]` pair. Run summary upserts by **Run key**. Writes use RAW values and escape formula-leading source strings. **Review status** is intentionally absent from the write mapping, so existing human edits survive refreshes and newly inserted rows are blank/unreviewed. A failed destination write may leave earlier tabs updated; rerun with the same run key to safely complete delivery. Upserts do not delete stale rows; use a new run key for a changed search, and do not treat the sheet as a transactional database.

## Cost and limits

Default Actor result estimate: 10 × highest current FREE-tier $0.0069 = **$0.069**. `maxTotalChargeUsd=0.15` guards Actor result charges, not all-in platform/proxy overhead. No hidden automatic retries.

OpenAI's [model reference](https://developers.openai.com/api/docs/models/gpt-5.4-mini), checked 13 Nov 2026, lists $0.75 input and $4.50 output per million tokens. With at most 4,000 UTF-8 source bytes plus bounded instructions/schema, an estimated <6,000 input tokens and 800 output tokens costs at most about **$0.0081** on standard non-regional pricing. This is an estimate, not a measured receipt or an all-in cap. A regional endpoint can add 10%. Long/truncated responses are rejected, not partly written.

At most three Apify-backed QA executions and **$1 total** across Actor charges, infrastructure/proxy and AI. Run one at a time through the company spend guard and inspect actual all-in receipts after each; stop before exhausting the budget. Builder paid-run count: **0**.

Top ranking is neither exhaustive nor a time trend; latest ranking is not strict chronology. A successful Actor status may still mean partial collection. The run-and-dataset node does not establish exhaustion or surface a trusted RUN-SUMMARY here, so the workflow never claims completeness. Restrict sheet access and retention as appropriate for public-source text; sanitize any examples before public sharing.

## Development verification

`node scripts/test-facebook-brand-mention-evidence-triage.mjs` tests pure transformations and actual embedded Code syntax without service calls. Fixtures are explicitly synthetic, not evidence of live extraction. Independent QA must verify the current Actor dataset, three-service delivery, human-status preservation and sanitized real sheet examples after the credential blocker is resolved. Static publication validation remains intentionally incomplete until the real copy URL and screenshots exist.
