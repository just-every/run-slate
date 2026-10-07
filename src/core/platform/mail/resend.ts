export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}

export interface Mailer {
  send(message: OutboundMail): Promise<{ id: string }>;
}

export class MailDeliveryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface ResendMailerOptions {
  from: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

function messageFrom(response: Response): Promise<string> {
  return response.text().then((body) => body.replace(/\s+/g, " ").slice(0, 400) || response.statusText);
}

export function createResendMailer(options: ResendMailerOptions): Mailer {
  if (!options.from.trim()) throw new Error("MAIL_FROM is required to create the Resend mail adapter.");
  if (!options.apiKey.trim()) throw new Error("MAIL_API_KEY is required to create the Resend mail adapter.");
  const request = options.fetch ?? globalThis.fetch;

  return {
    async send(message) {
      if (!message.to.trim() || !message.subject.trim() || !message.text.trim()) {
        throw new Error("Outbound mail requires a recipient, subject, and text body.");
      }
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: options.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!response.ok) throw new MailDeliveryError(`Transactional mail provider rejected the message: ${await messageFrom(response)}.`, response.status);
      const body = await response.json().catch(() => null) as { id?: unknown } | null;
      if (!body || typeof body.id !== "string" || !body.id) {
        throw new MailDeliveryError("Transactional mail provider returned no delivery identifier.", response.status);
      }
      return { id: body.id };
    },
  };
}
