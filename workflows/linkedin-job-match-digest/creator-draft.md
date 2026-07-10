# Creator Portal Draft

## Title

Find and score new LinkedIn jobs with Apify, OpenAI, Google Sheets and Slack

## Short description

Search the newest LinkedIn jobs, score them against a candidate profile in one AI batch, save qualified matches to Google Sheets, and send a concise Slack digest.

## Suggested categories

- HR
- AI
- Productivity

## Who it is for

Job seekers, recruiters, career coaches, and small talent teams that want a repeatable daily shortlist instead of manually reviewing the same listings.

## What this workflow does

The workflow runs manually or every morning. It creates its n8n Data Tables automatically, loads the saved search and candidate profile, and runs `fetch_cat/linkedin-jobs-scraper` for jobs posted in the past 24 hours. It filters invalid navigation records, checks a durable processed-item ledger, and sends up to 10 new jobs to one structured OpenAI request.

Only schema-valid matches above the configured score are written to Google Sheets. Rows are upserted by the LinkedIn job ID, and Slack receives one digest containing the five strongest matches. Evaluated IDs are committed only after destination delivery succeeds, so an outage remains retryable.

## Setup

1. Install the Apify community node and import the workflow.
2. Connect Apify, OpenAI, Google Sheets, and Slack credentials.
3. Create a `Jobs` sheet with the headers documented in the workflow sticky note.
4. Select the sheet and Slack channel in their destination nodes.
5. Run the setup form and enter job keywords, location, candidate profile, threshold, and item limit.
6. Test manually before publishing the daily schedule.

## Requirements

- n8n 2.26.8 or newer with Data Tables
- `@apify/n8n-nodes-apify` 0.6.10 or newer
- Apify account and access token
- OpenAI API credential with access to `gpt-5.4-mini`
- Google Sheets and Slack credentials

## Cost and privacy

Each run requests at most 10 Actor results and makes one OpenAI batch request. Costs depend on the Actor, model usage, and connected services. Job descriptions and the configured candidate profile are sent to OpenAI. Qualified results are written only to the selected Google Sheet and Slack channel. The workflow never applies for jobs or contacts employers.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/setup-form.png`
- `assets/output-preview.png`
