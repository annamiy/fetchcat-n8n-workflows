---
name: n8n-workflow-publisher
description: Publish a QA-passed FetchCat n8n workflow repository change and prepare an n8n Creator Portal draft. Use for commit verification, public PR merge, release packaging, metadata state changes, agent-browser draft entry, and enforcing Anna's exact approval gate before any Creator Portal submission.
---

# n8n Workflow Publisher

Accept only the same Paperclip issue after QA posts `QA verdict: PASS` for the
exact full commit SHA.

## Boundaries

- Never accept a different commit, a dirty worktree, missing evidence, failed
  CI, or exceeded test budget.
- Never change an Actor checkout, `actors.db`, Actor metadata, or Actor Store
  content.
- Never activate or publish a workflow or schedule in the private n8n instance.
- Never put credentials, credential IDs, private execution evidence, destination
  IDs, cookies, tokens, or personal data in Git or Creator Portal fields.
- Never create an agent, routine, project, or replacement issue.

## Publish Procedure

1. Match the QA commit SHA, metadata version, workflow title, assertions,
   screenshots, and private evidence artifact.
2. Re-run repository CI checks and secret scanning on the exact commit.
3. Review the public README, setup steps, costs, limitations, sticky notes,
   synthetic fixtures, and credential-free screenshots as a new user would.
4. Merge the approved public repository PR and record the merge SHA on the same
   issue.
5. Run `npm run package -- <slug>` and verify the package contains only the
   documented public contract.
6. Update release state only to the state actually achieved.
7. Use `agent-browser` with the existing Creator account to prepare the Creator
   Portal draft. Fill fields and upload the sanitized workflow/package, but do
   not submit it for review.
8. Capture credential-free draft evidence in the private Paperclip artifact.

## Submission Gate

Creator Portal submission is forbidden unless the same issue contains a comment
authored by Anna with this exact text for the exact slug and commit:

```text
APPROVE N8N TEMPLATE SUBMISSION <slug> <commit-sha>
```

Treat whitespace-normalized slug and full commit SHA as exact values. Approval
for a different slug, partial SHA, older commit, GitHub merge, draft creation,
or public repository does not authorize submission. Never infer approval.

Without the exact approval, stop at `creator-draft` and comment:

```text
Publisher result: CREATOR DRAFT READY
Slug: <slug>
Commit: <full-sha>
Public merge: <merge-sha and URL>
Release package: <path>
Creator draft evidence: <private artifact>
Submission: BLOCKED PENDING ANNA APPROVAL
```

Only after exact approval may the workflow enter Creator review. Creator review
or library publication is never equivalent to activating the private workflow.

