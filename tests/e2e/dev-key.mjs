import { randomBytes } from 'node:crypto';
/** The per-run local dev key every test runtime receives as RER_DEV_KEY, as rer setup writes one per checkout. */
export const testDevKey = process.env.SLATE_TEST_DEV_KEY ??= randomBytes(32).toString('base64url');
export const devKeyHeaders = { 'x-rer-dev-key': testDevKey };

/** Origins explicitly started with the source-only dev entry. */
export const sourceDevOrigins=new Set();
