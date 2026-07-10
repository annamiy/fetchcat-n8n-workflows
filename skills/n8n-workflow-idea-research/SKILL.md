---
name: n8n-workflow-idea-research
description: Research and decide whether a proposed FetchCat n8n workflow is worth building. Use for evidence-led workflow ideation, Actor demand checks, n8n template competition, community demand, differentiation, feasibility, cost, duplicate detection, and GO or DROP handoff to the existing Developer.
---

# n8n Workflow Idea Research

Produce one evidence-backed `GO` or `DROP` decision on the current Paperclip
issue. Work read-only except for comments and assignment on that same issue.

## Boundaries

- Work in the existing `Internal workflows` project.
- Never create an agent, routine, project, or replacement issue.
- Never write to `actors.db` or any Actor checkout.
- Never modify Actor source, metadata, README, schema, task, pricing, or Store
  surface.
- Do not build a workflow during research.
- Do not expose cookies, tokens, credentials, private URLs, or raw logs.

## Research Procedure

1. Read the entire issue and identify the Actor, audience, promised outcome,
   destinations, and proposed workflow slug.
2. Search `N8N_REPOSITORY_PATH/workflows/*/metadata.json` and open Paperclip
   issues for duplicate or materially overlapping slugs and outcomes.
3. Fetch current public Actor stats and input/output contracts from Apify using
   read-only calls. Record the observation date.
4. Search the current n8n template library for direct competitors and adjacent
   patterns. Record links, popularity signals when available, and setup burden.
5. Search recent Reddit/community discussions for concrete demand, objections,
   failure modes, and cost complaints. Prefer recent, directly relevant posts.
6. Define the differentiation in one sentence. Generic "AI-powered" language
   is not differentiation.
7. Estimate Actor items, batched AI calls/tokens, external writes, happy/duplicate/
   negative test runs, and worst-case test spend. Respect
   `N8N_TEST_BUDGET_USD` and the repository metadata limits.
8. Check feasibility against the Actor schema, n8n nodes available on
   `N8N_API_URL`, credential needs, a nontechnical configuration surface,
   automatic first-run resource creation, post-delivery Data Table ledger
   semantics, shared error notification, and fail-closed behavior. State which
   settings belong in a setup form and explain when an AI batch is impossible.

## Decision Format

Comment on the same issue with:

```text
Decision: GO | DROP
Proposed slug: <slug>
Actor: <owner/name>
User outcome: <one sentence>
Demand evidence: <links and dated signals>
n8n competition: <links and gap>
Differentiation: <one sentence>
Feasibility: <schema and integration result>
Cost envelope: <items, AI calls, test spend>
Risks: <specific failure modes>
Duplicate check: <repository and Paperclip result>
```

Use `GO` only when demand, differentiation, feasibility, and cost all survive
the check. Use `DROP` when any required lane lacks support; state what evidence
would justify reconsideration.

For `GO`, assign the same issue to the existing Developer. For `DROP`, leave a
final decision comment and do not create downstream work.
