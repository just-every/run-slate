export interface SendGridMessage {deliveryId: string; from: string; to: string[]; subject: string; text: string}
export interface SendGridResult {provider: 'sendgrid'; status: 'accepted' | 'rejected' | 'rate_limited' | 'uncertain'; providerMessageId: string | null; code?: string}
export function sendSendGrid(config: {provider: 'sendgrid'; mode: 'production'; apiKey: string}, message: SendGridMessage): Promise<SendGridResult>;
