![Pinterest content opportunity workflow](assets/workflow-overview.png)

# Research Pinterest content opportunities with FetchCat, OpenAI, Sheets and Notion

Turn five related Pinterest searches into a source-linked publishing plan. This
workflow uses `fetch_cat/pinterest-search-scraper` to collect complete current results,
inspect ten balanced pin images, identify visible search intent and content gaps, and
produce three specific ideas to publish or test next.

It is useful on the first run. Weekly history is optional and adds secondary rank and
appearance comparisons without calling them search-demand trends.

## Who is it for?

- Bloggers and editorial teams choosing specific Pinterest-led topics
- Ecommerce and affiliate teams connecting audience problems to useful content
- Pinterest marketers researching visible formats and differentiation gaps
- Agencies producing recurring, source-linked content opportunity reports

## How it works

1. Runs manually or every Monday morning.
2. Fetches up to ten public pins for each of five configured searches.
3. Waits for queued Apify runs and rejects partial datasets.
4. Assesses ten balanced current images in one structured OpenAI request.
5. Reports intent, dominant format, result similarity, and a content gap per search.
6. Creates three original briefs with visual direction, Pinterest copy, and citations.
7. Saves sortable evidence to Google Sheets and the readable plan to Notion.
8. Stores dated ranks so later runs can add visibility comparisons.

The workflow never treats visible repetition or rank movement as proof of search
volume, popularity, demand, engagement, or sales.

## Required accounts

- Apify with access to `fetch_cat/pinterest-search-scraper`
- OpenAI with a vision-capable model
- Google Sheets
- Notion

Only built-in n8n nodes are used, so it works on n8n Cloud and self-hosted n8n.
It does not require Pinterest login and never publishes or edits pins.
