![Track Amazon Prices and Stock with Apify, Google Sheets and Telegram workflow](assets/workflow-overview.png)

# Track Amazon Prices and Stock with Apify, Google Sheets and Telegram

Automate a practical monitoring and research workflow with `fetch_cat/amazon-products-search-scraper`. The template is compatible with n8n Cloud and self-hosted n8n, uses only built-in nodes, caps default collection at 10 items, and prevents duplicate delivery with transaction-safe state.

## Requirements

- Apify account and API token
- Google Sheet with a `Amazon tracker` tab
- Telegram destination

## Customization

Edit search values, threshold, result limit, and schedule in the numbered configuration and trigger nodes. Destination fields and digest wording can be adapted without changing the scraper integration.

## Additional information

Schedules are inactive after import. Run manually twice before publishing. The first run delivers unseen results; an identical rerun sends nothing. The workflow never performs outreach or publishes generated content.
