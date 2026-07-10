# LinkedIn Job Match Digest

Runs `fetch_cat/linkedin-jobs-scraper` for the newest jobs from the past 24
hours, checks a durable delivery ledger, scores all new jobs in one strict
structured AI call, upserts qualified jobs to
Google Sheets, and sends one Slack digest containing the top five.

The workflow has a manual trigger and a daily 08:00 trigger. It is deliberately
inactive on import.

## Setup

1. Install `@apify/n8n-nodes-apify@0.6.10` and import `workflow.json`.
2. Create `FetchCat Delivery Ledger` and `FetchCat LinkedIn Config` using the
   table schemas below, then add one config row whose `configKey` is `default`.
3. Add Apify and OpenAI credentials to the processing nodes.
4. Create a spreadsheet named `FetchCat n8n QA - LinkedIn Jobs` with a `Jobs`
   tab and these headers: `title`, `company`, `location`, `postedAt`,
   `jobLink`, `score`, `reason`, `collectedAt`, `linkedInJobId`. Format
   both `postedAt` and `collectedAt` as Date time in Google Sheets.
5. Add Google Sheets credentials and select that spreadsheet and tab in
   `Upsert Qualified Jobs`.
6. Create or select the `fetchcat-n8n-qa` Slack channel, connect Slack, and
   select it in `Send Slack Digest`.
7. Import `../shared-error-notifications/workflow.json` and select it as this
   workflow's error workflow.

LinkedIn config columns: `configKey` (string), `keywords` (comma-separated
string), `location` (string), `candidateProfile` (string), `minimumScore`
(number), and `maxItems` (number). Ledger columns: `workflowSlug` (string),
`itemKey` (string), `destination` (string), and `deliveredAt` (date/time).

No credential ID is stored in this repository. Selecting credentials changes
only the private instance copy.

## Behavior

```mermaid
flowchart LR
  T[Manual or daily trigger] --> A[Run LinkedIn Actor]
  A --> D[Keep IDs absent from delivery ledger]
  D --> O[One strict AI batch score]
  O --> F[Validate and filter]
  F --> G[Upsert Sheets rows by job ID]
  G --> S[Send one Slack digest]
  S --> L[Commit evaluated IDs to ledger]
```

- Actor input is fixed to `past24h`, newest first, and at most 10 jobs.
- Descriptions are capped before they reach OpenAI.
- Known LinkedIn navigation labels are discarded before scoring.
- Batch validation fails closed unless OpenAI returns exactly one unique result
  for every supplied job ID.
- IDs are committed only after Sheets and Slack finish successfully. A failed
  destination remains retryable; Sheets upsert prevents duplicate rows.
- Posted-relative text is converted to a sortable estimated Sheets date-time
  using the Actor's collection timestamp. Collection time is also stored as a
  true date-time value.
- `jobLink` displays a compact `Open job` hyperlink. `linkedInJobId` is the
  stable LinkedIn job ID used for cross-execution deduplication.
- Fit reasons are always returned in English, even for non-English listings.
- A delivered duplicate or empty run creates no rows and sends no Slack message.

## QA

Use no more than three Apify-backed runs: a happy path, an immediate duplicate
rerun, and one negative/empty query. Confirm the second run adds zero rows and
sends zero messages. Export, sanitize, reimport, and execute the reimport before
marking the workflow `qa-passed`.

Synthetic Actor output and assertions are under `fixtures/`; they contain no
real jobs or personal data.
