Catch regressions, security reports and breaking changes in the open-source libraries you depend on before they reach your users. Each weekday this template fetches new and updated issues from the GitHub repositories you list, using the FetchCat GitHub Issues & Pull Requests Scraper on Apify. No GitHub login is needed. One OpenAI call scores each issue for upgrade and production risk, every issue is logged to Google Sheets, and only the high-risk ones are posted to Slack.

## How it works

1. A manual run or a weekday schedule (9:00) reads your repositories, lookback window and limits from one settings node.
2. The Apify node runs `fetch_cat/github-issues-pull-requests-scraper` once per repository and returns the issues updated in the last 7 days, most recent first. One failed repository is reported and the others continue.
3. Issues already in your Google Sheet with no new activity are skipped, so nothing is scored twice.
4. One `gpt-5.4-mini` call with a strict JSON schema returns, for each issue, a category (bug, regression, security, breaking change, feature or question), a risk score from 1 to 5, whether it affects upgrades and a one-line summary. The answer is validated before anything is written.
5. Google Sheets gets one row per issue (matched on URL). Issues at risk 4 or higher go to one Slack digest, once each. A quiet day posts nothing.

## Setup

1. Make a copy of the [sheet template](https://docs.google.com/spreadsheets/d/1ov__nbR6qFvboEp5nFwigh65Lt_aTFMtrT_TQJQmYzM/copy).
2. Add the Apify node (verified node on n8n Cloud, `@apify/n8n-nodes-apify` on self-hosted) and connect your Apify account.
3. Connect OpenAI, Google Sheets (pick your copy in both Sheets nodes) and Slack (pick a channel).
4. List your dependencies in `1. Set your watched repositories` and run once by hand. Publish the workflow to turn on the weekday schedule.

Setup takes about 10 minutes. A default run (3 repositories, up to 10 issues each) costs about USD 0.02 on Apify plus one small OpenAI call, and `maxCostUsdPerRepository` caps each Apify run.

## Requirements

- n8n 2.47.4 or newer with the Apify node
- Apify account
- OpenAI API key
- Google Sheets and Slack accounts

## Customization

- Change the repositories, lookback window, state, labels and limits in the settings node.
- Raise `alertMinRiskScore` to 5 for only the most severe items, or set `includePullRequests` to true to score fix pull requests too.
- Swap Slack for Teams, Discord or email: the digest is one item with a `text` field.
- Scores use the title, labels, comment and reaction counts and the first part of the issue body, not the full thread, so read the issue before acting.
