---
name: n8n-workflow-builder
description: Build a GO-approved FetchCat n8n template on the official Apify node in the public workflow repository and the private n8n instance. Use for the workflow branch, workflow.json, sticky notes, sheet template, fixtures, documentation, validation, inactive import and same-issue handoff to QA.
---

# n8n Workflow Builder

Read `PIPELINE.md` first. Build only after the same issue has an Idea
Researcher `Decision: GO` with slug, title and use case.

## Boundaries

- Work in a worktree:
  `git -C /data/projects/fetchcat-n8n-workflows fetch origin && git -C /data/projects/fetchcat-n8n-workflows worktree add /data/projects/fetchcat-n8n-workflows-wt/<slug> -b workflow/<slug> origin/main`.
- Never touch Actor checkouts, `actors.db` or Store surfaces. Never activate a
  workflow or schedule in the private instance.
- Never put credentials, credential IDs, tokens, chat/sheet/page IDs, emails,
  personal data or pinned data in Git. The one exception is the public sheet
  template's `copyUrl`, which the validator requires in the README and the
  yellow note.
- Never create an agent, routine, project or another issue.

## Build

1. **Graph.** Use the Apify node (`@apify/n8n-nodes-apify.apify`, typeVersion
   2, "Run actor and get dataset", `actorInputMode: json`) from `PIPELINE.md`.
   Do not use HTTP Request to call Apify. Set `maxTotalChargeUsd` from the
   settings node (default at most USD 0.50) and keep default result limits small.
2. **Settings.** Put every value a user edits in one Set node named
   `1. Set your <thing>`: search terms, limits, max cost, schedule notes.
   Users must never edit Code nodes.
3. **Flow.** Trigger (manual plus an inactive schedule) → settings → Apify →
   normalize → (optional AI) → dedupe or upsert → destination. Make reruns
   safe: an upsert key for Sheets, or a Data Table ledger written only after
   delivery succeeds. Empty results and malformed AI output must end cleanly
   with no destination writes and a readable message. Do not use Data Table
   nodes in new templates: n8n blocks them in CLI runs, and QA's paid runs must
   go through the spend guard from the CLI. Dedupe through the destination
   instead, for example a Sheets `appendOrUpdate` key, a Notion lookup before
   create, or a sent-items tab.
4. **AI.** One batched call where possible, model `gpt-5.4-mini`, structured
   JSON output validated before any write.
5. **Sticky notes** (n8n rejects most templates for these):
   - one yellow note (`color: 1`) at the top left, 100–300 words, with
     `### How it works` and `### Setup`, including setup time and cost;
   - white notes (`color: 7`) starting with `## `, each under 50 words,
     around each logical group, so every node sits inside exactly one;
   - descriptive node names, no "HTTP Request1".
6. **Sheet template** (Sheets destinations): write
   `assets/sheet-template.json` in the FetchCat house style. The reference is
   "TikTok Profiles to Google Sheets - n8n Template"; follow
   `workflows/youtube-niche-breakout-finder/assets/sheet-template.json`:
   - title `<Name> - n8n Template`;
   - `startHere`: heading, subtitle, `whatItDoes`, a numbered `checklist`
     (copy the sheet, connect Sheets and pick the copy in each Sheets node, keep
     the tab and row-1 headers, connect the other apps and run once, publish),
     `links` with the Actor's apify.com/fetch_cat page, optional
     `columnGuide`, and `dataNote` about the example rows;
   - readable headers ("Updated at", "Video title"), never code keys;
   - `columns` with a width per column, `format` (integer, decimal, ratio,
     percent), `wrap` for long text, `link` labels for URL columns that are not
     a match key, and `highlight` rules (scale, risk, yesno, equals).

   Then run
   `set -a; . /data/paperclip/bootstrap-secrets/n8n-destinations.env; set +a; node scripts/sheet-template.mjs <slug>`.
   It creates the sheet in the FetchCat Drive (fetchcat@nosova.me, folder
   N8N > PUBLIC) and makes it viewable by link. Put the printed `copyUrl` in
   the yellow note's Setup, the README and `creator-draft.md`, as "Make a copy
   of the [sheet template](copyUrl)". A rerun reuses the sheet and reapplies
   the style. QA adds the real example rows later.
7. **Files:** `workflow.json` (inactive, `minimumN8nVersion` `2.47.4` and
   `apifyNodeVersion` `0.9.0` in metadata), `metadata.json` (`releaseState:
   development`), `README.md` (setup, behavior, cost, limits), `creator-draft.md`
   (the n8n.io description: a short intro, `## How it works`,
   `## Setup`, `## Requirements`, `## Customization`; no images, since the
   portal strips them), `fixtures/input.json`, `fixtures/expected-output.json`,
   and `assets/workflow-overview.png` and `assets/output-preview.png` (from
   the editor and the QA sheet, with no real identifiers).
8. **Checks:** `npm run validate`, then `npm run import -- <slug>` (it stays
   inactive). Attach the `FetchCat QA - *` credentials only in the instance
   copy. Run one credential-free execution to confirm the error is readable.
   Then export and sanitize once (`npm run export -- <slug>`) and confirm
   nothing drifted.
9. Commit explicit paths, push `workflow/<slug>`, and open a PR to `main`. Do
   not merge it.

## Handoff

Comment, then hand the same issue to QA with `handoffIssue`:

```text
Builder handoff: READY FOR QA
Slug: <slug>
Branch: workflow/<slug>
Commit: <full sha>
PR: <url>
Workflow title: <exact title>
Sheet template: <copyUrl or none>
Static validation: PASS
Import inactive: PASS
Credential-negative test: PASS
Assertions: <happy, duplicate, empty/error, credential>
Known limitations: <list or none>
```
