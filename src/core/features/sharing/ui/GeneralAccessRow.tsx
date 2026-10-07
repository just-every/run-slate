import { ChevronDown, Lock } from "lucide-react";
import type { AccessLevel, ContainerVisibility } from "../../../shared/knowledge/model";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../ui";
import { AccessLevelSelect } from "./AccessLevelSelect";
import { PrincipalIcon, type GrantPrincipal } from "./principal";

export interface GeneralAccessRowProps {
  /** `SHARE-005` — which principal general access names. */
  profile: KnowledgePolicyProfile["page.access.v1"];
  workspace: { id: string; name: string };
  container: { id: string; name: string; visibility: ContainerVisibility };
  /** `SHARE-004` — `null` when the page carries no general access grant. */
  level: AccessLevel | null;
  offeredLevels: readonly AccessLevel[];
  canChangeAccess: boolean;
  onLevelChange: (level: AccessLevel) => void;
  /** Removes the general access grant: the page falls back to its named grants. */
  onRestrict: () => void;
  /** Adds the general access grant at the level the row is showing. */
  onOpenGeneralAccess: (level: AccessLevel) => void;
  className?: string;
}

export function GeneralAccessRow({
  profile,
  workspace,
  container,
  level,
  offeredLevels,
  canChangeAccess,
  onLevelChange,
  onRestrict,
  onOpenGeneralAccess,
  className,
}: GeneralAccessRowProps) {
  const isPersonal = container.visibility === "personal";
  const principal: GrantPrincipal =
    profile === "container-general"
      ? { kind: "container", id: container.id, name: container.name }
      : { kind: "workspace", id: workspace.id, name: workspace.name };
  const openLabel =
    profile === "container-general" ? `Everyone in ${container.name}` : `Everyone at ${workspace.name}`;
  const openDetail =
    profile === "container-general"
      ? `Anyone who can open the ${knowledgeNoun("container")} can find this page.`
      : "Anyone signed in to this workspace can find this page.";

  return (
    <section aria-labelledby="general-access-heading" className={cn("flex flex-col gap-1", className)}>
      <h3 className="px-1 text-tiny font-medium text-ink-muted" id="general-access-heading">
        General access
      </h3>
      <div className="flex items-start gap-2 py-1.5">
        {isPersonal || level === null ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-sidebar-hover">
            <Lock aria-hidden="true" className="size-4 text-ink-muted" />
          </span>
        ) : (
          <PrincipalIcon principal={principal} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {isPersonal ? (
            <>
              <span className="text-ui font-medium text-ink">No general access</span>
              <span className="text-tiny text-ink-muted">
                This page is in a personal {knowledgeNoun("container")}, so it carries none.
              </span>
            </>
          ) : (
            <>
              {canChangeAccess ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="General access"
                    className="-ml-1.5 inline-flex w-fit max-w-full items-center gap-1 rounded-control px-1.5 py-0.5 text-ui font-medium text-ink transition-colors hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover"
                  >
                    <span className="min-w-0 truncate">{level === null ? "Restricted" : openLabel}</span>
                    <ChevronDown aria-hidden="true" className="size-3.5 text-ink-muted" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-72">
                    <DropdownMenuRadioGroup
                      onValueChange={(next) => {
                        if (next === "restricted") onRestrict();
                        else onOpenGeneralAccess(level ?? offeredLevels[0]);
                      }}
                      value={level === null ? "restricted" : "open"}
                    >
                      <DropdownMenuRadioItem value="open">
                        <span className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-medium text-ink">{openLabel}</span>
                          <span className="text-tiny text-ink-muted">{openDetail}</span>
                        </span>
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="restricted">
                        <span className="flex flex-col gap-0.5 py-0.5">
                          <span className="font-medium text-ink">Restricted</span>
                          <span className="text-tiny text-ink-muted">Only the people listed above.</span>
                        </span>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="text-ui font-medium text-ink">{level === null ? "Restricted" : openLabel}</span>
              )}
              <span className="text-tiny text-ink-muted">
                {level === null ? "Only the people listed above." : openDetail}
              </span>
            </>
          )}
        </div>
        {level === null || isPersonal ? null : (
          <AccessLevelSelect
            disabled={!canChangeAccess}
            offeredLevels={offeredLevels}
            onChange={onLevelChange}
            subjectName={openLabel}
            value={level}
          />
        )}
      </div>
    </section>
  );
}
