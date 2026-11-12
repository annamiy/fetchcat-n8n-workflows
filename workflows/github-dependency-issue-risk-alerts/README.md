# Monitor dependency bug reports and alert on critical issues with Apify, OpenAI, Google Sheets and Slack

Every weekday, this n8n template checks the public GitHub repositories of the open-source libraries your product depends on. It picks the issues that are new or updated since the last run and scores each one for upgrade and production risk. Every scored issue goes to a Google Sheet, and only the high-risk ones go to Slack. It uses the [FetchCat GitHub Issues & Pull Requests Scraper](https://apify.com/fetch_cat/github-issues-pull-requests-scraper) (`fetch_cat/github-issues-pull-requests-scraper`) through the official Apify node. It watches repositories you do not own, so you do not need a GitHub login or token.

**Who it is for:** engineering leads and platform teams who want to see a regression, security report or breaking change in a dependency before it reaches their own users, without reading every issue tracker.

## What you get

- A Google Sheets log (tab `Dependency Issues`) with one row per issue: when it was scored, repository, number, title, URL, author, labels, comments, reactions, created and updated times, category, risk score (1 to 5), whether it affects upgrades, a one-line summary, and whether it was alerted.
- One Slack digest per run listing only issues at risk 4 or higher that have not been alerted before, grouped by repository. A quiet day posts nothing.

## How it works

1. **Trigger.** Run it by hand, or every weekday at 9:00 once you publish (activate) the workflow.
2. **Settings.** Node `1. Set your watched repositories` holds everything you edit. `Build One Actor Input per Repository` checks the values before any paid request and computes `since` as today minus `lookbackDays`.
3. **Fetch.** Node `2. Fetch Issues with Apify` runs the Actor once per repository, so a busy repository cannot use up the limit of a quiet one. Each run returns up to `maxIssuesPerRepository` issues updated since that date, most recently updated first. If one repository fails (for example a typo in its name), it is listed in the digest and the others continue.
4. **Pick.** `Read Logged Issues` reads your sheet. Issues already logged with the same `updatedAt` are skipped. New issues and issues with new activity are kept, up to `maxIssuesToScorePerRun`.
5. **AI score.** One `gpt-5.4-mini` call with a strict JSON schema scores every picked issue from its title, labels, comment and reaction counts and body excerpt. It returns category (`bug`, `regression`, `security`, `breaking-change`, `feature` or `question`), `riskScore` from 1 to 5, `affectsUpgrade` (`yes`/`no`) and a one-line summary. `Check Scores and Build Sheet Rows` validates the answer before anything is written.
6. **Deliver.** `4. Log Issues to Google Sheets` adds or updates rows matched on `url`. Then `Build High-Risk Slack Digest` collects issues at `alertMinRiskScore` or higher that were never alerted, and `5. Send High-Risk Slack Digest` posts one message.

## Setup (about 10 minutes)

1. Make a copy of the [sheet template](https://docs.google.com/spreadsheets/d/1ov__nbR6qFvboEp5nFwigh65Lt_aTFMtrT_TQJQmYzM/copy). Delete the two example rows.
2. Install the Apify node: on n8n Cloud, add the verified **Apify** node from the nodes panel; on self-hosted n8n, install `@apify/n8n-nodes-apify`. Connect your Apify account in node 2.
3. Connect OpenAI in node 3.
4. Connect Google Sheets in `Read Logged Issues` and in node 4, and pick your copy of the sheet in both. The `Dependency Issues` tab is preset (it is the first tab of the template). If you use your own spreadsheet, pick its tab in both nodes; it needs the same 16 headers in row 1.
5. Connect Slack in node 5 and pick a channel.
6. Put your dependencies in node 1 and click **Execute workflow**. Publish the workflow when you want the weekday schedule.

## Settings (node 1)

| Field | Default | Meaning |
| --- | --- | --- |
| `repositories` | `n8n-io/n8n, axios/axios, expressjs/express` | Comma-separated `owner/name` or GitHub URLs, 1 to 10. |
| `lookbackDays` | `7` | Only issues updated in this many days (1 to 90). |
| `state` | `open` | `open`, `closed` or `all`. |
| `includePullRequests` | `false` | Also score pull requests. Issues are always included. |
| `labels` | empty | Optional comma-separated label filter. Label names differ between repositories, so the default uses none and lets the AI score do the filtering. |
| `maxIssuesPerRepository` | `10` | Most recently updated issues per repository (1 to 50). |
| `maxIssuesToScorePerRun` | `30` | At most this many issues go to the AI per run; the rest wait for the next run. |
| `alertMinRiskScore` | `4` | Issues at this risk score or higher go to Slack, once each. |
| `maxCostUsdPerRepository` | `0.05` | Hard cap on the Apify charge for each repository run (0.01 to 0.50). |
| `githubToken` | empty | Optional. Only for large watchlists that hit GitHub's anonymous rate limits. Use a token without any scopes. |

## Cost

At the Actor's current Store price on the Apify Free plan, each repository run costs a USD 0.005 start fee plus about USD 0.00003 per issue. A default run (3 repositories, up to 10 issues each) costs about USD 0.02 on Apify, and `maxCostUsdPerRepository` caps each run. OpenAI is called once per run with up to 30 short issues (well under a cent with `gpt-5.4-mini`). When nothing is new, OpenAI is not called.

## Behavior and limits

- **Scores rest on metadata and an excerpt.** The Actor returns the first 1,000 characters of each issue body (the workflow sends 800 to the AI), not the comment thread. Treat the score as triage and read the issue before you act.
- The risk score is the model's judgement for a team that uses the library in production or is about to upgrade. Many comments and reactions push it up.
- Nothing new (no issues updated in the window, or every issue already logged unchanged): the run ends at `No New Issues - Nothing Written` with a readable message in the execution. Nothing is written.
- A bad OpenAI answer (no valid JSON, or no valid score for this run's issues) ends at `AI Answer Rejected - Nothing Written`. Issues the model skips are not written and are scored again next run.
- An issue is alerted in Slack once. If it gets new comments later, it is rescored and its row is updated, but it is not alerted again. An issue that rises to the threshold later is alerted then.
- Rows are written before the Slack message. If Slack fails, the rows are already marked `alerted = yes`; check the failed execution for the digest text.
- If every repository run fails (for example the Apify credential is missing), the run stops with the first error and writes nothing.
- Anonymous GitHub search allows a few requests per minute. Up to 10 repositories per run is fine. Add `githubToken` for more.

## Customization

- Watch your real dependencies: list them in `repositories` (up to 10).
- Fewer alerts: set `alertMinRiskScore` to 5. More context: set `includePullRequests` to `true` to also score fix pull requests.
- Weekly instead of daily: set `lookbackDays` to 7 and the schedule trigger to Mondays.
- Another destination: replace node 5 with Microsoft Teams, Discord or email; it receives one item with a `text` field.

## Requirements

- n8n 2.47.4 or newer (Cloud or self-hosted) with the Apify node `@apify/n8n-nodes-apify` 0.9.0 or newer.
- An Apify account, an OpenAI API key, Google Sheets and Slack.
