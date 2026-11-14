# Shortlist Facebook groups for community research with Apify, OpenAI and Google Sheets

Turn a topic and location brief into an evidence-backed Facebook group review queue. Designed for community researchers who want to organize discovery before deciding where to investigate, not automate joining, outreach or post scraping.

**Development draft — not for submission. Public sheet copy link and real screenshots are pending credential restoration and independent QA.**

## How it works

Run manually to discover up to ten indexed groups with Apify. Canonical group URLs prevent duplicates, while query provenance and source snippets stay in the evidence ledger. One bounded OpenAI assessment labels topic fit and flags insufficient evidence for review. Only allowlisted groups with literal supporting quotes qualify for the generated top-five shortlist.

Google Sheets upserts each group by URL, without overwriting your Review Status or Reviewer Notes. Every successful assessment replaces the machine-owned Shortlist, which may legitimately be empty. Empty discovery or malformed AI output produces a readable execution result without sheet changes. Indexed results can be stale, and a location search term never verifies a group's location, activity or permission to participate.

## Setup

Allow about ten minutes. Make a copy of the sheet template (**link pending credential repair**), keeping the Groups and Shortlist tabs and headers unchanged. Import the workflow, connect Apify, OpenAI and Google Sheets, then enter your copy's spreadsheet ID in node 1. Use the gardening/London example or change the topic and research brief there. Execute manually and review the evidence. Leave the workflow inactive; there is no schedule.

## Requirements

- n8n 2.47.4 or newer and official Apify node 0.9.0.
- An Apify account, an OpenAI account with gpt-5.4-mini access and Google Sheets OAuth.
- One Actor run capped at $0.05 and one model call per non-empty execution. The bounded model estimate is below $0.02 at pricing checked on 14 November 2026; check current pricing before use. Other platform fees may apply.
- No Facebook login, cookies, supplied group URLs or external webhook.

## Customization

Edit only node 1 to change the topic, location, research brief and result limit (one to ten). Adjust the Apify cap only within the workflow's $0.05 maximum. Human review lives in the sheet, not Code nodes. Keep the match key intact, avoid overlapping runs and review failed executions before a manual retry. Topic relevance is a research lead, never a verified audience, active community or permission to join, post or message.
