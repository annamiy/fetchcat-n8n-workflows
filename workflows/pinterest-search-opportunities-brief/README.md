# Weekly Pinterest Content Opportunity Research

Runs the [FetchCat Pinterest Search Scraper](https://apify.com/fetch_cat/pinterest-search-scraper)
for five related niche searches and turns the current result landscape into an
evidence-linked publishing plan. The first run identifies visible search intent,
dominant formats, repetitive result patterns, differentiation gaps, and three
specific content opportunities. Later weekly runs add secondary search-visibility
movement without presenting rank changes as demand trends.

## Setup

1. Import `workflow.json` into n8n Cloud or self-hosted n8n.
2. Edit `1. Set Your Pinterest Research`: research name, publishing decision,
   publication or offer, audience, style, constraints, and exactly five focused,
   comma-separated searches.
3. Add `fetch_cat/pinterest-search-scraper` to your Apify account. Create HTTP
   Header Auth with header `Authorization` and value `Bearer YOUR_APIFY_TOKEN`,
   then select it in all three FetchCat HTTP Request nodes.
4. Connect a vision-capable OpenAI model in `3. Generate Content Opportunity Brief`.
5. Create a Google Sheet tab named `Pinterest Search` with headers: `Snapshot at`,
   `Query`, `Position`, `Previous position`, `Movement`, `Status`, `Pin`, `Title`,
   `Creator`, `Domain`, `Image`, `Saves`, `Repins`, `Pinterest pin ID`, and
   `Snapshot key`. Select it in the Sheets node.
6. Connect Notion, share a database with the integration, and select it in
   `5. Create Pinterest Brief in Notion`.
7. Run manually, review the content opportunities, then activate the Monday schedule
   if you also want visibility comparisons over time.

The workflow creates `FetchCat Pinterest Search Snapshots` automatically.

## First-Run Value

- A per-query assessment of informational, commercial, mixed, or unclear intent.
- The dominant visible result format and how repetitive the supplied results look.
- A concrete content gap and a narrower follow-up search for every query.
- Four evidence-linked current patterns and differentiation observations.
- Three original content briefs with audience problem, format, concept,
  differentiation, visual direction, Pinterest copy, keywords, and source pins.
- A watch list, next actions, linked source images, and sortable Sheet evidence.

## Later Weekly Runs

When the same five searches run on later dates, the report also shows new, rising,
falling, steady, and repeated search-result visibility. These are rank and appearance
signals, not Pinterest search volume, popularity, demand, clicks, or sales.

## Evidence Rules

- Five searches must each return at least 70% of the configured result limit,
  with an absolute minimum of five usable pins. Partial Actor output fails closed.
- Ten balanced current images are assessed in one structured request.
- Result similarity describes only the supplied visible pins.
- A first run cannot claim movement, recurrence, or emergence.
- One prior snapshot can produce early visibility signals but not emerging patterns.
- Emerging visibility labels require at least two earlier snapshot dates.
- Missing saves, repins, creators, and domains remain unknown rather than inferred.
- Sheets and Notion must succeed before the dated snapshot is committed.

## QA

Test the current-landscape report, a synthetic historical comparison, queued Actor
runs, and an incomplete-dataset failure. Confirm evidence citations, specific content
gaps, idempotent same-day behavior, readable Notion formatting, sortable Sheet fields,
clean export/reimport, inactive schedules, and a clean secret scan.
