# Monitor App Store and Google Play Reviews with Apify, OpenAI, Google Sheets and Slack

This n8n template uses [fetch_cat/apple-app-store-reviews-scraper](https://apify.com/fetch_cat/apple-app-store-reviews-scraper) and [fetch_cat/google-play-reviews-scraper](https://apify.com/fetch_cat/google-play-reviews-scraper) to collect public data, keeps each run at 10 items or fewer by default, and delivers a readable Google Sheets record plus one Slack digest. It runs on n8n Cloud or self-hosted n8n using built-in nodes only.

## What it does

- Starts manually and on an editable schedule; imported schedules remain inactive until you publish the workflow.
- Validates user input before calling Apify and downloads only the completed Actor dataset.
- Normalizes stable source IDs and stores delivery state in the shared n8n Data Table ledger.
- Sends all unseen results through one strict `gpt-5.4-mini` batch, validates every returned key, and fails closed on malformed output.
- Writes results before sending one digest, then commits delivered keys only after both destinations succeed.
- Never contacts people, replies, posts content, changes prices, or takes marketplace actions.

## Setup

1. Import `workflow.json` into n8n.
2. Open `1. Configure This Workflow` and replace the example search values.
3. In Apify, create an API token. In n8n create **HTTP Header Auth** with header `Authorization` and value `Bearer YOUR_APIFY_TOKEN`, then select it in both Apify HTTP Request nodes.
4. Connect OpenAI in `3. Analyze Results in One Batch`.
5. Create or copy a Google Sheet with a `App reviews` tab and these headers: Observed at, Item, Source, Metric, Status, Insight, Recommended action, Link, Item key. Select it in the Google Sheets node.
6. Connect Slack and choose the destination channel or chat.
7. Run manually twice. Verify the first run delivers results and the second sends nothing for identical item states.
8. Publish the workflow only when you want the schedule to start.

## Configuration

All ordinary settings are in the numbered Set node. The default maximum is 10 Actor results per run. Increase cadence or result counts only after checking Apify, n8n, and OpenAI usage. Classify sentiment, bugs, feature requests, and urgency. Draft a factual response for human approval; never claim it was posted.

## Reliability and limitations

The workflow records an item only after required destinations succeed. Public fields vary by source, and absent metrics stay blank rather than being invented. A low result limit or infrequent schedule can miss items that fall outside the newest returned results. AI analysis is a research aid and should be reviewed by a person.

## QA

Test with isolated QA destinations and no more than three Apify-backed executions: happy path, duplicate rerun, and one empty or malformed-input path. Confirm no duplicate rows or alerts and inspect the execution data before enabling the schedule.
