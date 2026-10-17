/** Browser-safe trust data. Server reads live in trust.ts. */
export interface PageTrust {
  state: 'verified' | 'lapsed' | 'unverified';
  owner: { id: string; displayName: string } | null;
  expiresAt: string | null;
  updatedAt: string;
}
