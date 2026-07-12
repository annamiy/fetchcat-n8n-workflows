![LinkedIn Job Match Digest workflow](https://raw.githubusercontent.com/annamiy/fetchcat-n8n-workflows/main/workflows/linkedin-job-match-digest/assets/workflow-overview.png)

# Creator Portal Draft

## Title

Score LinkedIn jobs and deliver matches with Apify and OpenAI

## Short description

Find recent LinkedIn jobs, score them against a candidate profile, save qualified matches to Google Sheets, and send a concise Slack digest.

## Suggested categories

- HR
- AI
- Productivity

## Description

### Who it's for

Job seekers, recruiters, career coaches, and small talent teams that want a repeatable daily shortlist without reviewing the same listings again.

### How it works

The workflow runs manually or every day at noon. Users edit the search, candidate profile, score threshold, and item limit in one visible `1. Set Your Job Search` node. The workflow creates its delivery ledger automatically and calls the FetchCat LinkedIn Jobs Scraper through Apify's HTTPS API for up to 10 jobs posted in the past 24 hours.

Invalid and previously delivered jobs are removed before one structured OpenAI request scores the complete batch. Only schema-valid matches above the configured threshold continue. The workflow upserts those jobs to Google Sheets, sends the five strongest matches in one Slack digest, and records LinkedIn job IDs only after both destinations succeed. An interrupted delivery therefore remains retryable without duplicating Sheet rows.

### Setup

1. Import the workflow into n8n Cloud or self-hosted n8n.
2. Edit the search settings and candidate profile.
3. Connect Apify using HTTP Header Auth and connect OpenAI.
4. Select the Google Sheet, Jobs tab, Slack credential, and Slack channel.
5. Test manually before publishing the noon schedule.

### Requirements

- n8n 2.26.8 or newer with Data Tables
- Apify account and access token
- OpenAI API access to `gpt-5.4-mini`
- Google Sheets and Slack accounts

### How to customize

Change search values in `1. Set Your Job Search`; change the run time in `Daily Schedule`. Keep the maximum at 10 to preserve the included cost controls.

Job descriptions and the candidate profile are sent to OpenAI. Qualified results are written to the configured Sheet and Slack channel. The workflow never applies for jobs or contacts employers.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/output-preview.png`
