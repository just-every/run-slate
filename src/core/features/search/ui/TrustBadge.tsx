import type { PageTrust } from '../trust-types';

export function TrustBadge({trust}:{trust:PageTrust}) {
  return <span className="page-trust">
    <span className={`trust-state trust-state--${trust.state}`}>{trust.state==='verified'?'Verified':trust.state==='lapsed'?'Lapsed':'Unverified'}</span>
    {trust.owner?<span>by {trust.owner.displayName}</span>:null}
    {trust.expiresAt?<span>· Expires <time dateTime={trust.expiresAt}>{new Date(trust.expiresAt).toLocaleDateString()}</time></span>:null}
    <span>· Updated <time dateTime={trust.updatedAt}>{new Date(trust.updatedAt).toLocaleDateString()}</time></span>
  </span>;
}
