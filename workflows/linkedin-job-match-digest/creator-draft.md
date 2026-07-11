![LinkedIn Job Match Digest workflow](https://raw.githubusercontent.com/annamiy/fetchcat-n8n-workflows/main/workflows/linkedin-job-match-digest/assets/workflow-overview.png)

# Creator Portal Draft

## Title

Score LinkedIn jobs and deliver matches with Apify and OpenAI

## Short description

Find recent LinkedIn jobs, score them against a candidate profile, and deliver qualified matches to Slack, Gmail, Telegram, Google Sheets, or Notion.

## Suggested categories

- HR
- AI
- Productivity

## Description

### Who it's for

Job seekers, recruiters, career coaches, and small talent teams that want a repeatable daily shortlist without reviewing the same listings again.

### How it works

The workflow runs manually or every day at noon. Users edit the search, candidate profile, score threshold, item limit, and destination in one visible `Edit Search Settings` node. The workflow creates its delivery ledger automatically and calls the FetchCat LinkedIn Jobs Scraper through Apify's HTTPS API for up to 10 jobs posted in the past 24 hours.

Invalid and previously delivered jobs are removed before one structured OpenAI request scores the complete batch. Only schema-valid matches above the configured threshold continue. A routing chain sends them to exactly one selected destination: one Slack, Gmail, or Telegram digest; upserted Google Sheets rows; or individual Notion pages. LinkedIn job IDs enter the ledger only after that destination succeeds, so outages remain retryable.

### Setup

1. Import the workflow into n8n Cloud or self-hosted n8n.
2. Edit the search settings and choose `slack`, `gmail`, `telegram`, `googleSheets`, or `notion`.
3. Connect Apify using HTTP Header Auth and connect OpenAI.
4. Configure credentials and identifiers only for the selected destination node.
5. Test manually before publishing the noon schedule.

### Requirements

- n8n 2.26.8 or newer with Data Tables
- Apify account and access token
- OpenAI API access to `gpt-5.4-mini`
- One supported destination account

### How to customize

Change search values and destination in `Edit Search Settings`; change the run time in `Daily Schedule`. Keep the maximum at 10 to preserve the included cost controls.

Job descriptions and the candidate profile are sent to OpenAI. Qualified results are written only to the selected destination. The workflow never applies for jobs or contacts employers.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/output-preview.png`
