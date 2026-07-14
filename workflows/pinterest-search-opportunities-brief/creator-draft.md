![Pinterest visual opportunity workflow](assets/workflow-overview.png)

# Find Pinterest product and content opportunities with visual AI analysis

Turn public Pinterest search results into a decision brief rather than a generic
idea list. This workflow runs `fetch_cat/pinterest-search-scraper`, assesses nine
actual pin images and their metadata, rejects irrelevant results, and creates
three evidence-linked concepts only when the research passes a configurable
quality threshold.

Weak or ambiguous searches do not produce fabricated opportunities. They create
a Notion query-repair report with rejected evidence, replacement searches, and
next actions.

## Who is it for?

- Ecommerce and print-on-demand teams deciding what to test next
- Pinterest marketers researching visual formats and creative gaps
- Agencies creating repeatable, source-linked opportunity briefs
- Content teams that need evidence quality controls before ideation

## What it does

1. Runs manually or every Monday morning.
2. Searches exactly three focused queries with FetchCat Pinterest Search Scraper.
3. Selects nine balanced, image-backed pins and compares dated search positions.
4. Uses one structured OpenAI vision call to assess relevance and visual patterns.
5. Applies a minimum relevant-evidence gate.
6. Creates either three testable concepts or an insufficient-evidence report.
7. Saves sortable evidence to Google Sheets and embeds source images and links in Notion.
8. Commits the snapshot only after both destinations succeed.

## Required accounts

- Apify with access to `fetch_cat/pinterest-search-scraper`
- OpenAI with a vision-capable model
- Google Sheets
- Notion

The workflow uses built-in n8n nodes, works on n8n Cloud and self-hosted n8n,
does not require Pinterest login, and never publishes or edits pins.

## Accuracy controls

The workflow does not equate keyword overlap with relevance. It does not invent
market demand, sales, search volume, clicks, impressions, or missing engagement
metrics. Recommendations cite only pins judged relevant, and the prompt excludes
trademarks, copyrighted characters, copied designs, and close imitation.
