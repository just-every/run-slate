export const SESSION_COOKIE_NAME = "slate_session";

export function readCookie(headers: Headers, name: string): string | null {
  const value = headers.get("cookie");
  if (!value) return null;

  for (const part of value.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }

  return null;
}

export function createSessionCookie(token: string, expiresAt: string, secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secureAttribute}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
