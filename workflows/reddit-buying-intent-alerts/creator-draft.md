# Creator Portal Draft

## Title

Monitor Reddit buying intent with Apify, OpenAI and Telegram alerts

## Short description

Search Reddit on a schedule, classify new posts for buying intent in one AI batch, and send the strongest opportunities in one Telegram digest.

## Suggested categories

- Sales
- AI
- Social Media

## Who it is for

Founders, marketers, product researchers, and small sales teams that want to spot people actively asking for tools or services without automatically contacting anyone.

## What this workflow does

The workflow runs manually or every two hours. It creates its Data Tables automatically, loads a saved query and product context, and runs `fetch_cat/reddit-scraper` with comments disabled and a limit of 10 posts. New Reddit IDs are checked against a durable ledger before one structured OpenAI classification request.

Only high or medium buying intent above the configured score can qualify. Telegram receives one HTML-safe digest containing at most five posts with community, engagement, summary, qualification reason, and direct link. Evaluated IDs are committed only after Telegram delivery succeeds. The workflow never comments, replies, sends direct messages, or contacts authors.

## Setup

1. Install the Apify community node and import the workflow.
2. Connect Apify, OpenAI, and Telegram credentials.
3. Add the Telegram bot to the destination group and select its chat ID.
4. Run the setup form and enter a search query, optional subreddit, time window, product context, threshold, and item limit.
5. Test manually before publishing the two-hour schedule.

## Requirements

- n8n 2.26.8 or newer with Data Tables
- `@apify/n8n-nodes-apify` 0.6.10 or newer
- Apify account and access token
- OpenAI API credential with access to `gpt-5.4-mini`
- Telegram bot credential and destination chat

## Cost and privacy

Each run requests at most 10 posts and makes one OpenAI batch request. Costs depend on the Actor and model usage. Post content and the configured product context are sent to OpenAI. Qualified results are written only to the selected Telegram chat. No outreach is performed.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/setup-form.png`
- `assets/output-preview.png`
