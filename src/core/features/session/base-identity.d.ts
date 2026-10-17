/** Declaration at the native boundary; copied Base implementation stays byte-exact. */
declare module '*modules/operator-auth/http.mjs' {
  export function requireLoopback(request: Request): void;
  export function requirePost(request: Request, config: { origin: string; local: boolean }): void;
}
declare module '*modules/operator-auth/local-cli.mjs' {
  export function isLocalCli(request: Request, config: { local: boolean; SESSION_SECRET: string }): Promise<boolean>;
}
declare module '*modules/operator-auth/identity/email-link/confirmation.mjs' {
  export function confirmationResponse(input: {
    branding: { productName: string; accentColor: string; signInPath: string; theme?: string };
    preview: { kind: 'magic' | 'invite' | 'step_up' | 'owner'; expiresInMinutes: number } | null;
    token: string; method: string; action?: string;
  }): Promise<Response>;
}
declare module '*modules/operator-auth/crypto.mjs' {
  export function validToken(value: unknown): value is string;
}
declare module '*modules/operator-auth/owner-signin-grant.mjs' {
  export const OWNER_SIGNIN_SECONDS: number;
  export const OWNER_SIGNIN_PATH: '/auth/owner-signin';
  export function ownerSigninDigest(token: string): Promise<string>;
}
declare module '*modules/operator-auth/dev/badge.mjs' {
  export function decorate(response: Response, input: { exchange: boolean; badge: { session: { operator: { email: string; role: string } } | null; choices: { as: string; email: string }[] } | null }): Promise<Response>;
}
