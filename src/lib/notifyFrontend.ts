export async function notifyFrontend(
  collection: string,
  event: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL
  const secret = process.env.PAYLOAD_WEBHOOK_SECRET

  if (!frontendUrl || !secret) {
    console.warn(`[webhook] Missing config: FRONTEND_URL=${!!frontendUrl}, SECRET=${!!secret}`)
    return
  }

  const url = `${frontendUrl}/api/webhook`
  console.log(`[webhook] Sending ${event} for ${collection} to ${url}`)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify({ collection, event, doc }),
    })

    const body = await res.text()
    console.log(`[webhook] Response: ${res.status} ${res.statusText} — ${body}`)

    if (!res.ok) {
      console.error(`[webhook] Frontend returned ${res.status} for ${collection} ${event}`)
    }
  } catch (err) {
    console.error(`[webhook] Network error for ${collection} ${event}:`, err)
  }
}
