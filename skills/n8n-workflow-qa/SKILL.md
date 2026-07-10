---
name: n8n-workflow-qa
description: QA a FetchCat n8n workflow end to end in the private instance and isolated destinations. Use for inactive import, server or CLI execution as supported, happy/duplicate/negative/credential tests, destination verification with agent-browser, spend tracking, export-sanitize-reimport checks, and same-issue pass or failure handoff.
---

# n8n Workflow QA

Accept only a same-issue Developer handoff with a full commit SHA, exact title,
assertions, and green static validation.

## Boundaries

- Test the exact commit in `N8N_REPOSITORY_PATH`; do not test a dirty worktree.
- Use the private instance at `N8N_API_URL`. For workflows containing n8n Data
  Tables, execute through the authenticated server editor or a temporary QA
  trigger because n8n 2.26.8 disables that module in standalone CLI runs.
- Keep workflows unpublished and schedules inactive.
- Use only the named Google Sheets, Slack, Notion, and Telegram QA resources.
- Never expose `N8N_API_KEY`, third-party credentials, destination IDs, cookies,
  raw credential-bearing logs, or private output evidence in Git or issue text.
- Do not exceed metadata limits, three Apify-backed runs, or the remaining
  `N8N_TEST_BUDGET_USD` allocation.
- Never modify an Actor checkout or `actors.db`.

## QA Procedure

1. Verify the branch SHA, clean worktree, metadata limits, no active workflow,
   and no credential references in public JSON.
2. Run `npm run check` and a secret scan.
3. Import the workflow inactive. Confirm API read and update access without
   publishing it.
4. Attach existing encrypted n8n credentials to the private instance copy.
5. Run one happy path in the server execution context. Use
   `npm run execute -- <slug>` only when the graph has no Data Table node. Record execution ID,
   Actor run ID, item count, AI schema result, destination write count, and
   estimated spend in a private Paperclip artifact.
6. Run the exact duplicate path immediately. Confirm zero duplicate rows,
   pages, Slack messages, or Telegram messages as required by the workflow
   contract.
7. Run one empty or error path. Confirm malformed/missing input fails closed and
   creates no external writes.
8. Run or inspect the missing-credential path and confirm the error is explicit
   and secret-free.
9. Use `agent-browser` to inspect the n8n execution, exact QA destination, and
   output count. Capture credential-free screenshots in the repository and keep
   private identifiers in Paperclip artifacts only.
10. Export, sanitize, validate, reimport, and execute the sanitized copy in the
    appropriate server context. Confirm
    node parameters survive the round trip and the reimport stays unpublished.
11. Run the n8n security audit and confirm total spend remains within the issue
    and repository limits.

## Handoff

On failure, comment with the failing assertion, execution evidence location,
reproduction steps, spend so far, and assign the same issue back to Developer.

On pass, comment:

```text
QA verdict: PASS
Slug: <slug>
Commit: <full-sha>
Happy path: PASS
Duplicate path: PASS
Empty/error path: PASS
Credential path: PASS
Export/sanitize/reimport: PASS
Schedules unpublished: PASS
Spend: <amount and evidence artifact>
Screenshots: <repository paths>
Residual risks: <specific list or none>
```

Assign the same issue to the existing Publisher. Never merge or publish it.
