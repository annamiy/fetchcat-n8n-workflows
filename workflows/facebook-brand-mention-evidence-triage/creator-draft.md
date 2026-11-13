Validate Facebook keyword-search relevance before turning results into a brand research queue. This manual workflow separates literal post-text mentions from author/context-only and missing-text evidence, then classifies only eligible excerpts. It does not contact authors or generate replies.

## How it works

Apify collects up to ten public keyword results. Every result stays in Search audit. Literal text matches enter one bounded OpenAI batch for complaint, question, endorsement or other classification. Exact post-ID joins and verbatim source quotes are validated before sheet delivery. Needs review retains uncertain and media-only results; Run summary shows the match funnel with an honest completeness caveat. Human Review status is never overwritten.

## Setup

Allow about 15 minutes. Make a copy of the sheet template (COPY_URL_PENDING; development package blocked on the existing template Drive credential). Import the workflow, connect Apify, OpenAI and Google Sheets, then set your query and sheet copy URL in node 1. All destination nodes use that URL. Keep tabs and row-1 headers intact. Run manually and leave inactive; no schedule is included.

## Requirements

n8n Cloud or self-hosted n8n 2.47.4+, verified Apify node 0.9.0, an Apify account, OpenAI and Google Sheets credentials. Uses [Facebook Posts Search Scraper](https://apify.com/fetch_cat/facebook-post-search-scraper). No Facebook login or private pages.

Ten default results have estimated result charges of $0.069, plus platform/proxy overhead and one small AI batch targeting less than $0.01. The $0.15 Apify charge guard is not an all-in cap. Empty results make no AI call and no sheet writes. Source counts stay blank when unknown. Search rankings and literal matches are not exhaustive mention counts or proof of brand identity.

## Customization

Edit only node 1: query, top/latest ranking, one to ten posts, runtime, Actor charge guard and copied sheet URL. Keep the pinned model and output bound for this cost envelope. A blank run key creates a new execution snapshot; reuse a key only to refresh the same snapshot safely. Review ambiguous matches and classifications before acting. Do not infer personal traits, add automated replies or activate schedules.
