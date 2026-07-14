![Pinterest search momentum workflow](assets/workflow-overview.png)

# Monitor Pinterest search momentum and plan what to publish next

Stop rebuilding a Pinterest content plan from scratch every week. This workflow
uses `fetch_cat/pinterest-search-scraper` to monitor five stable niche searches,
compare dated result snapshots, inspect current pin creatives, and create three
evidence-linked briefs for the next publishing cycle.

## Who is it for?

- Pinterest marketers and bloggers planning niche content
- Ecommerce teams monitoring visual search-result changes
- Agencies producing recurring research and content briefs
- SEO and editorial teams that need source-linked recommendations

## How it works

1. Runs manually or every Monday morning.
2. Fetches up to ten public pins for each of five configured queries.
3. Rejects partial datasets instead of analyzing missing queries.
4. Stores dated ranks and identifies new, rising, falling, steady, and repeated pins.
5. Assesses ten balanced current images with one structured OpenAI request.
6. Creates three original content briefs, a watch list, and next actions.
7. Saves sortable evidence to Google Sheets and a readable report to Notion.

The first run is a baseline, the second is an early comparison, and momentum
language requires at least two earlier snapshots. Search visibility is not search
volume or sales evidence, so the workflow never claims demand, popularity, or
commercial performance from ranking data alone.

## Required accounts

- Apify with access to `fetch_cat/pinterest-search-scraper`
- OpenAI with a vision-capable model
- Google Sheets
- Notion

Only built-in n8n nodes are used, so it works on n8n Cloud and self-hosted n8n.
It does not require Pinterest login and never publishes or edits pins.
