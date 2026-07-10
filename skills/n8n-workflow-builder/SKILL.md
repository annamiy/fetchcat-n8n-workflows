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
- Never publish or activate a workflow or schedule.
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
6. Deduplicate before AI and external writes when the workflow is scheduled or
   monitors a changing feed.
7. Validate structured AI output and stop external writes when it is malformed.
8. Ensure empty and duplicate paths create no destination writes.
9. Add `workflow.json`, `metadata.json`, setup README, synthetic fixtures,
   expected assertions, and useful n8n sticky notes.
10. Run `npm run check`, import through `npm run import -- <slug>`, confirm it is
    unpublished, and run the credential-negative CLI check.
11. Export and sanitize once to confirm the graph round-trips without node
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

