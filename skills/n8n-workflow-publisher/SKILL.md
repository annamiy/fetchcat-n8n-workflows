---
name: n8n-workflow-publisher
description: Merge a QA-passed FetchCat n8n template, ask Anna by Board card, and only after her "Submit it" answer submit it to the n8n Creator portal with scripts/creator-portal.mjs (Anna's creator session token). Use for exact-commit verification, PR merge, release state updates, portal submission, the 4-in-review limit, AI and human review feedback, and status reconciliation.
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
5. **Ask Anna first, every time.** Nothing goes to n8n.io without Anna's own
   answer on a Board card for that template (her instruction, 12 Nov 2026:
   ask the Board before submitting anything). Her earlier "start posting" is
   not a standing approval. Create one card (it messages her in Grok):

   ```bash
   node _scripts/board-card.mjs --issue APIA-N --class operator-action \
     --question "Submit the n8n template <slug> on n8n.io?" \
     --option submit:"Submit it" --option changes:"Needs changes" --option later:"Not now" \
     --context "\"<title>\" passed QA. Workflow: <GitHub link to workflow.json on main>. Sheet template: <copyUrl or none>. Description: the submission package comment." \
     --action "Review the n8n template <slug> and its sheet template, then approve or reject its submission on n8n.io" \
     --return-owner Publisher --share
   ```

   Run it from the company workspace. The checker refuses stall words such as
   "blocked", "proceed" or "tried". One card per template, never a reminder
   card. Record the card id it prints.
6. **On Anna's answer:**
   - **Submit it:** submit with the creator portal script from the shared
     checkout. The script checks in Paperclip that Anna answered this card with
     "Submit it" and refuses otherwise (exit 5):

     ```bash
     cd /data/projects/fetchcat-n8n-workflows
     set -a; . /data/paperclip/bootstrap-secrets/n8n-creator.env; set +a
     node scripts/creator-portal.mjs submit <slug> --dry-run
     node scripts/creator-portal.mjs submit <slug> --issue APIA-N --approval <card id>
     ```

     It posts the template (n8n's AI review takes up to about 5 minutes), then
     sends it to human review, and prints `templateId`, `reviewStatus` and the
     AI scores. Submitting accepts the portal's terms on Anna's behalf, as the
     portal's checkbox does. Never sign in, create an account or handle her
     password.
     - Exit 4 (4 in review): comment it and set a dated wait 3 days out, then
       run it again under the same approval.
     - Exit 3 (no token, expired or refused): comment it and create one card,
       `--question "Save a fresh n8n.io creator token for <slug>, or submit it yourself?"`
       with `--option token:"Token saved" --option submitted:"I submitted it"`.
     - `reviewStatus: changes_needed`: comment the feedback
       (`node scripts/creator-portal.mjs feedback <id>`) and hand the issue to
       Developer. A resubmission after the fix needs a new "Submit it" card
       (`resubmit <slug> <id> --issue APIA-N --approval <new card id>`).
   - **Needs changes:** comment Anna's note and hand the same issue to
     Developer with `handoffIssue`; after the fix and QA, return to step 5.
   - **Not now:** comment it and close the issue as done with release state
     `qa-passed`. The 60-day cooldown keeps the Actor out of the feeder.
7. **After submission** (`submittedForHumanReview: true`, or Anna's "I
   submitted it"): on `main`, set `releaseState: creator-submitted`,
   `submittedAt: YYYY-MM-DD` and, when known, `creatorTemplateId` in
   `metadata.json`. Commit, push, pull the shared checkout, comment the
   template id and review status, and close the issue as done.

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
