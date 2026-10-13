import { pageResponse } from '../../../../modules/operator-auth/page.mjs';
import { escapeHtml } from '../../../../modules/operator-auth/http.mjs';

const branding = { productName: 'Slate', accentColor: '#315568', signInPath: '/signin' };

/**
 * WORK-006: opening an invitation link only shows this page. Accepting is the form's
 * same-origin POST, so a mail scanner or link preview that fetches the URL accepts nothing.
 */
export function invitationPage({ token, expiresAt, method }: { token: string; expiresAt: string | null; method: string }) {
  if (!expiresAt) return pageResponse({ branding, heading: 'This invitation is invalid or expired', status: 400, method, content: `<p>It may have expired, been withdrawn or already been used. Ask the person who invited you for a new invitation, or sign in if you already accepted it.</p><a class="action" href="${branding.signInPath}">Sign in</a>` });
  const minutes = Math.max(1, Math.ceil((Date.parse(expiresAt) - Date.now()) / 60_000));
  const lasts = minutes < 120 ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : minutes < 2880 ? `${Math.floor(minutes / 60)} hours` : `${Math.floor(minutes / 1440)} days`;
  return pageResponse({ branding, heading: 'Accept your invitation to Slate', method, referrer: 'strict-origin', content: `<p>This invitation works once and expires in ${lasts}.</p><form method="post" action="/api/auth/invitation/accept"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Accept invitation</button></form>` });
}

/** Accepted, but the session could not be issued (the membership changed at once): sign in normally. */
export function invitationAcceptedPage(method: string) {
  return pageResponse({ branding, heading: 'Your invitation is accepted', status: 409, method, content: `<p>Sign in with your email address to continue.</p><a class="action" href="${branding.signInPath}">Sign in</a>` });
}
