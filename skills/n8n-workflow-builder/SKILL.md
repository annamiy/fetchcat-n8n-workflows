---
name: n8n-workflow-builder
description: Build a GO-approved FetchCat n8n workflow in the public workflow repository and private unpublished n8n instance. Use for workflow branches, deterministic JSON, fixtures, documentation, sticky notes, validation, sanitized imports, and same-issue handoff to QA.
---

# n8n Workflow Builder

Build only after the current Paperclip issue contains an Idea Researcher `GO`
decision with a unique slug and cost envelope.

## Boundaries

- Work only in `N8N_REPOSITORY_PATH` and the unpublished instance at
  `N8N_API_URL`.
- Never modify an Actor checkout, `actors.db`, Actor metadata, or any public
  Actor surface.
- Never create an agent, routine, project, or replacement issue.
- Never publish or activate an Actor workflow or schedule. A companion Error
  Trigger workflow may be activated only after QA because n8n requires it to be
  active to receive production-mode failures.
- Never place credentials, credential IDs, tokens, destination IDs, personal
  data, pinned real data, or private evidence in Git.
- Use only the named QA destinations during private testing.

## Build Procedure

1. Read the complete same issue, including the GO evidence and constraints.
2. Confirm the slug remains unique in workflow metadata and open Paperclip
   issues.
3. Create `workflow/<slug>` from the current default branch.
4. Build the graph for the installed minimum n8n version and pinned integration
   nodes. Use established repository helpers before adding new abstractions.
5. Enforce item, video, transcript, AI, delivery, and test-spend caps in the
   executable graph, not only in documentation.
6. Check a durable Data Table ledger before AI and external writes. Commit IDs
   only after destination success so failed delivery remains retryable.
7. Create required Data Tables idempotently inside the graph. Put editable
   settings in a setup form or another documented nontechnical surface; do not
   require users to edit Code nodes.
8. Validate structured AI output and stop external writes when it is malformed.
9. Ensure empty and duplicate paths create no destination writes. Remove any
   internal fixture, manual QA-input, or test-only branch before public export.
10. Add `workflow.json`, `metadata.json`, setup README, `creator-draft.md`,
    synthetic fixtures, expected assertions, useful n8n sticky notes, and the
    required credential-free workflow, form/setup, and output screenshots.
11. Run `npm run check`, import through `npm run import -- <slug>`, confirm it is
    unpublished, and run credential-negative testing in the server context when
    the graph uses Data Tables.
12. Export and sanitize once to confirm the graph round-trips without node
    parameter mutation.

## Handoff

Commit the branch and comment on the same issue with:

```text
Builder handoff: READY FOR QA
Slug: <slug>
Branch: workflow/<slug>
Commit: <full-sha>
Workflow title: <exact title>
Static validation: PASS
Import inactive: PASS
Credential-negative test: PASS
Assertions: <happy, duplicate, empty/error, credential>
Known limitations: <specific list or none>
```

Assign the same issue to the existing QA agent. Do not merge the branch.
