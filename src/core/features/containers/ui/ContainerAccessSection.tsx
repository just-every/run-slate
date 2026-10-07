import { useState } from "react";
import type { ContainerVisibility } from "../../../shared/knowledge/model";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "../../../ui";
import { ContainerGrantGrid, type ContainerGrantGridProps } from "./ContainerGrantGrid";
import { ContainerVisibilitySelect } from "./ContainerVisibilitySelect";
import { ExternalAccessSwitches, type ExternalAccessSwitchesProps } from "./ExternalAccessSwitches";
import { containerNoun, memberNoun } from "./nouns";
import { containerVisibilityCopy, type ContainerGrantRow } from "./types";

type GridProps = Omit<ContainerGrantGridProps, "rows" | "className">;

export interface ContainerAccessSectionProps {
  /** Policy `container.access.v1`. Both values store visibility and the grant list. */
  containerAccessProfile: "class-led" | "grant-led";
  visibility: ContainerVisibility;
  onVisibilityChange: (next: ContainerVisibility) => void;
  memberRows: readonly ContainerGrantRow[];
  groupRows: readonly ContainerGrantRow[];
  guestRows: readonly ContainerGrantRow[];
  grid: GridProps;
  externalAccess: Omit<ExternalAccessSwitchesProps, "className">;
  className?: string;
}

/** CONT-008 — the same stored access, led either by class or by grant. */
export function ContainerAccessSection({
  containerAccessProfile,
  visibility,
  onVisibilityChange,
  memberRows,
  groupRows,
  guestRows,
  grid,
  externalAccess,
  className,
}: ContainerAccessSectionProps) {
  const [manageOpen, setManageOpen] = useState(false);
  const allRows = [...memberRows, ...groupRows, ...guestRows];

  if (containerAccessProfile === "class-led") {
    return (
      <div className={cn("flex flex-col gap-5", className)}>
        <section className="flex flex-col gap-2">
          <h2 className="text-h3 font-medium text-ink">Access</h2>
          <p className="text-ui text-ink-muted">
            The visibility decides who may see and join this {containerNoun}. {containerVisibilityCopy[visibility].description}
          </p>
          <ContainerVisibilitySelect id="container-visibility" onChange={onVisibilityChange} value={visibility} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-ui font-medium text-ink">Named access</h3>
            <span className="text-tiny text-ink-faint">
              {allRows.length} {allRows.length === 1 ? "grant" : "grants"}
            </span>
            <Button
              aria-expanded={manageOpen}
              className="ml-auto"
              onClick={() => setManageOpen((open) => !open)}
              size="sm"
              variant="secondary"
            >
              {manageOpen ? "Hide manage access" : "Manage access"}
            </Button>
          </div>
          <p className="text-tiny text-ink-muted">
            People, groups and guests granted access by name, kept together in one view.
          </p>
          {manageOpen ? <ContainerGrantGrid rows={allRows} {...grid} /> : null}
        </section>

        <ExternalAccessSwitches {...externalAccess} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <section className="flex flex-col gap-2">
        <h2 className="text-h3 font-medium text-ink">Access</h2>
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">{sentenceCasePlural(memberNoun)}</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="guests">Guests</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <ContainerGrantGrid rows={memberRows} {...grid} state={emptyIfNone(memberRows, grid.state)} />
          </TabsContent>
          <TabsContent value="groups">
            <ContainerGrantGrid rows={groupRows} {...grid} state={emptyIfNone(groupRows, grid.state)} />
          </TabsContent>
          <TabsContent value="guests">
            <ContainerGrantGrid rows={guestRows} {...grid} state={emptyIfNone(guestRows, grid.state)} />
          </TabsContent>
        </Tabs>
      </section>

      <ExternalAccessSwitches {...externalAccess} />
    </div>
  );
}

function emptyIfNone(rows: readonly ContainerGrantRow[], state: GridProps["state"]): GridProps["state"] {
  return state === "ready" && rows.length === 0 ? "empty" : state;
}

function sentenceCasePlural(noun: string): string {
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s`;
}
