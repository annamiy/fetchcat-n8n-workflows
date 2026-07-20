![Vinted New-Listing Alerts workflow](assets/workflow-overview.png)

Monitor one focused Vinted saved search and receive Telegram alerts when
previously unseen matching listings appear. Built for buyers, collectors, and
resellers who need faster Vinted new-listing notifications, this workflow runs
`fetch_cat/vinted-search-scraper` newest-first, applies audience, price, brand,
size, and color-keyword filters, and uses n8n Data Tables to prevent duplicate
notifications.

The default schedule is hourly with 10 results per run. You can configure the
Schedule Trigger from every 15 minutes through once per day and choose between
1 and 50 results. The first successful run sends current matching listings;
later runs send only matches that have not already been delivered.

The editable example is prefilled for women's MAAP cycling jerseys in sizes S
or XS and prices up to EUR 150, with bilingual color keywords suitable for the
default French marketplace. Strict title-color
filtering is intentionally unavailable, so missing title colors never reject a listing.

## Who is it for?

- Buyers looking for a specific model, brand, size, or collectible
- People who miss good listings because they sell before the next manual check
- Resellers who need monitoring and alerts without automated purchasing

## How it works

1. Runs manually or on the schedule you select.
2. Validates the Vinted domain, search, audience, price range, filters, and result limit.
3. Runs one focused FetchCat search per brand name, or one combined search with
   numeric brand IDs, through Cloud-compatible HTTP nodes.
4. Combines, deduplicates, caps, and filters the returned listings.
5. Explains which filter blocked the run when no listing matches.
6. Checks each listing ID against a durable delivery ledger.
7. Sends unseen matches to Telegram in readable groups of five, including on
   the first run.
8. Commits listing IDs only after Telegram succeeds.

## Setup

Create a bot by opening `@BotFather` in Telegram, sending `/newbot`, and following
its prompts. Copy the bot token into a new n8n Telegram credential, add the bot
to the destination group or start a private chat with it, and send one message
so Telegram creates the conversation. Enter that chat ID in `Send New Listings
to Telegram`.

Create one n8n HTTP Header Auth credential for Apify with header name
`Authorization` and value `Bearer YOUR_APIFY_TOKEN`, then select it in both
FetchCat HTTP Request nodes. Edit the saved-search parameters, run once manually,
and activate the schedule after checking the first alerts. The workflow works
on n8n Cloud or self-hosted n8n and does not use an AI model.

![Telegram alert preview](assets/output-preview.png)

## Important cost note

Apify charges `$0.005` per Actor start plus `$0.00058` per listing on its Free
pricing tier at the time of publication. One Actor run every hour returning 10
listings costs approximately `$7.78` per 30-day month: 720 runs and up to 7,200
listings. Once daily costs about `$0.32`; every 30 minutes costs about `$15.55`;
every 15 minutes costs about `$31.10`.

Each additional brand name creates another Actor run unless numeric `brandIds`
are supplied, so adding brands increases the estimate. n8n Cloud also counts
every scheduled execution, even when no new listing is delivered. Prices are
estimates; check the Actor page before activation.

The workflow only monitors public listings. It never purchases items, contacts
sellers, signs into Vinted, or claims that a listing is still available.
Vinted may return zero as an unavailable public view count; the workflow hides
that value rather than presenting it as reliable engagement data.
