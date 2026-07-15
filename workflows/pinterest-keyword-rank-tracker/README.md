# Track Pinterest Keyword Rankings Weekly with Apify and Google Sheets

Runs the [FetchCat Pinterest Search Scraper](https://apify.com/fetch_cat/pinterest-search-scraper)
for one to ten keywords, compares the current Pinterest search positions with the
latest earlier snapshot, and saves readable ranking history to Google Sheets.

No OpenAI, Notion, community nodes, or separate database is required. The Google
Sheet is both the user-facing report and the durable history used by later runs.

## Setup

1. Import `workflow.json` into n8n Cloud or self-hosted n8n.
2. Create a Google Sheet tab named `Pinterest Search` with these headers in row one:
   `Snapshot at`, `Query`, `Position`, `Previous position`, `Movement`, `Status`,
   `Pin`, `Title`, `Creator`, `Domain`, `Image`, `Saves`, `Repins`,
   `Pinterest pin ID`, and `Snapshot key`. Freeze row one and format column A as
   **Date time** so the numeric timestamps display as sortable dates and times.
3. In both Google Sheets nodes, connect the same credential and select that same
   spreadsheet and tab.
4. Add `fetch_cat/pinterest-search-scraper` to your Apify account. Create an HTTP
   Header Auth credential with header `Authorization` and value
   `Bearer YOUR_APIFY_TOKEN`, then select it in `2. Search Pinterest with FetchCat`.
5. Edit `1. Set Your Pinterest Searches`. Enter one to ten searches separated by
   commas or new lines, plus locale, country, results per query, and optional detail
   enrichment.
6. Run manually once to save a baseline. Activate the Monday schedule only after
   confirming the rows look correct.

## Output

Each dated snapshot contains sortable numeric positions and direct links to the pin
and image. The `Status` column uses plain language:

- `First snapshot`: no earlier snapshot exists for that query.
- `New in search results`: the pin was absent from the latest earlier snapshot.
- `Moved up`: the pin moved closer to position one.
- `Moved down`: the pin moved farther from position one.
- `Unchanged`: the position is the same.
- `No longer visible`: a pin from the previous snapshot is absent now.

`Movement` is previous position minus current position, so a positive number means
the pin moved up. Same-day reruns use `Snapshot key` to update the dated rows instead
of duplicating them.

## Interpretation

The workflow tracks visibility within the returned Pinterest search results. Rank
movement does not prove search-volume growth, popularity, clicks, sales, or demand.
Save and repin counts remain blank when Pinterest does not expose them. A pin marked
`No longer visible` may still exist outside the configured result depth.

## QA

Test a first run against an empty sheet, a later snapshot containing moved and new
pins, a disappeared pin, an empty-query failure, and a same-day rerun. Confirm numeric
date/rank fields, readable hyperlinks, unique Snapshot keys, clean export/reimport,
inactive schedules, and a clean secret scan.
