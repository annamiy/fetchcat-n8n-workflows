# Creator Portal Draft

## Title

Monitor Telegram competitors with Apify, OpenAI and Slack

## Short description

Monitor public Telegram channels daily, deduplicate posts before AI, and send an evidence-linked competitor intelligence digest to Slack.

## Suggested categories

- Market Research
- AI
- Social Media

## Who it is for

Founders, product marketers, agencies, and competitive-intelligence teams that
need recurring evidence from public Telegram channels without manually reading
every post.

## What this workflow does

The workflow runs manually or on an inactive daily schedule. A setup form saves
up to ten public Telegram channel handles or URLs, market context, lookback
hours, and post limits. It creates its n8n Data Tables automatically and exits
without scraping until setup exists.

The FetchCat Actor collects recent public posts with media and comment-body
extraction disabled. The workflow validates timestamps, IDs, text, and source
URLs, then checks each `channelHandle:postId` against a durable delivery ledger
before one structured OpenAI request. The model identifies launches,
promotions, positioning changes, topic shifts, and unusually strong posts.
Every claim must cite a supplied post key, and those citations are validated
before one Slack digest is sent. Post keys are committed only after Slack
succeeds.

## Setup

1. Install the Apify community node and import the workflow.
2. Connect Apify, OpenAI, and Slack credentials.
3. Select the Slack destination channel.
4. Run the setup form with public channels and market context.
5. Test manually before activating the daily schedule.

## Requirements

- n8n 2.26.8 or newer with Data Tables
- `@apify/n8n-nodes-apify` 0.6.10 or newer
- Apify account and access token
- OpenAI credential with access to `gpt-5.4-mini`
- Slack credential and destination channel

## Cost and privacy

Production controls cap retrieval at 25 posts per channel and 50 posts overall.
Costs depend on Actor and model usage. Public post text and configured market
context are sent to OpenAI. Results are written only to the selected Slack
channel. The workflow performs no Telegram outreach.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/setup-form.png`
- `assets/output-preview.png`
