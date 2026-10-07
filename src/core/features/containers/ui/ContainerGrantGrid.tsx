import { Plus, X } from "lucide-react";
import { useId } from "react";
import { type AccessLevel, accessLevelValues } from "../../../shared/knowledge/model";
import {
  Avatar,
  AvatarFallback,
  Button,
  DeniedState,
  EmptyState,
  ErrorState,
  LoadingState,
  type SurfaceState,
  cn,
} from "../../../ui";
import { containerNoun, memberNoun } from "./nouns";
import { accessLevelCopy, grantPrincipalKindLabel, type ContainerGrantRow } from "./types";

export interface ContainerGrantGridProps {
  state: SurfaceState;
  rows: readonly ContainerGrantRow[];
  /** CONT-009 — editable only by a container administrator or a workspace owner. */
  canEdit: boolean;
  errorDetail?: string;
  onChangeLevel: (grantId: string, level: AccessLevel) => void;
  onRemove: (grantId: string) => void;
  onAddPrincipal: () => void;
  onRetry: () => void;
  className?: string;
}

/** CONT-009 — the principals of SHARE-001 against the four levels of SHARE-002. */
export function ContainerGrantGrid({
  state,
  rows,
  canEdit,
  errorDetail,
  onChangeLevel,
  onRemove,
  onAddPrincipal,
  onRetry,
  className,
}: ContainerGrantGridProps) {
  const ids = useId();

  if (state === "loading") return <LoadingState className={className} rows={5} />;
  if (state === "denied") {
    return <DeniedState className={className} title={`You need access to see who can reach this ${containerNoun}`} />;
  }
  if (state === "error") {
    return (
      <ErrorState className={className} detail={errorDetail} onRetry={onRetry} title="Access could not be loaded" />
    );
  }

  return (
    <section aria-labelledby={`${ids}-heading`} className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <h3 className="text-ui font-medium text-ink" id={`${ids}-heading`}>
          Who can reach this {containerNoun}
        </h3>
        {canEdit ? (
          <Button className="ml-auto" onClick={onAddPrincipal} size="sm" variant="secondary">
            <Plus aria-hidden="true" className="size-3.5" />
            Add a principal
          </Button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-control border border-line bg-sidebar px-3 py-2 text-tiny text-ink-muted">
          You can see these grants but not change them. Only a {containerNoun} administrator or a workspace owner
          edits them.
        </p>
      ) : null}

      {state === "empty" || rows.length === 0 ? (
        <EmptyState
          action={
            canEdit ? (
              <Button onClick={onAddPrincipal} size="sm">
                Add a principal
              </Button>
            ) : undefined
          }
          description={`Nobody has been granted access here yet, so its pages inherit nothing from this ${containerNoun}.`}
          title="No grants yet"
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[34rem] border-collapse text-ui">
            <caption className="sr-only">
              Each principal holds exactly one access level in this {containerNoun}.
            </caption>
            <thead>
              <tr className="border-b border-line bg-sidebar">
                <th className="px-3 py-2 text-left text-tiny font-medium text-ink-muted" scope="col">
                  Principal
                </th>
                {accessLevelValues.map((level) => (
                  <th className="px-2 py-2 text-center text-tiny font-medium text-ink-muted" key={level} scope="col">
                    <span className="block text-ink">{accessLevelCopy[level].label}</span>
                    <span className="block font-normal">{accessLevelCopy[level].description}</span>
                  </th>
                ))}
                <th className="px-2 py-2" scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.grantId}>
                  <th className="px-3 py-2 text-left font-normal" scope="row">
                    <span className="flex items-center gap-2">
                      <Avatar className="size-6 shrink-0">
                        <AvatarFallback>{row.principal.initials}</AvatarFallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-ink">{row.principal.name}</span>
                        <span className="truncate text-tiny text-ink-faint">
                          {grantPrincipalKindLabel[row.principal.kind]}
                          {row.principal.detail ? ` · ${row.principal.detail}` : ""}
                          {row.inheritedFrom ? ` · inherited from ${row.inheritedFrom}` : " · set here"}
                        </span>
                      </span>
                    </span>
                  </th>
                  {accessLevelValues.map((level) => (
                    <td className="px-2 py-2 text-center" key={level}>
                      <label className="inline-flex cursor-pointer items-center justify-center p-1">
                        <span className="sr-only">
                          {accessLevelCopy[level].label} access for {row.principal.name}
                        </span>
                        <input
                          checked={row.level === level}
                          className="size-4 accent-accent disabled:opacity-50"
                          disabled={!canEdit}
                          name={`${ids}-${row.grantId}`}
                          onChange={() => onChangeLevel(row.grantId, level)}
                          type="radio"
                          value={level}
                        />
                      </label>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right">
                    {canEdit ? (
                      <Button
                        aria-label={`Remove ${row.principal.name}`}
                        onClick={() => onRemove(row.grantId)}
                        size="iconSm"
                        variant="ghost"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-tiny text-ink-faint">
        A principal holds exactly one level. Every change is recorded in activity and takes effect at once, for every{" "}
        {memberNoun} it reaches.
      </p>
    </section>
  );
}
