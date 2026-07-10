![LinkedIn Job Match Digest workflow](https://raw.githubusercontent.com/annamiy/fetchcat-n8n-workflows/main/workflows/linkedin-job-match-digest/assets/workflow-overview.png)

# Creator Portal Draft

## Title

Score LinkedIn jobs to Google Sheets and Slack with Apify and OpenAI

## Short description

Find recent LinkedIn jobs, score them against a candidate profile, save qualified matches to Google Sheets, and send the strongest results in one Slack digest.

## Suggested categories

- HR
- AI
- Productivity

## Description

### Who it's for

Job seekers, recruiters, career coaches, and small talent teams that want a repeatable daily shortlist without reviewing the same listings again.

### How it works

The workflow runs manually or every morning. It creates its configuration and delivery-ledger Data Tables automatically, then calls the FetchCat LinkedIn Jobs Scraper through Apify's HTTPS API for up to 10 jobs posted in the past 24 hours.

Invalid records and previously delivered LinkedIn job IDs are removed before one structured OpenAI request scores the complete batch against the saved candidate profile. Only schema-valid matches above the configured threshold are upserted into Google Sheets. Slack receives one digest containing the five strongest matches. IDs enter the delivery ledger only after Google Sheets and Slack succeed, so destination outages remain retryable.

### Setup

1. Import the workflow into n8n Cloud or self-hosted n8n.
2. Create an HTTP Header Auth credential with header `Authorization` and value `Bearer YOUR_APIFY_TOKEN`.
3. Connect OpenAI, Google Sheets, and Slack credentials.
4. Create a `Jobs` tab with the documented columns, then select the sheet, tab, and Slack channel.
5. Run the setup form to save keywords, location, candidate profile, score threshold, and item limit.
6. Test manually before publishing the daily schedule.

### Requirements

- n8n 2.26.8 or newer with Data Tables
- Apify account and access token
- OpenAI API access to `gpt-5.4-mini`
- Google Sheets and Slack credentials

### How to customize

Use the setup form to change the search, profile, threshold, and item limit. Change the run time in `Daily Schedule`. Keep the maximum at 10 to preserve the included cost controls.

Job descriptions and the candidate profile are sent to OpenAI. Qualified results are written only to the selected Google Sheet and Slack channel. The workflow never applies for jobs or contacts employers.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/setup-form.png`
- `assets/output-preview.png`
