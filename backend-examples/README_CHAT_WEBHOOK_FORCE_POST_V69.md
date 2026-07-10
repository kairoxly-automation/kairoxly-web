# Kairox Chat Webhook Force POST v69

The chat webhook is confirmed as:

```text
https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/leads
```

v69 forces the website to use this exact URL and POST method.

## What v69 does

1. Forces `config.webhook` to the confirmed production POST URL.
2. Sends a direct browser `fetch()` POST with form fields.
3. If readable fetch is blocked, submits the same POST through a hidden HTML form.
   - The hidden form cannot read the AI reply because it is cross-origin.
   - It should still create an n8n execution if the active production webhook is reachable.

## n8n Webhook node

```text
HTTP Method: POST
Path: leads
Workflow: Active
```

## n8n field access

Because the browser sends form fields, use:

```text
$json.body.message
$json.body.name
$json.body.phone
$json.body.email
$json.body.company
$json.body.sessionId
```

If your n8n exposes fields at top level:

```text
$json.message
$json.name
$json.phone
$json.email
$json.company
$json.sessionId
```

## Respond to Webhook

Return JSON:

```json
{
  "reply": "Your AI response here"
}
```

Add headers:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept
Content-Type: application/json
```

If the direct fetch fails but the hidden form creates an execution, the issue is CORS/response readability.
If neither creates an execution, the production URL/path/method is not reachable from the public website/browser.
