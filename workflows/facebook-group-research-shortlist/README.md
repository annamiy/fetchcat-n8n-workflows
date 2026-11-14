# Shortlist Facebook groups for community research with Apify, OpenAI and Google Sheets

A manual discovery-to-review workbench for local community researchers. Uses [fetch_cat/facebook-groups-search-scraper](https://apify.com/fetch_cat/facebook-groups-search-scraper), one OpenAI batch, and a Google Sheets evidence ledger. This is not a monitor or an engagement tool.

## Development status

**Not ready for QA or publication.** The public sheet template is pending restoration of the configured FetchCat Templates Google Drive credential: the existing helper fails on its first request with `Unable to sign without access token`. There is no copy URL yet. No substitute account or fabricated sheet link is supplied. Editor and real-output screenshots are also pending; the anonymous editor redirects to sign-in. No login or account change was attempted.

## Setup (about 10 minutes once the sheet is available)

1. Use n8n 2.47.4 or newer; install the official verified Apify node 0.9.0.
2. Make a copy of the sheet template: **pending credential repair**. Keep `Groups` and `Shortlist` tab names and their row-1 headers unchanged. Do not use the public demonstration sheet as your destination.
3. Import `workflow.json`. Connect Apify, OpenAI and Google Sheets credentials in the respective nodes. Credentials and spreadsheet identifiers are not included in this repository.
4. In **1. Set your research brief**, enter the spreadsheet ID from your copy's URL. All Sheets nodes reference this setting. The gardening/London example works without changing the topic. Optional changes, result limits and the Apify charge cap are all in this node; never edit Code nodes.
5. Execute manually and review the final result and the sheet. Leave this workflow inactive; it contains no schedule, webhook or automatic retries.

## Behavior

The Actor runs once, with up to ten groups, no paid detail enrichment, and privacy `any`. URL variants are canonicalized to `https://www.facebook.com/groups/<identifier>/` and deduplicated. Queries for duplicate hits are combined. Optional member counts and privacy are allowed to remain unknown. Snippets in the evidence ledger are limited to 600 characters.

One structured OpenAI batch labels topic fit as `relevant`, `not-relevant` or `needs-review`. The prompt treats scraped text as untrusted data. Returned URLs must be supplied canonical URLs, assessments must cover the batch exactly once, and evidence quotes must be literal substrings of the corresponding source. A relevance label without a quote is rejected. This validation limits fabricated evidence; it cannot make an AI topic judgment authoritative.

`Groups` is upserted by **Group URL**, mapping only machine-owned columns. **Review Status** and **Reviewer Notes** are deliberately omitted from the mapping, preserving human decisions on repeat runs; they are blank for new groups. Historical groups not returned in the latest search remain in the ledger. Do not overlap manual executions or modify matching keys during a run.

After the ledger succeeds, `Shortlist!A2:F` is cleared and replaced with at most five relevant groups ordered by search rank. This is a research queue, not a claim of the best or most active groups. A zero-candidate shortlist clears old machine results and reports zero. Clear and append are not transactional: a Sheets failure can leave a partial ledger or an empty/partial shortlist. Review the failed execution and rerun manually; no automatic retry can start another Actor run.

Empty discovery or entirely invalid rows produce a readable result without an AI call or sheet writes. Previous sheet contents remain unchanged, and must not be mistaken for current results. Partial valid output is marked partial, with invalid rows counted. Malformed, incomplete, unallowlisted or unsupported AI output produces a **needs-review** execution result with discovery data and no sheet changes. This is intentionally safer than saving unchecked AI text. Service errors stop delivery or take this fallback; they are never presented as successful extraction. Formula-like strings are escaped before spreadsheet delivery.

## Costs and limits

- One Actor execution per manual run; `maxTotalChargeUsd` is forwarded through the official Apify node and must be greater than zero and at most **$0.05**.
- At most ten saved groups. Current researched Free-tier estimate: $0.005 start + 10 × $0.00057499 = **$0.0107499**, before any price changes. This estimate is not a bill guarantee.
- The current builder pipeline requires **gpt-5.4-mini**, replacing the research proposal's gpt-4o-mini. [OpenAI pricing](https://developers.openai.com/api/docs/pricing), checked 14 November 2026: $0.75/M input tokens and $4.50/M output tokens (standard). At <=6,000 input and <=1,200 output tokens: **$0.0099 maximum model estimate**, below the proposed $0.02 allowance. Input JSON is reduced to <=4,000 UTF-8 bytes by shortening snippets/titles; 2,000 tokens are reserved for schema, instructions and framing. An overlong remaining batch stops before AI. Output tokens include reasoning. No tools, external retrieval or extra model calls are enabled.
- Planned total allowance remains **$0.07/run**, **$0.21 for three QA executions**. Other platform/hosting fees are separate. Pricing can change; check before running.
- Developer paid Apify executions: **0**. Developer paid model calls: **0**. Actual default-build dataset output, live charge-cap propagation and destination behavior remain for independent QA after setup repair, within the three-execution limit.

## Evidence limitations and privacy

London is a search qualifier, not verified location. Indexed snippets may be stale; activity, audience demographics, accessibility, privacy and permission are not established. Topic fit does not authorize joining, posting or contacting anyone. This workflow does not join groups, scrape posts or members, message people, use Facebook credentials, or pass an interactive challenge.

## Development checks

```sh
node scripts/build-facebook-group-research.mjs
node scripts/test-facebook-group-research.mjs
node scripts/test-facebook-group-runtime.mjs
npm run validate
```

The runtime test imports an inactive, credential-free **synthetic** helper and stubs every Apify, OpenAI and Sheets node. It exercises the actual n8n JavaScript sandbox without paid calls or real destination writes. Fixtures are explicitly synthetic and must not become public demonstration rows. QA must add real public example rows to `assets/sheet-template.json` later and capture actual editor/output screenshots. Full static validation currently fails on the missing sheet copy link and publication assets; this is not a release-ready package.

Regenerate with `SHEET_COPY_URL=<actual-public-copy-url> node scripts/build-facebook-group-research.mjs` after credential restoration. Add that real link to this README and `creator-draft.md`, create the sheet with the helper, re-import inactive, export/sanitize, check drift and finish screenshots before handoff to QA. Never publish or submit without independent QA and Anna's exact template approval through Publisher.
