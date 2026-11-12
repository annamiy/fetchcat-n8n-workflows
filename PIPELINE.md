# n8n template pipeline

How FetchCat n8n templates go from "which Actor?" to a published n8n.io
template. Each template has one Paperclip issue in the `Internal workflows`
project. The existing agents move that issue from step to step. Only Anna
submits to n8n.io until an agent has a signed-in n8n.io creator session.

| Step | Owner | Skill | Output on the same issue |
| --- | --- | --- | --- |
| 1. Pick an Actor | routine `n8n template feeder (script)` | `_scripts/n8n-template-feeder.mjs` in apify-workspace | New issue with the candidate Actor, demand evidence and marker `[marker:n8n-template-pipeline/v1]` |
| 2. Research | Idea Researcher | `n8n-workflow-idea-research` | `Decision: GO` (slug, use case, title, destinations) or `DROP` |
| 3. Build | Developer | `n8n-workflow-builder` | Branch `workflow/<slug>`, sheet template, `Builder handoff: READY FOR QA` |
| 4. QA | QA | `n8n-workflow-qa` | `QA verdict: PASS` for the exact commit, or failures back to Developer |
| 5. Merge and submit | Publisher | `n8n-workflow-publisher` | Merged PR, submission package, n8n.io submission (or an `operator-action` card for Anna), release state `creator-submitted` |

## Limits

- **n8n.io:** at most 4 of our templates in review at once (verified-creator
  limit). Review takes about a week. No weekly quota.
- **Feeder:** opens at most one issue per run, only while fewer than
  `maxOpenTickets` (default 2) pipeline issues are open and fewer than 4
  submissions from the last 14 days are waiting for review. An Actor that got a
  pipeline issue in the last 60 days, open or closed, is skipped.
- **Spend:** at most 3 Apify-backed executions per template. Each run goes through
  `apify-guarded-command.mjs --scope task-qa` from the CLI, and a re-QA after a
  fix adds `--additional-verification`. The Apify node caps cost with
  `maxTotalChargeUsd`. New templates use no Data Table nodes.
- **No near-duplicates:** n8n rejects batches of near-identical workflows. Each
  template needs its own use case, logic and output. Swapping the Actor or app
  in an existing shape is not a new template.

## Shared facts

- Never edit a pipeline issue's description: its `Actor:` line and marker are
  how the feeder counts and dedupes issues. Comments carry the work.
- Repository checkout on the VPS: `/data/projects/fetchcat-n8n-workflows`
  (`N8N_REPOSITORY_PATH`). Work in a Git worktree per slug under
  `/data/projects/fetchcat-n8n-workflows-wt/<slug>`, never on the shared checkout.
- Private instance: `https://n8n.nosova.me`. From the VPS, the editor opens
  without the basic-auth layer; the public API needs `N8N_API_KEY`. Load
  `/data/paperclip/bootstrap-secrets/n8n-api.env` and `n8n-destinations.env`
  (`set -a; . FILE; set +a`). Never print the values.
- The QA credentials in the instance are named `FetchCat QA - <service>`.
  `N8N_APIFY_CREDENTIAL_ID` and `N8N_SHEETS_CREDENTIAL_ID` are in
  `n8n-destinations.env`.
- Agents have no Docker access to fetchcat-n8n. The n8n CLI runs only through the
  root-owned wrapper `sudo -n /usr/local/sbin/fetchcat-n8n-cli list|list-credentials|import|export|execute`
  (`import` reads JSON on stdin, `export` writes it to stdout). CLI executions
  need a separate runner port while n8n runs (the wrapper defaults to 5680):
  `sudo -n /usr/local/sbin/fetchcat-n8n-cli execute --id=ID`
  (`npm run execute -- <slug>` does this).
- Pinned versions: n8n `2.47.4`, `@apify/n8n-nodes-apify` `0.9.0`.

## Apify node reference (0.9.0, typeVersion 2)

Tested on 12 Nov 2026 against `fetch_cat/github-repositories-search-scraper`:

```json
{
  "type": "@apify/n8n-nodes-apify.apify",
  "typeVersion": 2,
  "parameters": {
    "resource": "Actors",
    "operation": "Run actor and get dataset",
    "actorSource": "store",
    "actorId": { "__rl": true, "mode": "id", "value": "<ACTOR_ID>" },
    "actorInputMode": "json",
    "customBody": "={{ JSON.stringify({ queries: [$json.query], maxResults: $json.maxResults }) }}",
    "maxTotalChargeUsd": "={{ $('1. Set your search').first().json.maxCostUsd }}",
    "authentication": "apifyApi"
  }
}
```

Public templates carry no `credentials` block. Users install the verified
Apify node from the nodes panel on n8n Cloud, or `@apify/n8n-nodes-apify` on
self-hosted n8n.

## Spreadsheet templates

A template that writes to Google Sheets ships `assets/sheet-template.json`
(title, tabs, headers, at most 5 synthetic example rows, no emails or real
data). `node scripts/sheet-template.mjs <slug>` creates the sheet in the Drive
folder "FetchCat n8n templates", shares it as "anyone with the link can view",
and prints `url` and `copyUrl`. A rerun reuses the same sheet. The overview
sticky note and README link `copyUrl` ("Make a copy of the sheet template").

## Release states

`development` → `qa-passed` → `creator-submitted` (with `submittedAt`) →
`creator-public` (with `creatorTemplateId`). A state records what happened. It
is never a request to publish.
