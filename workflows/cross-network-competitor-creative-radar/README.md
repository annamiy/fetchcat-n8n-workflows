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

## Truth guardrails

The workflow compares creative evidence, not network performance. Meta reach/spend ranges, Google impression ranges, and TikTok likes/CTR/cost signals stay in `source_signals` JSON and are never blended, averaged, scored, or ranked across sources. TikTok rows are labeled `curated_top_ads`. Absence is rendered as “not observed” unless a source explicitly proves inactive/ended status.

## Data Tables

- `creative_radar_config`: editable non-secret setup values and config fingerprint.
- `creative_radar_snapshots`: normalized rows, source status, source-specific signals, and provenance.
- `creative_radar_deliveries`: idempotency key, destination result, and delivered timestamp.

## Expected outputs

The Google Drive Markdown brief includes collection scope, source caveats, new/persistent/not-observed rows when comparable snapshots exist, evidence links, and cross-network themes only when a reviewed stable theme appears in two or more sources.
