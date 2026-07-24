# Cross-Network Competitor Creative Radar

Inactive n8n template for a weekly competitor creative brief across Meta Ads Library, Google Ads Transparency, and TikTok Creative Center Top Ads.

## What it does

- Runs `fetch_cat/facebook-ads-library-scraper`, `fetch_cat/google-ads-transparency-scraper`, and `fetch_cat/tiktok-ads-library-scraper` independently.
- Caps collection at 10 items per source, 3 Actor runs, and 30 normalized rows per execution.
- Stores config, snapshots, and delivery ledger rows in n8n Data Tables.
- Preserves source run/dataset provenance, source status, coverage type, and source-specific signals.
- Uses one optional structured OpenAI request pinned to `gpt-5.4-mini` for evidence-backed theme classification.
- Writes one Markdown brief to Google Drive and optionally posts one Slack notification only after Drive succeeds.

## Setup

Open the setup form and provide a watchlist label, market, reporting window, item cap, and Slack preference. Add Apify and Google Drive credentials in n8n. OpenAI and Slack credentials are optional; the no-AI path should still render a truthful unclassified brief.

## Private QA execution path

Because n8n 2.26.8 disables Data Table nodes in standalone CLI executions, QA should verify this template through the inactive private server editor:

1. Import with `N8N_IMPORT_ID=qa-final-apia-2310 npm run import -- cross-network-competitor-creative-radar` and confirm the workflow remains inactive.
2. Open the imported workflow in the private n8n editor and bind QA Apify + Google Drive credentials; bind OpenAI/Slack only for the specific test that needs them.
3. Keep Slack disabled for the baseline by leaving `slackNotify=false` in `Editor Setup Values`. The node supplies `watchlistLabel=FetchCat QA`, `market=US`, `itemsPerSource=3`, and `reportingWindow=last_7_days`; QA may edit those non-secret values in that Set node for negative/empty tests.
4. Click **Execute workflow** from the inactive editor. This follows `Manual Trigger → Editor Setup Values → Ensure Data Tables → Validate Setup...` and then runs the same Actor, normalization, Drive, optional Slack, snapshot, and delivery-ledger chain as the form path.
5. Re-run the same editor execution immediately for the duplicate-path check. The delivery ledger must stop before AI, Drive, Slack, snapshot, and delivery writes when the deterministic idempotency key already exists.
6. For missing-credential checks, unbind the target credential on the inactive QA copy and execute from the same manual path; it must fail before committing snapshot or delivery rows.

## Truth guardrails

The workflow compares creative evidence, not network performance. Meta reach/spend ranges, Google impression ranges, and TikTok likes/CTR/cost signals stay in `source_signals` JSON and are never blended, averaged, scored, or ranked across sources. TikTok rows are labeled `curated_top_ads`. Absence is rendered as “not observed” unless a source explicitly proves inactive/ended status.

## Data Tables

- `creative_radar_config`: editable non-secret setup values and config fingerprint.
- `creative_radar_snapshots`: normalized rows, source status, source-specific signals, and provenance.
- `creative_radar_deliveries`: idempotency key, destination result, and delivered timestamp.

## Expected outputs

The Google Drive Markdown brief includes collection scope, source caveats, new/persistent/not-observed rows when comparable snapshots exist, evidence links, and cross-network themes only when a reviewed stable theme appears in two or more sources.
