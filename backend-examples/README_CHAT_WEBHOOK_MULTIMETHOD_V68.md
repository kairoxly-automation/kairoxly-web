# Kairox Chat Webhook Multi-Method v68

The website calls the same chat webhook:

```text
https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/leads
```

v68 tries multiple methods because if n8n shows **no execution**, the Webhook node may not match the method.

## Browser attempts

1. GET with query fields
2. POST with form fields and no custom headers
3. POST with text/plain JSON
4. Diagnostic no-cors GET/POST fallback

## n8n Webhook node must match one method

Recommended:

```text
HTTP Method: POST
Path: leads
Workflow: Active
```

If the Webhook node is currently GET, either change it to POST or keep GET — v68 will try GET first.

## Fields for GET query or POST form

```text
message
name
phone
email
company
sessionId
page
source
channel
submittedAt
lead
```

In n8n, depending on method/body, use:

```text
$json.query.message
$json.query.name
```

or:

```text
$json.body.message
$json.body.name
```

## Required response

Respond to Webhook should return:

```json
{
  "reply": "Your AI response here"
}
```

If no execution appears after v68:
- the workflow is not active,
- the path is not exactly `leads`,
- the public URL is not reaching this workflow,
- or a proxy/network rule is blocking the request before n8n.
