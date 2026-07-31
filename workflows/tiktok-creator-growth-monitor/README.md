# Monitor TikTok Creator Growth with Apify, Google Sheets and Telegram

Monitors a reusable TikTok creator or competitor watchlist with the
[FetchCat TikTok Profile Scraper](https://apify.com/fetch_cat/tiktok-profile-scraper)
(`fetch_cat/tiktok-profile-scraper`). It compares current profile totals with
the last successful snapshot, appends historical rows, updates a current table,
and sends a readable Telegram baseline or meaningful-change digest.

The workflow runs every Monday at 09:00 by default and also includes a manual
trigger. It works on n8n Cloud or self-hosted n8n and does not use OpenAI.

## Spreadsheet Setup

Create one spreadsheet with three tabs.

Format `Updated at` and `Snapshot at` as date-time columns. Use `Active` or
`Paused` in the watchlist control column. `Verified` is written as `✓ Yes` or
`✕ No`; optional conditional formatting can color these green and red.
Snapshot keys are written as readable values such as
`@apify | 2026-07-31 09:46:23 UTC`.

### Creators

```text
Active | TikTok handle or URL | Label | Minimum followers | Maximum followers | Alert growth % | Alert follower gain
```

Example rows:

```text
Active | tiktok | Brand account | 0 | 1000000000 | 5 | 1000
Active | https://www.tiktok.com/@apify | Technology | 1000 | 500000 | 5 | 500
```

Blank `Active` values are treated as active. Use `Paused` to skip a row.
`FALSE`, `No`, `0`, and `inactive` also remain supported. Qualification is deterministic: a creator is
`Qualified`, `Below minimum`, `Above maximum`, or `Needs review`.

### Current Profiles

```text
Updated at | Label | Profile | TikTok handle | Name | Bio | Followers | Follower change | Follower growth % | Following | Total likes | Total likes change | Videos | Video count change | Likes per video | Verified | Region | Language | Bio link | Qualification | Change status
```

### Snapshot History

```text
Snapshot key | Snapshot at | Label | Profile | TikTok handle | Name | Followers | Follower change | Follower growth % | Total likes | Total likes change | Videos | Video count change | Qualification | Change status
```

## n8n Setup

1. Import `workflow.json`.
2. Connect the same Google Sheets credential and spreadsheet in all four Sheets
   nodes, selecting the tab named by each node.
3. Create an HTTP Header Auth credential with header `Authorization` and value
   `Bearer YOUR_APIFY_TOKEN`. Select it in both FetchCat request nodes.
4. Create a Telegram bot with `@BotFather`, send `/newbot`, and follow the
   prompts. Add the bot to the destination group or start a private chat, send
   one message, and obtain the chat ID from a temporary Telegram Trigger or
   Telegram's `getUpdates` response.
5. Connect the Telegram credential and chat ID in
   `3. Send Creator Changes to Telegram`.
6. Run manually. The first run sends a clearly labelled baseline and populates
   both output tabs.
7. Run again to verify that unchanged profiles are recorded without producing
   another Telegram alert. Publish the workflow when ready to enable Mondays.

## Alert Logic

An alert is sent when a creator has no previous snapshot, reaches the configured
follower gain or percentage threshold, declines by at least the percentage
threshold, or changes qualification. Quiet runs still append history and update
current metrics.

The Telegram digest includes clickable profiles, labels, follower totals and
changes, growth percentages, video-count changes, qualification, and a plain
English change status. It contains at most ten creators and points to Google
Sheets when more profiles changed.

Recent-video alerts are intentionally excluded because TikTok does not expose
recent videos consistently through public profile responses. `Total likes` and
`Likes per video` are profile-level totals, not a claim about audience quality
or a true recent-post engagement rate.

## Cost Guidance

At the current Free-tier Actor price, monitoring 50 profiles costs about USD
0.0102 per run, approximately USD 0.044 per average month when run weekly or
USD 0.31 per 30-day month when run daily. This excludes n8n hosting. Check the
Actor page for current pricing before increasing frequency or list size.

## QA

Use at most three Actor-backed executions and ten profiles per QA execution.
Test a baseline, an unchanged rerun, and a synthetic or naturally changed
profile. Confirm that Telegram succeeds before the current-state table is
updated on alerting runs and that dates, deltas, labels, and links are readable.
