/** Types for the copied JavaScript facade; the provider implementation remains in Base. */
declare module '*modules/mail/src/sender.mjs' {
  interface MailMessage { deliveryId: string; from: string; to: string[]; subject: string; text?: string; html?: string }
  interface MailResult { provider: string; status: 'accepted' | 'rejected' | 'rate_limited' | 'uncertain' | 'development'; providerMessageId: string | null; code?: string }
  export function createMailSender(config: {provider: string; mode: string; apiKey?: string; relayUrl?: string}, dependencies?: {
    fetch?: typeof globalThis.fetch;
    outbox?: {put(message: MailMessage): Promise<void>};
  }): {send(message: MailMessage): Promise<MailResult>};
}
