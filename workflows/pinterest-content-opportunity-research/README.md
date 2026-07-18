# Analyze Pinterest Content Opportunities with Apify, OpenAI and Google Sheets

Run the [FetchCat Pinterest Search Scraper](https://apify.com/fetch_cat/pinterest-search-scraper)
for a niche, preserve every source pin, summarize the visible content landscape, and
produce an evidence-linked research brief.

For example, `female cycling` can return up to the configured result limit, reveal
recurring content themes and underrepresented angles, and produce five production-ready
content briefs. It does not present search-result evidence as Pinterest search volume
or demand.

## What You Get

- A `Pins` tab containing every source result and its search position.
- A `Research Brief` tab containing a summary, leading themes, underrepresented
  angles, and exactly five production-ready content tests.
- Each content test includes a proposed pin title, visual concept, format, audience
  problem, differentiating angle, destination content, observed phrases, and clearly
  labeled unvalidated search-expansion ideas.
- Direct links from every finding to supplied Pinterest pins.
- Stable research keys, so rerunning the same niche on the same day updates rows
  instead of duplicating them.

## Setup

1. Import `workflow.json` into n8n Cloud or self-hosted n8n.
2. Create one Google spreadsheet with two tabs and these row-one headers:

   `Pins`: `Research at`, `Niche`, `Search`, `Position`, `Pin`, `Title`,
   `Description`, `Creator`, `Board`, `Domain`, `Destination`, `Image`, `Format`,
   `Saves`, `Repins`, `Pinterest pin ID`, `Research key`.

   `Research Brief`: `Research at`, `Niche`, `Section`, `Finding`, `Evidence`,
   `Matching pins`, `Sort order`, `Research key`.

3. Freeze row one on every tab and format each `Research at` column as **Date time**.
4. Connect the same Google Sheets credential and select the matching tab in each
   Sheets node.
5. Add `fetch_cat/pinterest-search-scraper` to your Apify account. Create HTTP
   Header Auth with header `Authorization` and value `Bearer YOUR_APIFY_TOKEN`, then
   select it in `2. Collect Pinterest Results with FetchCat`.
6. Connect OpenAI in `3. Analyze Content Landscape and Opportunities`.
7. Edit `1. Set Your Research Niche`. Enter a niche and one to five exact Pinterest
   search phrases. The default is 100 pins per search; the supported maximum is 500.
   Public detail enrichment is enabled by default because creator, board, domain, and
   destination fields are otherwise often unavailable.
8. Run manually and review the linked source pins before acting on recommendations.

## How Analysis Works

The workflow deterministically counts formats and recurring phrases. It then sends a bounded evidence packet to one
structured `gpt-5.4-mini` request. Invalid citations are removed, while a finding with
no supplied evidence or malformed output stops the workflow before any Sheet write.
Observed phrases come from the supplied pins. Suggested search expansions are
brainstorming prompts and are labeled as unvalidated rather than presented as
Pinterest keywords.

Large result sets remain useful even when not every description fits in the bounded
AI packet: every normalized pin is still written to `Pins`, while the summary reports
the exact number included in AI analysis.

## Interpretation

The report describes the Pinterest results returned for the searches you supplied.
It can support content-landscape research, visible source research, visual SEO, and
content planning. It does not discover Pinterest autocomplete keywords, provide monthly search volume, or
prove trend growth, engagement, clicks, sales, or demand. Save and repin counts remain
blank when Pinterest does not expose them publicly. Creator, board, domain, and
destination fields stay on each `Pins` row when available; no separate source summary
is promised.

## QA

Test valid source collection, fewer-than-ten-pin failure, duplicate pin removal,
malformed AI output, invented evidence IDs, both Sheet writes, same-day reruns,
export/reimport, inactive state, and secret scanning.
