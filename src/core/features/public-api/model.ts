import { z } from 'zod';
import type { AuthenticatedMember } from '../../app/types';

export const scopeSchema = z.object({ containerId: z.string().min(1).max(160), level: z.enum(['read', 'write']) }).strict();
export const scopesSchema = z.array(scopeSchema).min(1).max(100).refine(scopes => new Set(scopes.map(s => s.containerId)).size === scopes.length, 'Choose each space once.');
export const tokenInput = z.object({ operationKey: z.string().min(8).max(160), name: z.string().trim().min(1).max(80), scopes: scopesSchema, expiresAt: z.iso.datetime().optional() }).strict();
export type TokenScope = z.infer<typeof scopeSchema>;
export interface TokenPrincipal { id: string; member: AuthenticatedMember; scopes: TokenScope[] }
export interface TokenView { id: string; memberId: string; memberName: string; name: string; scopes: TokenScope[]; createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null }
