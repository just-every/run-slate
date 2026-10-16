/** Native and incumbent authentication paths shared by dispatch and route owners. */
export const PROVIDER_ID = 'identity';
export const PROVIDER_START = `/auth/oidc/${PROVIDER_ID}/start`;
export const PROVIDER_CALLBACK = '/api/auth/identity/callback';
export const LOCAL_SETUP_PATH = '/auth/setup-complete';
export const BASE_AUTH_PATHS = new Set(["/auth/bootstrap", "/auth/confirm", "/auth/step-up", PROVIDER_START, PROVIDER_CALLBACK]);
export const SESSION_AUTH_PATHS = new Set([...BASE_AUTH_PATHS, LOCAL_SETUP_PATH, "/auth/owner-claim"]);
