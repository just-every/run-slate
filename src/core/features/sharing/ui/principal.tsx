import { Building2, BookOpen, UserRound, Users } from "lucide-react";
import type { GrantPrincipalKind } from "../../../shared/knowledge/model";
import { Avatar, AvatarFallback, AvatarImage, cn } from "../../../ui";

/**
 * `SHARE-001` — a grant names a person, a group, a container or the workspace.
 * Shared by the grant rows and by the general access row so one principal looks
 * the same wherever it is shown.
 */
export interface GrantPrincipal {
  kind: GrantPrincipalKind;
  id: string;
  name: string;
  /** An address, a member count, a container key — whatever the row shows beneath the name. */
  detail?: string | null;
  imageUrl?: string | null;
}

const kindIcon = {
  member: UserRound,
  group: Users,
  container: BookOpen,
  workspace: Building2,
} as const;

export function PrincipalIcon({ principal, className }: { principal: GrantPrincipal; className?: string }) {
  if (principal.kind === "member") {
    return (
      <Avatar className={cn("size-7", className)}>
        {principal.imageUrl ? <AvatarImage alt="" src={principal.imageUrl} /> : null}
        <AvatarFallback>{principal.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
    );
  }
  const Icon = kindIcon[principal.kind];
  return (
    <span
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-control bg-sidebar-hover", className)}
    >
      <Icon aria-hidden="true" className="size-4 text-ink-muted" />
    </span>
  );
}

export function PrincipalLabel({ principal, suffix }: { principal: GrantPrincipal; suffix?: string | null }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-ui font-medium text-ink">
        {principal.name}
        {suffix ? <span className="font-normal text-ink-faint"> {suffix}</span> : null}
      </span>
      {principal.detail ? <span className="truncate text-tiny text-ink-muted">{principal.detail}</span> : null}
    </span>
  );
}
