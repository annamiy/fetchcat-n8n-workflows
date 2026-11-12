---
name: n8n-workflow-idea-research
description: Decide GO or DROP for one FetchCat n8n template candidate opened by the n8n template feeder routine. Use for Actor health and schema checks, n8n library competition, a distinct use case and title, destinations, feasibility and cost, and the same-issue handoff to Developer.
---

# n8n Workflow Idea Research

Pipeline overview: `PIPELINE.md` in the repository
(`/data/projects/fetchcat-n8n-workflows`). Never edit the issue description:
its `Actor:` line and marker are how the feeder counts and dedupes pipeline
issues. Work only on the issue you were
given; it carries `[marker:n8n-template-pipeline/v1]`, the candidate Actor and
the feeder's demand evidence. Read-only except comments and the handoff.

## Boundaries

- No building, no Actor runs, no Actor, pricing, README or Store changes.
- Never create an agent, routine, project or another issue.
- No cookies, tokens, private URLs or raw logs in comments.

## Research

1. **Actor health.** Read the Actor's Store page data and input/output schema
   (`https://api.apify.com/v2/acts/fetch_cat~ACTOR` and
   `.../builds/default/openapi.json`). DROP if it is deprecated, under
   maintenance or below about 90% successful public runs over 30 days. Record
   the numbers and the date.
2. **Our coverage.** Read `workflows/*/metadata.json` and our live list
   (`node _scripts/n8n-template-demand.mjs --ours --cache "$APIFY_REPORTS_ROOT/n8n-templates/cache"`
   in the company workspace; the library search has no creator filter). An
   unpublished repository draft for this Actor is a seed, not a template. Most
   drafts share one generic shape, so reuse ideas, never that shape.
3. **Competition.** Search the n8n library
   (`https://api.n8n.io/api/templates/search?search=TERMS&rows=50&sort=views:desc`)
   for the use case and the platform. List the top 3–5 with views and say what
   they miss.
4. **Use case.** One concrete job for one audience, for example "weekly
   competitor ad report for a marketing team". It must differ in purpose,
   logic and output from every live FetchCat template. n8n rejects
   near-identical batches. Prefer destinations with proven demand: Google
   Sheets plus OpenAI is the most viewed; Slack, Telegram, Notion and Gmail
   digests also work. One AI step is fine when it does real work (classify,
   score, summarize), not decoration.
5. **Title.** Verb + outcome + "with Apify, <AI>, <destination>", for example
   "Score Trustpilot reviews and alert on negative trends with Apify, OpenAI
   and Slack". The title must be 50–110 characters and unique.
6. **Feasibility and cost.** Check that the input schema supports the use
   case, the output has the fields it needs, the Apify node (0.9.0) can run it
   with `maxTotalChargeUsd`, and a first run needs no private setup beyond
   credentials (and the sheet copy for Sheets templates). Estimate the default
   run's item count, Apify cost and AI calls; 3 QA executions must stay under
   USD 1.

## Decision

Comment once:

```text
Decision: GO | DROP
Slug: <kebab-case, unique in workflows/>
Actor: fetch_cat/<actor> (<actor id>)
Title: <exact title>
Audience and job: <one sentence>
Destinations: <apps>
Why it is different: <vs our templates and the top library templates>
Demand evidence: <dated numbers and links>
Default input: <values a new user can run as-is>
Sheet template: <tab names and headers, or "none">
Cost envelope: <items, Apify cost, AI calls, QA spend>
Risks: <specific>
```

- **GO:** hand the same issue to Developer with `handoffIssue`
  (`_scripts/lib/paperclip-handoff.mjs`).
- **DROP:** say what evidence would change it, then close the issue as done.
  The feeder skips the Actor for 60 days.
