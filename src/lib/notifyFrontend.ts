export async function notifyFrontend(
  collection: string,
  event: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL
  const secret = process.env.PAYLOAD_WEBHOOK_SECRET

  if (!frontendUrl || !secret) return

  try {
    await fetch(`${frontendUrl}/api/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify({ collection, event, doc }),
    })
  } catch (err) {
    console.error(`[webhook] Failed to notify frontend for ${collection} ${event}:`, err)
  }
}
