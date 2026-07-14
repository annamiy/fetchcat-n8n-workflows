# Weekly Pinterest Search Momentum Monitor

Runs the [FetchCat Pinterest Search Scraper](https://apify.com/fetch_cat/pinterest-search-scraper)
every Monday for five stable niche queries. It records complete Pinterest search
snapshots, measures which pins entered or moved, visually reviews ten balanced
current results, and turns the evidence into three content briefs for the next
publishing cycle.

The first run is a current-landscape baseline. The second is explicitly an early
comparison. Only the third and later snapshots may label a repeated search-result
pattern as momentum. This workflow does not equate ranking movement with search
volume, popularity, or commercial demand.

## Setup

1. Import `workflow.json` into n8n Cloud or self-hosted n8n.
2. Edit `1. Set Your Pinterest Research`: monitor name, publishing decision,
   publication or offer, audience, style, constraints, and exactly five stable,
   comma-separated queries. Keep these queries unchanged between weekly runs.
3. Add `fetch_cat/pinterest-search-scraper` to your Apify account. Create HTTP
   Header Auth with header `Authorization` and value `Bearer YOUR_APIFY_TOKEN`,
   then select it in both FetchCat HTTP Request nodes.
4. Connect a vision-capable OpenAI model in `3. Generate Weekly Content Brief`.
5. Create a Google Sheet tab named `Pinterest Search` with headers: `Snapshot at`,
   `Query`, `Position`, `Previous position`, `Movement`, `Status`, `Pin`, `Title`,
   `Creator`, `Domain`, `Image`, `Saves`, `Repins`, `Pinterest pin ID`, and
   `Snapshot key`. Select it in the Sheets node.
6. Connect Notion, share a database with the integration, and select it in
   `5. Create Pinterest Brief in Notion`.
7. Run manually once, verify the baseline report, then activate the Monday schedule.

The workflow creates `FetchCat Pinterest Search Snapshots` automatically.

## What You Receive

- A query dashboard showing new, rising, falling, steady, and repeated results.
- Four evidence-linked current, recurring, or emerging search-landscape patterns.
- Three original content briefs with format, audience intent, differentiation,
  visual direction, Pinterest title and description, keywords, and test metric.
- A watch list, five follow-up queries, next actions, and linked source images.
- Sortable Google Sheets evidence and a readable Notion decision brief.

## Evidence Rules

- Five queries must each return at least 70% of the configured result limit,
  with an absolute minimum of five usable pins. Partial Actor output fails closed.
- Ten balanced images are assessed in one structured request.
- A baseline cannot claim movement or recurring patterns.
- One prior snapshot can produce early signals but not emerging patterns.
- Emerging labels require at least two earlier snapshot dates.
- Missing saves, repins, creators, and domains remain unknown rather than inferred.
- Sheets and Notion must succeed before the dated snapshot is committed.

## QA

Run a baseline, a synthetic historical comparison, and an incomplete-dataset
negative test. Confirm stage language, citations, idempotent same-day behavior,
human-readable Notion formatting, sortable Sheet fields, clean export/reimport,
inactive schedules, and a clean secret scan.
