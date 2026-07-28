# Creator draft: Telegram Competitor Intelligence Digest

## Title
Telegram Competitor Intelligence Digest

## Short description
Daily Slack brief of competitor launches, promotions, positioning shifts, topics, and high-performing public Telegram posts, powered by FetchCat, OpenAI, and a durable n8n Data Table ledger.

## Long description
This inactive n8n workflow monitors public Telegram channels with `fetch_cat/telegram-channel-posts-scraper`, deduplicates posts before any AI or delivery step, asks OpenAI for one evidence-bound batch analysis, and sends one Slack digest only when new material signals are found.

Use it for marketing, product, and founder teams that want a daily competitor-intelligence brief without reading every channel manually. The workflow preserves post URLs, timestamps, text snippets, views, reactions, replies, links, and hashtags so every AI conclusion can be traced back to source evidence.

## Integrations
- Apify
- OpenAI
- Slack
- n8n Data Tables

## Setup notes
1. Add Apify, OpenAI, and Slack credentials in n8n.
2. Open the setup form and save 1-10 public Telegram channel usernames or `t.me` URLs.
3. Add product or market context, minimum signal score, max posts per run, and Slack channel.
4. Keep QA runs capped at 10 Actor items and one AI request.
5. Activate only after QA approval.

## Safety notes
Duplicate and empty runs send no Slack message. The Data Table ledger is committed only after Slack delivery succeeds. Malformed AI JSON or citations outside supplied post URLs stop the workflow before delivery.
