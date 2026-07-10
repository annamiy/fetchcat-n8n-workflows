# Creator Portal Draft

## Title

Turn a YouTube transcript into a structured Notion research brief with Apify and OpenAI

## Short description

Submit one public YouTube URL and receive a Notion research brief with a summary, key ideas, action items, and verified timestamped moments.

## Suggested categories

- AI Summarization
- Research
- Productivity

## Who it is for

Researchers, students, content teams, consultants, and operators who need useful notes from long videos without losing the source timestamps.

## What this workflow does

An n8n Form accepts a YouTube URL, language code, and research goal. The workflow validates the input, creates its delivery ledger automatically, and runs `fetch_cat/youtube-transcript-scraper` for exactly one video. Missing captions stop the workflow before AI processing.

Timestamped caption segments are capped before one structured OpenAI request. The response must include a summary, five key ideas, five action items, and five timestamped moments. Every returned timestamp is checked against the transcript before the workflow creates a Notion page with real headings and list blocks. The request is committed to the ledger only after Notion succeeds, and the form redirects to the new page.

## Setup

1. Install the Apify community node and import the workflow.
2. Connect Apify, OpenAI, and Notion credentials.
3. Create or select a Notion database and share it with the Notion integration.
4. Select the database in `Create Notion Brief`.
5. Test the form with a public captioned video before publishing the workflow.

## Requirements

- n8n 2.26.8 or newer with Forms and Data Tables
- `@apify/n8n-nodes-apify` 0.6.10 or newer
- Apify account and access token
- OpenAI API credential with access to `gpt-5.4-mini`
- Notion integration and database

## Cost and privacy

Each form submission processes exactly one video and makes one OpenAI request. Transcript input is capped at 60,000 characters. Costs depend on transcript length, the Actor, and model usage. The public video transcript and research goal are sent to OpenAI, and the generated brief is written only to the selected Notion database.

## Submission assets

- `workflow.json`
- `assets/workflow-overview.png`
- `assets/form-preview.png`
- `assets/output-preview.png`

