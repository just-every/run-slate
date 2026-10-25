import { DateStamp } from "../../../app/ui/displayDate";
import type { PageTrust } from '../trust-types';

export function TrustBadge({trust, showOwner = true, kindLabel}:{trust:PageTrust;showOwner?:boolean;kindLabel?:string}) {
  return <span className="page-trust">
    {kindLabel?<span className="result-kind">{kindLabel} ·</span>:null}
    <span className={`trust-state trust-state--${trust.state}`}>{trust.state==='verified'?'Verified':trust.state==='lapsed'?'Lapsed':'Unverified'}</span>
    {showOwner && trust.owner?<span>by {trust.owner.displayName}</span>:null}
    {trust.expiresAt?<span>· Expires <DateStamp value={trust.expiresAt} /></span>:null}
    <span>· Updated <DateStamp value={trust.updatedAt} /></span>
  </span>;
}
