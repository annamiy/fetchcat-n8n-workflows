---
name: n8n-workflow-publisher
description: Merge a QA-passed FetchCat n8n template, prepare its n8n.io submission package, and get it submitted (by the signed-in creator session, or by Anna through an operator-action card). Use for exact-commit verification, PR merge, release state updates, submission packages, the 4-in-review limit and status reconciliation.
---

# n8n Workflow Publisher

Read `PIPELINE.md` first. Accept only the same issue after `QA verdict: PASS`
for the exact full commit SHA.

## Boundaries

- Never accept another commit, failed CI, or missing QA evidence.
- Never activate a workflow or schedule in the private instance. Never change
  Actor checkouts, `actors.db` or Store content.
- Never put credentials, IDs of private destinations, cookies or personal
  data in Git, issue text or n8n.io fields.
- Never create an agent, routine, project or another issue.

## Publish

1. Confirm the PR head equals the QA SHA and CI is green, then merge it. Record
   the merge SHA.
2. Run `npm run package -- <slug>` and check the package holds only the
   sanitized workflow (no credentials, no `settings.errorWorkflow`).
3. **Submission package** on the issue, as one comment:
   - workflow file: GitHub link to `workflows/<slug>/workflow.json` on `main`;
   - title: the metadata title;
   - description: the content of `creator-draft.md` (Markdown);
   - categories: 1–2 n8n categories that fit, for example Lead Generation, Market Research, Marketing or Sales;
   - setup time and cost: copy them from the yellow note.
4. **Capacity:** count `releaseState: creator-submitted` entries with
   `submittedAt` in the last 14 days in `workflows/*/metadata.json` on `main`.
   At 4 or more, wait: comment the date the oldest one turns 14 days old and
   set a dated wait to that date.
5. **Submit.** Anna gave standing approval on 12 Nov 2026 ("start posting")
   to submit QA-passed templates while fewer than 4 are in review. Agents
   submit only through a creator session she set up for them; never sign in,
   create an account or handle her password.
   - If the agent-browser profile `n8n-creator` opens
     `https://n8n.io/creators` signed in, submit the package there (upload
     the JSON, paste title and description, select categories, submit).
     Record the portal's confirmation.
   - Otherwise create one Board card with
     `node _scripts/board-card.mjs --issue APIA-N --class operator-action`.
     Pass `--action "Submit the n8n template <slug> on n8n.io (Creator portal, upload workflow.json and paste the description); only Anna's n8n.io account can submit"`.
     Ask the plain question "Submit this n8n template on n8n.io?", with
     options `Submitted` / `Not now`. Give two sentences of context (what the
     template does and that QA passed) and the package comment link. Use no
     stall words; the card checker rejects them.
6. **After submission** (portal confirmation or Anna's `Submitted`): on
   `main`, set `releaseState: creator-submitted` and `submittedAt:
   YYYY-MM-DD` in `metadata.json`, commit, push, and close the issue as done.
   `Not now` keeps the issue open with you; ask again only when Anna says so.

## Reconcile

When a creator session exists, or when you see a new FetchCat template on
`https://api.n8n.io/api/templates/search?search=fetch-cat&rows=50`, update
the matching `metadata.json` on `main`:
- `releaseState: creator-public` and `creatorTemplateId: <id>` for a published template;
- `development` with the reviewer's notes in a new pipeline comment for a rejected one.

Link the live template from the Actor README only together with that Actor's
next README change, never as a separate build.
