---
name: n8n-workflow-publisher
description: Merge a QA-passed FetchCat n8n template and submit it to the n8n Creator portal with scripts/creator-portal.mjs (Anna's creator session token), or through an operator-action card when the token is missing or expired. Use for exact-commit verification, PR merge, release state updates, portal submission, the 4-in-review limit, AI and human review feedback, and status reconciliation.
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
   the merge SHA. Then update the shared checkout, which is also the agents'
   skill source: `git -C /data/projects/fetchcat-n8n-workflows pull --ff-only`.
   Do the same after every metadata commit to `main`.
2. Run `npm run package -- <slug>` and check the package holds only the
   sanitized workflow (no credentials, no `settings.errorWorkflow`).
3. **Submission package** on the issue, as one comment:
   - workflow file: GitHub link to `workflows/<slug>/workflow.json` on `main`;
   - title: the metadata title;
   - description: the content of `creator-draft.md` without images (Markdown);
   - setup time and cost: copy them from the yellow note.
4. **Release state:** on `main`, set `releaseState: qa-passed` in
   `metadata.json` if QA did not, commit, push and pull the shared checkout.
   The submit script refuses any other state.
5. **Submit** with the creator portal script, from the shared checkout, after
   loading the token (never print it):

   ```bash
   cd /data/projects/fetchcat-n8n-workflows
   set -a; . /data/paperclip/bootstrap-secrets/n8n-creator.env; set +a
   node scripts/creator-portal.mjs submit <slug> --dry-run
   node scripts/creator-portal.mjs submit <slug>
   ```

   Anna gave standing approval on 12 Nov 2026 ("start posting") to submit
   QA-passed templates while fewer than 4 are in review, and set up the token
   for agents on 12 Nov. Submitting accepts the portal's terms on her behalf,
   as the portal's checkbox does. Never sign in, create an account or handle
   her password.
   - The script counts the portal's own review slots and refuses a duplicate
     title. It posts the template (n8n runs an AI review first, up to about
     5 minutes), then sends it to human review. It prints `templateId`,
     `reviewStatus` and the AI feedback scores.
   - **Exit 4** (4 in review): comment it and set a dated wait 3 days out,
     then run it again. Review takes 3–5 business days.
   - **`reviewStatus: changes_needed`** or an AI feedback score of 0: comment
     the feedback summary (`node scripts/creator-portal.mjs feedback <id>`) and
     hand the same issue to Developer with `handoffIssue`. After the fix and QA,
     resubmit with `node scripts/creator-portal.mjs resubmit <slug> <id>`.
     Templates with AI scores of 0 have still passed human review before, so a
     0 alone with status `in_review` needs no fix.
   - **Exit 3** (no token, expired or refused): fall back to one Board card (it
     messages Anna in her Grok bot):

     ```bash
     node _scripts/board-card.mjs --issue APIA-N --class operator-action \
       --question "Submit this n8n template on n8n.io?" \
       --option submitted:Submitted --option later:"Not now" \
       --context "The n8n template \"<title>\" passed QA and is merged. The agents' n8n.io creator token is missing or expired, so the submission package (workflow file, title, description) is in the linked comment." \
       --action "Submit the n8n template <slug> on n8n.io (Creator portal: upload workflow.json, paste title and description), or save a fresh creator token in n8n-creator.env" \
       --return-owner Publisher --share
     ```

     Run it from the company workspace. Keep the context to what the template
     does and that QA passed; the checker refuses stall words such as
     "blocked", "proceed" or "tried". One card per template, never a reminder
     card.
6. **After submission** (`submittedForHumanReview: true`, or Anna's
   `Submitted`): on `main`, set `releaseState: creator-submitted`,
   `submittedAt: YYYY-MM-DD` and, when the script returned one,
   `creatorTemplateId: <templateId>` in `metadata.json`. Commit, push, pull
   the shared checkout, comment the template id and review status, and close
   the issue as done. `Not now`: comment it and close the issue as done with
   release state `qa-passed`. An open issue would hold a pipeline slot with no
   run, wait or card behind it. The 60-day cooldown keeps the Actor out of the
   feeder.

## Reconcile

At each publish, run `node scripts/creator-portal.mjs status` (with the token)
and compare it with `workflows/*/metadata.json` on `main`. Without a token, use
our live list
(`node _scripts/n8n-template-demand.mjs --ours --cache "$APIFY_REPORTS_ROOT/n8n-templates/cache"`).
Then update the matching file:
- `releaseState: creator-public` and `creatorTemplateId: <id>` for a
  `published` template;
- `development`, with the reviewer's feedback in a new pipeline comment, for a
  `changes_needed` or `rejected` one.

Warn on the issue when the status output says the token expires within 5 days.

Link the live template from the Actor README only together with that Actor's
next README change, never as a separate build.
