# Creator Portal Draft

## Title

Analyze Shopify app reviews with Apify, OpenAI and Slack

## Short description

Monitor Shopify App Store reviews weekly, deduplicate them before AI, and send an evidence-linked product intelligence digest to Slack.

## Suggested categories

- Market Research
- AI
- Product

## Who it is for

Shopify app founders, product managers, competitive-intelligence teams, and
agencies that need recurring evidence from their own or competing app reviews.

## What this workflow does

The workflow runs manually or on an inactive Monday schedule. A setup form
saves up to three Shopify app URLs or handles, product context, rating filters,
lookback days, and review limits. It creates its n8n Data Tables automatically
and exits without scraping until setup exists.

The FetchCat Actor collects the newest reviews. The workflow validates dates,
IDs, text, and source URLs, then checks each `appHandle:reviewId` against a
durable delivery ledger before one structured OpenAI request. The model
identifies recurring complaints, feature requests, positive signals, urgent
issues, and recommended actions. Every claim must cite a supplied review ID,
and those citations are validated before one Slack digest is sent. Review keys
are committed only after Slack succeeds.

## Setup

1. Install the Apify community node and import the workflow.
2. Connect Apify, OpenAI, and Slack credentials.
3. Select the Slack destination channel.
4. Run the setup form with one to three apps and product context.
5. Test manually before activating the weekly schedule.

## Requirements

- n8n 2.26.8 or newer with Data Tables
- `@apify/n8n-nodes-apify` 0.6.10 or newer
- Apify account and access token
- OpenAI credential with access to `gpt-5.4-mini`
- Slack credential and destination channel

## Cost and privacy

Production controls cap retrieval at 25 reviews per app and AI analysis at 30
new reviews per run. Costs depend on Actor and model usage. Review content and
the configured product context are sent to OpenAI. Results are written only to
the selected Slack channel. The workflow never contacts reviewers or merchants.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/setup-form.png`
- `assets/output-preview.png`
