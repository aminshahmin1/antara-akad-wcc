import crypto from "node:crypto";

export interface IncomingWhatsAppMessage {
  id: string;
  from: string;
  text: string;
}

export function isValidMetaSignature(rawBody: Buffer, signature: string | undefined, secret: string | undefined): boolean {
  if (!secret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function extractTextMessages(payload: unknown): IncomingWhatsAppMessage[] {
  const result: IncomingWhatsAppMessage[] = [];
  if (!payload || typeof payload !== "object") return result;
  const entries = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return result;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown[] } })?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const item of messages) {
        const message = item as { id?: unknown; from?: unknown; type?: unknown; text?: { body?: unknown } };
        if (
          message.type === "text" &&
          typeof message.id === "string" &&
          typeof message.from === "string" &&
          typeof message.text?.body === "string"
        ) {
          result.push({ id: message.id, from: message.from, text: message.text.body });
        }
      }
    }
  }
  return result;
}

export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v25.0";
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp credentials are not configured.");

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`WhatsApp send failed (${response.status}): ${detail}`);
  }
}
