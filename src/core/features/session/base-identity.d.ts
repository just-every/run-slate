/** Declaration at the native boundary; copied Base implementation stays byte-exact. */
declare module '*modules/operator-auth/identity/email-link/confirmation.mjs' {
  export function confirmationResponse(input: {
    branding: { productName: string; accentColor: string; signInPath: string; theme?: string };
    preview: { kind: 'magic' | 'invite' | 'step_up'; expiresInMinutes: number } | null;
    token: string; method: string;
  }): Promise<Response>;
}
declare module '*modules/operator-auth/dev/badge.mjs' {
  export function decorate(response: Response, input: { exchange: boolean; badge: { session: { operator: { email: string; role: string } } | null; choices: { as: string; email: string }[] } | null }): Promise<Response>;
}
