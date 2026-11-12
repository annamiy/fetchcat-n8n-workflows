---
name: n8n-workflow-qa
description: QA a FetchCat n8n template end to end in the private instance with the QA destinations. Use for exact-commit checks, guarded Apify-backed executions, happy/duplicate/empty/credential paths, sticky-note and near-duplicate review, sheet template check, export-sanitize-reimport and same-issue pass or failure handoff.
---

# n8n Workflow QA

Read `PIPELINE.md` first. Accept only a same-issue `Builder handoff: READY FOR
QA` with a full commit SHA.

## Boundaries

- Test the exact commit in your own worktree
  (`/data/projects/fetchcat-n8n-workflows-wt/qa-<slug>`, detached at the SHA).
- Keep workflows and schedules inactive. Use only the `FetchCat QA - *`
  credentials and the QA destinations in `n8n-destinations.env`.
- At most 3 Apify-backed executions per template, each through the spend
  guard from the company workspace:
  `node _scripts/apify-guarded-command.mjs --action run --scope task-qa --actor ACTOR --planned-runs 1 --justification "APIA-N n8n template QA <path>" -- sudo -n /usr/local/sbin/fetchcat-n8n-cli execute --id=ID`
  (load `anna-apify-workspace-runtime.env` and `anna-apify-company.env` first).
  A 4th or later run on the same template (after a fix) adds
  `--additional-verification --issue APIA-N --prior-run-id <previous Apify run>`
  with a justification naming what changed. Never start a paid run from the
  editor. A template with Data Table nodes fails QA (builder rule). The editor
  (`https://n8n.nosova.me`, which opens from the VPS without the basic-auth login) is
  only for reading executions and taking screenshots.
- Never expose keys, destination IDs, cookies or private output in Git or
  comments. Never modify Actor checkouts or `actors.db`.

## Checks

1. Exact SHA, clean worktree, `npm run validate`, secret scan
   (`gitleaks detect --no-git -s workflows/<slug>` if installed, else the
   validator's scan).
2. **Review as an n8n reviewer would:**
   - the yellow note has 100–300 words with How it works and Setup;
   - every node sits inside a white section note, and node names are descriptive;
   - all settings are in one Set node and no Code edits are needed;
   - the title is in verb–outcome–apps form;
   - the logic and output differ from every other template in `workflows/`, with no swapped-app copy.
   Fail it otherwise.
3. **Sheet template:** the copy link opens without login
   (`curl -sL https://docs.google.com/spreadsheets/d/ID/export?format=csv`
   returns the headers), and the headers match what the workflow writes.
4. Import inactive, attach the QA credentials, then run:
   - **happy path**: the default input. Check items, AI schema and destination rows;
   - **duplicate path**: an immediate rerun produces no new rows or messages;
   - **empty or invalid input**: a clean end with no writes;
   - **missing credential**: a readable error.

   Record the execution IDs, Apify run IDs and spend in a private comment
   artifact, not Git.
5. Export, sanitize, reimport, and confirm the parameters survived and the copy
   stays inactive.
6. Confirm that `assets/workflow-overview.png` and `assets/output-preview.png`
   show no real identifiers.

## Handoff

On failure, comment the failing check, reproduction and spend, then
`handoffIssue` back to Developer. On pass, comment and hand to Publisher:

```text
QA verdict: PASS
Slug: <slug>
Commit: <full sha>
Reviewer checks: PASS
Sheet template: PASS | n/a
Happy path: PASS
Duplicate path: PASS
Empty/error path: PASS
Credential path: PASS
Export/sanitize/reimport: PASS
Spend: <amount, runs>
Residual risks: <list or none>
```
