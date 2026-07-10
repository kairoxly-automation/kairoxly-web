# Kairox Chat Webhook Reach v67

The website still calls:

```text
https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/leads
```

v67 makes the browser request easier for n8n to receive:

1. First attempt:
   - POST
   - URLSearchParams body
   - no custom headers
   - fields are separate

2. Second attempt:
   - POST
   - text/plain JSON fallback

3. Diagnostic fallback:
   - sendBeacon text/plain ping
   - this can create an n8n execution even if CORS blocks readable replies

## n8n must be configured as

Webhook node:
- HTTP Method: POST
- Path: leads
- Workflow must be Active for the production `/webhook/leads` URL

Respond to Webhook node:
- Return JSON:
```json
{
  "reply": "AI response here"
}
```

If the website still shows an error and n8n has no execution:
- the workflow is inactive,
- the Webhook node method/path does not match POST `/leads`,
- or a proxy/browser/network rule is blocking the request before it reaches n8n.

If n8n shows an execution but the website still shows an error:
- add CORS headers in Respond to Webhook:
```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept
Content-Type: application/json
```
