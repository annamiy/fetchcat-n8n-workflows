# Reddit Buying-Intent Alerts

Runs `fetch_cat/reddit-scraper` for a configurable search and optional
subreddit, checks a durable delivery ledger, classifies all new posts in one
strict structured AI call, and sends one Telegram digest containing
at most five qualified posts.

The workflow has a manual trigger and a two-hour schedule. It monitors only: it
never comments, replies, messages authors, or performs outreach.

## Setup

1. Install `@apify/n8n-nodes-apify@0.6.10` and import `workflow.json`.
2. Add Apify and OpenAI credentials to the processing nodes.
3. Create a Telegram group, add a dedicated bot, and
   connect the bot credential in n8n.
4. Select that group's chat ID in `Send Telegram Digest`.
5. Run `Reddit Setup Form` once and save the search and product context. The
   workflow creates both required Data Tables automatically. If the form is
   skipped, the first normal run creates safe defaults.
6. Optionally import `../shared-error-notifications/workflow.json` and select it as this
   workflow's error workflow. Keep the schedule unpublished until QA passes.

The generated `FetchCat Reddit Config` row can also be edited directly in n8n
Data Tables. Start with global relevance search unless a specific subreddit is
known to return useful results.

## Behavior

```mermaid
flowchart LR
  T[Manual or two-hour trigger] --> I[Create or reuse tables]
  I --> A[Run Reddit Actor]
  A --> D[Keep IDs absent from delivery ledger]
  D --> O[One strict AI batch classification]
  O --> F[Validate and filter]
  F --> G[Send one Telegram digest]
  G --> L[Commit evaluated IDs to ledger]
```

- Actor search sort and time window are configurable; defaults are global
  relevance over the past week, with comments disabled.
- No more than 10 posts reach one OpenAI batch request.
- Batch validation fails closed unless every input Reddit ID has exactly one
  result and there are no extras.
- Only `high` or `medium` buying intent above the threshold can pass.
- IDs are committed only after Telegram succeeds, so destination failures stay
  retryable.
- Alerts include subreddit, post age, Reddit score, comment count, summary,
  qualification reason, and a direct post link.
- Duplicate, empty, and below-threshold runs send no Telegram message.

## QA

Use no more than three Apify-backed runs: a happy path, an immediate duplicate
rerun, and a negative/empty query. Confirm the happy path sends at most one
message with five posts, and the duplicate and negative paths send nothing.
Then export, sanitize, reimport, and execute the sanitized workflow.

The fixtures are synthetic and do not represent real Reddit users or posts.
