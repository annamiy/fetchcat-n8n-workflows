# Vinted New-Listing Alerts to Telegram

Runs the [FetchCat Vinted Search Scraper](https://apify.com/fetch_cat/vinted-search-scraper)
(`fetch_cat/vinted-search-scraper`) on a configurable schedule and sends only
previously unseen matching listings to Telegram. It is designed for buyers and
collectors who want to monitor one focused Vinted search without repeatedly
refreshing saved results.

The workflow defaults to one run per hour and 10 results. Users can change the
Schedule Trigger to run every 15 or 30 minutes, every 1, 6, or 12 hours, or once
per day. The result limit accepts 1 through 50. More frequent runs, more results,
or multiple copies of the workflow increase Apify usage.

It works on n8n Cloud or self-hosted n8n, uses only built-in n8n nodes, and does
not require OpenAI.

## Setup

1. Import `workflow.json` into n8n.
2. Open `1. Choose Alert Frequency`. Keep the hourly default or select an
   interval from 15 minutes through one day.
3. Open `2. Configure Vinted Search` and set:
   - `searchText`: the product, style, or model to find.
   - `domain`: the relevant public marketplace, such as `www.vinted.fr`,
     `www.vinted.de`, or `www.vinted.co.uk`.
   - `minimumPrice` and `maximumPrice`: numeric price limits in the marketplace
     currency.
   - `allowedBrands`: optional comma-separated exact brand names.
   - `allowedSizes`: optional comma-separated exact sizes.
   - `maxResults`: an integer from 1 to 50; the default is 10.
   - `sendFirstRunAlerts`: normally leave this off so setup creates a quiet
     baseline. Turn it on only when you intentionally want current results.
4. Create an HTTP Header Auth credential with header `Authorization` and value
   `Bearer YOUR_APIFY_TOKEN`. Select it in both Apify HTTP Request nodes.
5. Connect a Telegram Bot credential in `4. Send New Listings to Telegram` and
   enter the private chat or group ID that should receive alerts.
6. Run the workflow manually. With the safe default, the first successful run
   records current listing IDs without sending a message.
7. Run it again to verify that unchanged listings do not send duplicate alerts,
   then activate the schedule.

## Behavior

```mermaid
flowchart LR
  T[Manual or scheduled trigger] --> C[Validate one Vinted search]
  C --> A[Run FetchCat Vinted Search Scraper]
  A --> F[Apply price, brand, and size filters]
  F --> D[Keep IDs absent from delivery ledger]
  D --> B{First run?}
  B -->|Yes| Q[Record quiet baseline]
  B -->|No| M[Send Telegram alerts in groups of five]
  M --> L[Commit IDs after delivery]
```

- Search state is scoped to the complete configuration. Changing the domain,
  query, price range, brand allowlist, or size allowlist creates a new baseline.
- Telegram messages contain title, price, brand, size, condition, seller,
  engagement counters when available, and a direct listing link.
- Listings are grouped five per message to stay readable and within Telegram's
  message limits.
- IDs are written to `FetchCat Delivery Ledger` only after Telegram succeeds.
  A Telegram failure therefore leaves those listings retryable.
- `FetchCat Vinted Monitor State` records whether a search configuration has
  completed its baseline.
- Empty searches and fully delivered reruns create no Telegram messages.
- The workflow never buys an item, contacts a seller, or signs into Vinted.

## Cost Guidance

The Actor currently charges a run-start event plus each listing saved. At the
published Free-tier event prices, one hourly search returning 10 listings is
approximately USD 7.78 per 30-day month. Every 30 minutes is approximately USD
15.55 and every 15 minutes approximately USD 31.10. These are estimates, not a
guarantee; check the Actor page for current pricing before activation.

n8n Cloud also counts every scheduled workflow run as an execution, even when
there are no new listings. Hourly uses about 720 executions per 30-day month;
every 30 minutes uses about 1,440; every 15 minutes uses about 2,880.

## Limitations

- Vinted does not expose an authoritative listing creation timestamp through
  this Actor. "New" means that the listing ID was not present in a previous
  successful workflow run.
- A result limit that is lower than the number of listings added between runs
  can miss older additions that fall outside the newest returned page.
- Brand and size filters use exact case-insensitive matches against values
  returned by Vinted. Marketplace field availability varies by country.
- The Actor returns and charges for dataset rows before n8n removes previously
  delivered IDs.

## QA

Use at most three Apify-backed executions: first-run baseline, one controlled
delivery, and one duplicate rerun. Confirm that the first run is quiet by
default, Telegram receives readable links, a duplicate rerun sends nothing,
and a failed Telegram call does not commit IDs.

Synthetic Actor-shaped input and deterministic assertions are stored under
`fixtures/`. They contain no real listings or personal information.
