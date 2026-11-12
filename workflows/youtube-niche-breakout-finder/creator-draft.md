Find the recently uploaded YouTube videos in your niche that are getting unusually many views, every week, without a YouTube Data API key. This template searches YouTube with the FetchCat YouTube Search Results Scraper on Apify. It scores each video by views per day against other new videos on the same search, logs the breakouts to Google Sheets and posts one Slack digest grouped into topic angles by OpenAI.

## How it works

1. A manual run or a weekly schedule (Monday 9:00) reads your search phrases and thresholds from one settings node.
2. The Apify node runs `fetch_cat/youtube-search-results-scraper` for all phrases: videos only, sorted by views, uploaded in the last week (or day, month or year).
3. A Code node computes views per day for every video and divides it by the median views per day of the same search. Videos at 2x or more with at least 1,000 views are breakouts. Shorts, live streams and searches with fewer than 4 dated videos are left out.
4. Videos already in your Google Sheet are skipped, so each breakout is reported once.
5. One `gpt-5.4-mini` call with a strict JSON schema groups the new breakouts into 3 to 5 topic angles, with one sentence on why each angle works. The answer is validated before anything is written.
6. Google Sheets gets one row per video (matched on Video ID), and Slack gets one digest.

## Setup

1. Make a copy of the [sheet template](https://docs.google.com/spreadsheets/d/12LEiHbvHoBa-dD7T63LOFe3aBadYyw7fdUGT1OFvG-0/copy).
2. Add the Apify node (verified node on n8n Cloud, `@apify/n8n-nodes-apify` on self-hosted) and connect your Apify account.
3. Connect OpenAI, Google Sheets (in both Sheets nodes, pick your copy) and Slack (pick a channel).
4. Edit `1. Set your niche searches` and run once by hand. Publish the workflow to turn on the weekly schedule.

Setup takes about 10 minutes. A default run (3 searches, 10 videos each) costs about USD 0.01 on Apify plus one small OpenAI call, and `maxCostUsd` caps the Apify spend.

## Requirements

- n8n 2.47.4 or newer with the Apify node
- Apify account
- OpenAI API key
- Google Sheets and Slack accounts

## Customization

- Change the phrases, country, upload window, ratio and view thresholds in the settings node.
- Raise `minBreakoutRatio` for fewer, stronger alerts, or set the upload window to `month` for monthly scouting.
- Swap Slack for Teams, Discord or email: the digest is one item with a `text` field.
- The ratio compares videos within the same search, not against channel size, because search results carry no subscriber counts.
