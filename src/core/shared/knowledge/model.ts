import { z } from "zod";

export const pageLifecycleValues = ["draft", "scheduled", "live", "live-with-unpublished-changes", "archived"] as const;
export const accessLevelValues = ["view", "comment", "edit", "full"] as const;
export const grantPrincipalKindValues = ["member", "group", "container", "workspace"] as const;
export const containerVisibilityValues = ["default", "open", "closed", "private", "personal"] as const;
export const externalAccessValues = ["allowed", "forbidden"] as const;
export const automationScopeValues = ["source", "container", "site"] as const;
export const memberStatusValues = ["active", "historical", "removed"] as const;

export type PageLifecycle = (typeof pageLifecycleValues)[number];
export type AccessLevel = (typeof accessLevelValues)[number];
export type GrantPrincipalKind = (typeof grantPrincipalKindValues)[number];
export type ContainerVisibility = (typeof containerVisibilityValues)[number];
export type ExternalAccess = (typeof externalAccessValues)[number];
export type AutomationScope = (typeof automationScopeValues)[number];
export type MemberStatus = (typeof memberStatusValues)[number];

export const accessLevelSchema = z.enum(accessLevelValues);
export const pageLifecycleSchema = z.enum(pageLifecycleValues);
export const grantPrincipalKindSchema = z.enum(grantPrincipalKindValues);
export const externalAccessSchema = z.enum(externalAccessValues);

export const grantSchema = z.object({
  id: z.string().min(1),
  principalKind: grantPrincipalKindSchema,
  principalId: z.string().min(1),
  level: accessLevelSchema,
  expiresAt: z.string().datetime().nullable().default(null),
  revokedAt: z.string().datetime().nullable().default(null),
});

export type KnowledgeGrant = z.infer<typeof grantSchema>;

export interface MemberSubject {
  memberId: string;
  workspaceId: string;
  status: MemberStatus;
  groupIds: readonly string[];
  containerIds: readonly string[];
  isGuest: boolean;
}

export interface ExternalAccessSettings {
  guests: ExternalAccess;
  publicLinks: ExternalAccess;
  anonymous: ExternalAccess;
}
