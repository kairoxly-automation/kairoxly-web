# Kairox Chat Webhook v66

The chat message request now sends values as separate `application/x-www-form-urlencoded` fields instead of JSON.

This reduces browser/CORS preflight issues and makes n8n extraction easier.

## n8n receives

Use these expressions:

```text
$json.body.message
$json.body.name
$json.body.phone
$json.body.email
$json.body.company
$json.body.sessionId
$json.body.page
$json.body.source
$json.body.channel
$json.body.submittedAt
```

If your n8n instance exposes form fields at top level, use:

```text
$json.message
$json.name
$json.phone
$json.email
$json.company
$json.sessionId
```

## Response expected by website

Return JSON with one of these keys:

```json
{
  "reply": "Your AI reply here"
}
```

The website can also read:

```text
output
message
answer
response
text
content
result
aiReply
chatReply
assistantReply
```

## Important

Make sure the n8n workflow is Active and the Respond to Webhook node returns a response to the browser.
