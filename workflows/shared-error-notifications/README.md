# FetchCat Private Workflow Error Alerts

This companion workflow sends a private Telegram notification when an assigned n8n workflow fails. It is not an Apify Actor template and should not be submitted to the n8n Creator Portal by itself.

## Setup

1. Import `workflow.json` into n8n 2.26.8 or newer.
2. Connect the dedicated Telegram bot credential to **Send Private Error Alert**.
3. Select the private operations or QA chat as the destination.
4. Open each monitored workflow, choose **Settings**, and select this workflow as its **Error workflow**.
5. After a successful synthetic failure test, activate this Error Trigger
   workflow. Keep every Actor workflow and schedule inactive until QA is complete.

The workflow only includes the failed workflow name, execution ID, last node, a truncated error message, and n8n's private execution URL. It deliberately excludes input records, stack traces, credentials, cookies, and tokens.

## Test

Assign this workflow to an inactive synthetic workflow whose Code node throws `Synthetic QA failure`. Execute the synthetic workflow through the supported n8n CLI path and confirm that exactly one Telegram message arrives. Verify that the alert contains no input payload or credential material.

## Release behavior

The workflow is a private operational companion. Public workflow JSON contains no credential reference, chat ID, private URL, or instance workflow ID. After import, destination selection and error-workflow assignment are instance-local configuration.
