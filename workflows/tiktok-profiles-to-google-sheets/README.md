# Export TikTok Profiles to Google Sheets with Apify

Runs daily at 09:00 or manually with the [FetchCat TikTok Profile Scraper](https://apify.com/fetch_cat/tiktok-profile-scraper)
(`fetch_cat/tiktok-profile-scraper`) for a pasted list of public TikTok handles
or profile URLs and maintains one current, sortable Google Sheets row per
creator. Rerunning the workflow updates matching handles instead of adding
duplicates.

The workflow works on n8n Cloud or self-hosted n8n, uses built-in HTTP Request
and Google Sheets nodes, and does not require OpenAI or an n8n community node.

## Setup

1. Create a Google Sheet tab named `TikTok Profiles` with this header row:

```text
Updated at | Profile | TikTok handle | Name | Bio | Followers | Following | Total likes | Videos | Likes per video | Follower/following ratio | Verified | Private account | Region | Language | Bio link | Commerce account | TikTok seller | Live now | User ID
```

2. Import `workflow.json` into n8n.
3. Open `1. Enter TikTok Profiles` and paste handles or full profile URLs into
   `profiles`, separated by commas or new lines. The included examples are
   `tiktok` and `apify`.
4. Set `maxProfiles` from 1 through 500. The default public template uses 25.
5. Create an HTTP Header Auth credential with header `Authorization` and value
   `Bearer YOUR_APIFY_TOKEN`. Select it in both FetchCat HTTP Request nodes.
6. Connect Google Sheets in `3. Save Profiles to Google Sheets`, then select the
   spreadsheet and `TikTok Profiles` tab.
7. Run the workflow manually and format `Updated at` as a Google Sheets date and
   time column. Publish the workflow only after the test succeeds to enable its
   daily 09:00 schedule.

Positive states are self-describing: `☑ Verified`, `☑ Private account`,
`☑ Commerce account`, `☑ TikTok seller`, or `☑ Live now`. Negative states are
written as `✕ No`. Optional Google Sheets conditional formatting can display
positive states with a pale green fill and No with a quiet light gray fill.
Format `User ID` as plain text so long numeric IDs remain consistently aligned.

## Output

Each row contains a clickable profile link, handle, display name, bio, follower
and following counts, total likes, video count, lifetime likes per video,
follower/following ratio, verification, privacy, region/language when exposed,
bio link, commerce and seller signals, live status, and TikTok user ID.

The workflow uses `TikTok handle` as the update key. Input handles are
case-insensitively deduplicated before the Actor starts, and profile URLs are
normalized to handles.

Recent-video summaries are disabled. TikTok does not expose them consistently,
and a profile-export workflow should not imply that they are dependable.

## Cost Guidance

At the current Free-tier Actor price, one run costs USD 0.005 plus approximately
USD 0.00010408 per saved profile. A 25-profile export is about USD 0.0076 and a
500-profile export is about USD 0.057, excluding n8n hosting. Check the Actor
page for current pricing before running large batches.

## QA

Use at most three Actor-backed executions and ten profiles per QA execution.
Confirm that handles and URLs are deduplicated, dates and links are readable,
and a second run updates existing rows without creating duplicate handles.

Synthetic Actor-shaped input and expected assertions are under `fixtures/`.
They contain no real personal data.
