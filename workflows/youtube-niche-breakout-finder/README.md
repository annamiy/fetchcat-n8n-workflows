# Find breakout YouTube videos in your niche weekly with Apify, OpenAI, Google Sheets and Slack

Every week, this n8n template finds recently uploaded YouTube videos in your niche that are getting far more views than other new videos on the same search. It groups them into topic angles you can act on. It uses the [FetchCat YouTube Search Results Scraper](https://apify.com/fetch_cat/youtube-search-results-scraper) (`fetch_cat/youtube-search-results-scraper`) through the official Apify node, so you do not need a YouTube Data API key or quota.

**Who it is for:** creators and content marketing teams who want a short weekly list of what is breaking out in their niche, with the numbers behind each video.

## What you get

- A Google Sheets log (tab `Breakouts`) with one row per breakout video: observed time, search, rank, title, channel, upload age, views, views per day, breakout ratio, duration, topic angle, URL and video ID.
- One Slack digest per run, with the videos grouped under 3 to 5 topic angles and one sentence on why each angle is working.

## How it works

1. **Trigger.** Run it by hand, or every Monday at 9:00 once you publish (activate) the workflow.
2. **Settings.** Node `1. Set your niche searches` holds everything you edit. `Build Actor Input from Settings` checks the values before any paid request.
3. **Search.** Node `2. Search YouTube with Apify` runs the Actor once for all phrases: videos only, sorted by view count, uploaded in the chosen window, English interface.
4. **Score.** For each video: `views per day = views / days since upload` (videos younger than one day count as one day). The breakout ratio is that number divided by the median views per day of all scored videos from the same search. A video is a breakout when the ratio is at least `minBreakoutRatio` (default 2) and it has at least `minViews` (default 1,000) views. If one video breaks out on two searches, it is kept once, under the stronger one.
5. **Dedupe.** `Read Logged Video IDs` reads the Video ID column of your sheet. Videos already logged are not sent again.
6. **AI angles.** One `gpt-5.4-mini` call with a strict JSON schema groups the new breakouts into topic angles. `Check Angles and Build Sheet Rows` validates the answer; video IDs the model invents are ignored.
7. **Deliver.** `4. Log Breakouts to Google Sheets` adds or updates rows matched on Video ID, then `5. Send Weekly Slack Digest` posts one message.

## Setup (about 10 minutes)

1. Make a copy of the [sheet template](https://docs.google.com/spreadsheets/d/123c00awCl-gT_8a2Y954O1woQCZAG28HG9tUOC04Prw/copy). Delete the two example rows if you like.
2. Install the Apify node: on n8n Cloud, add the verified **Apify** node from the nodes panel; on self-hosted n8n, install `@apify/n8n-nodes-apify`. Connect your Apify account in node 2.
3. Connect OpenAI in node 3.
4. Connect Google Sheets in `Read Logged Video IDs` and in node 4, and pick your copy of the sheet in both. The `Breakouts` tab is preset (it is the first tab of the template). If you use your own spreadsheet instead, pick its tab in both nodes; it needs the same 14 headers in row 1.
5. Connect Slack in node 5 and pick a channel.
6. Edit node 1 and click **Execute workflow**. Publish the workflow when you want the weekly schedule.

## Settings (node 1)

| Field | Default | Meaning |
| --- | --- | --- |
| `searchQueries` | `ai automation tools, n8n tutorial, no code saas` | Comma-separated search phrases, 1 to 10. |
| `country` | `US` | Two-letter country code for YouTube results. |
| `uploadDate` | `week` | Upload window: `today`, `week`, `month` or `year`. |
| `maxResultsPerQuery` | `10` | Videos per search (4 to 50). |
| `minBreakoutRatio` | `2` | Minimum views-per-day ratio against the search median. |
| `minViews` | `1000` | Minimum total views for a breakout. |
| `minVideosPerQuery` | `4` | Searches with fewer scorable videos are skipped, because their median is not reliable. |
| `maxBreakoutsPerRun` | `15` | At most this many new videos per run (the strongest first); the rest wait for the next run. |
| `maxCostUsd` | `0.10` | Hard cap on the Apify charge for one run (at most 0.50). |

## Cost

A default run fetches about 30 videos. At the Actor's current Store price that is about USD 0.01 per run on the Apify Free plan (a USD 0.005 start fee plus a small per-result fee), and `maxCostUsd` caps it. OpenAI is called once per run with a short prompt (a fraction of a cent with `gpt-5.4-mini`). When nothing new breaks out, OpenAI is not called.

## Behavior and limits

- **The ratio compares videos within one search, not against channel size.** YouTube search results carry no subscriber count, so a breakout means "far more views per day than other recent videos on this search", not "more than this channel usually gets".
- The search is sorted by views, so the median comes from the most-viewed recent videos. A ratio of 2 therefore marks videos that stand out even among popular uploads.
- Upload ages come from YouTube's relative text (for example `6d ago`, `15h ago`, `3 weeks ago`). The Actor requests the English interface so this text can be read. Shorts, live streams, upcoming premieres and videos without a readable age are not scored; the digest counts them.
- Ages are rounded by YouTube (`2d ago` can mean 48 to 71 hours), so treat views per day as an estimate.
- Nothing new (empty Actor result, nothing above the thresholds, or everything already logged): the run ends at `No New Breakouts - Nothing Written` with a readable message in the execution. Nothing is written.
- A bad OpenAI answer (no valid JSON, or no angle that refers to this run's videos) ends at `AI Answer Rejected - Nothing Written`. Run it again.
- Rows are written before the Slack message. If Slack fails, the rows are already in the sheet and the next run will not repeat those videos; check the failed execution for the digest text.
- Reruns are safe: rows are matched on Video ID, and videos already in the sheet are skipped before the AI call.

## Customization

- Track several niches: put up to 10 phrases in `searchQueries`.
- Monthly scouting: set `uploadDate` to `month` and the schedule to monthly.
- Stricter alerts: raise `minBreakoutRatio` to 3 or `minViews` to 10,000.
- Another destination: replace node 5 with Microsoft Teams, Discord or email; it receives one item with a `text` field.

## Requirements

- n8n 2.47.4 or newer (Cloud or self-hosted) with the Apify node `@apify/n8n-nodes-apify` 0.9.0 or newer.
- An Apify account, an OpenAI API key, Google Sheets and Slack.
