# FetchCat n8n Workflows

Production-minded n8n workflow templates for FetchCat Apify Actors. Every template
is stored as sanitized JSON, includes synthetic fixtures and expected assertions,
and is designed to fail closed before writing to an external service.

## Workflows

| Workflow | Actor | Destinations | State |
| --- | --- | --- | --- |
| [LinkedIn Job Match Digest](workflows/linkedin-job-match-digest/) | `fetch_cat/linkedin-jobs-scraper` | Google Sheets, Slack | QA passed |
| [Pinterest Content Opportunity Research](workflows/pinterest-content-opportunity-research/) | `fetch_cat/pinterest-search-scraper` | OpenAI, Google Sheets | QA passed |
| [YouTube Research Brief to Notion](workflows/youtube-research-brief-to-notion/) | `fetch_cat/youtube-transcript-scraper` | Notion | QA passed |
| [Reddit Buying-Intent Alerts](workflows/reddit-buying-intent-alerts/) | `fetch_cat/reddit-scraper` | Telegram | QA passed |
| [Vinted New-Listing Alerts](workflows/vinted-new-listing-alerts/) | `fetch_cat/vinted-search-scraper` | Telegram | QA passed |
| [TikTok Profiles to Google Sheets](workflows/tiktok-profiles-to-google-sheets/) | `fetch_cat/tiktok-profile-scraper` | Google Sheets | QA passed |
| [TikTok Creator Growth Monitor](workflows/tiktok-creator-growth-monitor/) | `fetch_cat/tiktok-profile-scraper` | Google Sheets, Telegram | QA passed |
| [Private Workflow Error Alerts](workflows/shared-error-notifications/) | Companion workflow | Telegram | QA passed |
| [Google Maps Lead Enrichment](workflows/google-maps-lead-enrichment/) | `fetch_cat/google-maps-places-scraper`, `fetch_cat/website-contact-finder` | Google Sheets, Slack | QA passed |
| [TikTok Viral Content Opportunities](workflows/tiktok-viral-content-opportunities/) | `fetch_cat/tiktok-trends-scraper` | OpenAI, Google Sheets, Telegram | QA passed |
| [YouTube Trending Content Ideas](workflows/youtube-trending-content-ideas/) | `fetch_cat/youtube-search-results-scraper` | OpenAI, Google Sheets, Telegram | QA passed |
| [Meta Ads Competitor Monitor](workflows/meta-ads-competitor-monitor/) | `fetch_cat/facebook-ads-library-scraper` | OpenAI, Google Sheets, Slack | Development: live empty path verified |
| [Amazon Price and Stock Monitor](workflows/amazon-price-stock-monitor/) | `fetch_cat/amazon-products-search-scraper` | Google Sheets, Telegram | QA passed |
| [Google Reviews Response Drafts](workflows/google-reviews-response-drafts/) | `fetch_cat/google-maps-reviews-scraper` | OpenAI, Google Sheets, Slack | QA passed |
| [Zillow Listing and Price Monitor](workflows/zillow-listing-price-monitor/) | `fetch_cat/zillow-property-listings-scraper` | Google Sheets, Telegram | QA passed |
| [Google Trends Opportunity Monitor](workflows/google-trends-opportunity-monitor/) | `fetch_cat/google-trends-scraper` | OpenAI, Google Sheets, Slack | QA passed |
| [Mobile App Review Monitor](workflows/mobile-app-review-monitor/) | `fetch_cat/apple-app-store-reviews-scraper`, `fetch_cat/google-play-reviews-scraper` | OpenAI, Google Sheets, Slack | QA passed |
| [Product Hunt Launch Monitor](workflows/product-hunt-launch-monitor/) | `fetch_cat/product-hunt-scraper` | OpenAI, Notion, Slack | QA passed |

All schedules are inactive in Git. Importing through the n8n CLI also forces them
inactive. Creator Portal packages remain drafts until a separate approval is given.

How templates are chosen, built, tested and submitted: [PIPELINE.md](PIPELINE.md).

## Requirements

- n8n `2.47.4` or newer for new templates (older templates state `2.26.8`)
- The verified Apify node `@apify/n8n-nodes-apify` `0.9.0` for new templates
  (older templates call Apify through HTTP Request nodes)
- Node.js 20 or newer for repository tooling
- Credentials for the integrations named by each workflow
- Permission to create n8n Data Tables. The templates create required ledgers
  and, where used, configuration tables automatically on first use.

The reference Docker Compose deployment is under [`infra/`](infra/). Runtime
secrets belong in n8n's encrypted credential store and must never be added to a
workflow export.

## Commands

```bash
npm run build
npm run validate
npm run import -- linkedin-job-match-digest
npm run execute -- linkedin-job-match-digest
npm run export -- linkedin-job-match-digest
npm run sanitize -- exported-workflow.json clean-workflow.json
npm run package -- linkedin-job-match-digest
```

The import and export commands use the supported n8n CLI inside the
container named by `N8N_CONTAINER` (default: `fetchcat-n8n`). The execute command
resolves the imported workflow by its exact public title. n8n 2.26.8 disables
Data Table nodes in standalone CLI executions, so ledger-backed workflows must
be executed through the private server editor or a controlled inactive QA
trigger; the command fails early with that explanation.

## Public Contract

Each workflow folder contains:

- `workflow.json`: deterministic, inactive, sanitized n8n graph
- `metadata.json`: version, Actor, integrations, test limits, and release state
- `README.md`: setup, behavior, outputs, and QA procedure
- `fixtures/input.json`: synthetic Actor-shaped input
- `fixtures/expected-output.json`: deterministic acceptance assertions
- `assets/`: screenshots produced after credentialed QA

Release states progress through `development`, `qa-passed`, `github-public`,
`creator-draft`, `creator-submitted`, and `creator-public`. A state change records
what has actually happened; it is not a request to publish.

## Safety

CI rejects active workflows, credential references, pinned execution data,
instance identifiers, malformed connections, common token formats, private
network URLs, and personal email addresses in workflow artifacts. Testing is
limited to three Apify-backed executions per workflow, ten Actor items per run,
one YouTube video per run, and a shared total budget of USD 10.

Actor templates use durable destination-backed history or a delivery ledger instead
of execution-local deduplication. LinkedIn and Reddit make one structured AI request
per batch, and the companion error workflow sends minimal private failure alerts.

This repository does not modify any FetchCat Actor source, metadata, README,
task, schema, or Store page.

## License

[MIT](LICENSE)
