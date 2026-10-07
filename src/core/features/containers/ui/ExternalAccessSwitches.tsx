import { Info } from "lucide-react";
import { useId } from "react";
import type { ExternalAccess, ExternalAccessSettings } from "../../../shared/knowledge/model";
import { Switch, cn } from "../../../ui";
import { containerNoun, memberNoun } from "./nouns";

type SwitchKey = keyof ExternalAccessSettings;

/** WEB-001 — each switch vetoes its own act and no other. */
const switchCopy: Record<SwitchKey, { label: string; allowed: string; forbidden: string }> = {
  guests: {
    label: "Guests",
    allowed: `A guest can be invited to named pages in this ${containerNoun}.`,
    forbidden: `A guest invitation to this ${containerNoun} or to a page in it is rejected, and existing guest access to it ends at once.`,
  },
  publicLinks: {
    label: "Public links",
    allowed: `A ${memberNoun} with full access on a page here can publish it to a public link.`,
    forbidden: `Publishing a page in this ${containerNoun} is rejected, and every existing public link on its pages stops resolving at once.`,
  },
  anonymous: {
    label: "Anonymous access",
    allowed: "A published page here is readable without signing in.",
    forbidden: `A published page here resolves only for a signed-in ${memberNoun} who may read it.`,
  },
};

const switchOrder: readonly SwitchKey[] = ["guests", "publicLinks", "anonymous"];

export interface ExternalAccessSwitchesProps {
  value: ExternalAccessSettings;
  /** CONT-007 — the workspace-wide value a container administrator may only narrow. */
  workspaceValue: ExternalAccessSettings;
  onChange: (key: SwitchKey, next: ExternalAccess) => void;
  /** A container administrator narrows; a workspace owner sets the workspace value elsewhere. */
  readOnly?: boolean;
  className?: string;
}

/** CONT-007 — three switches, each `allowed` or `forbidden`, with no plan or tier gate. */
export function ExternalAccessSwitches({
  value,
  workspaceValue,
  onChange,
  readOnly = false,
  className,
}: ExternalAccessSwitchesProps) {
  const ids = useId();

  return (
    <section aria-labelledby={`${ids}-heading`} className={cn("rounded-card border border-line bg-surface", className)}>
      <header className="border-b border-line px-3 py-2">
        <h3 className="text-ui font-medium text-ink" id={`${ids}-heading`}>
          External access
        </h3>
        <p className="text-tiny text-ink-muted">
          Each switch vetoes its own act and no other. Forbidding takes effect at once.
        </p>
      </header>
      <ul className="divide-y divide-line">
        {switchOrder.map((key) => {
          const copy = switchCopy[key];
          const current = value[key];
          const workspace = workspaceValue[key];
          const lockedByWorkspace = workspace === "forbidden";
          const allowed = current === "allowed";
          const labelId = `${ids}-${key}-label`;
          const describedBy = `${ids}-${key}-effect`;

          return (
            <li className="flex items-start gap-3 px-3 py-2.5" key={key}>
              <div className="min-w-0 flex-1">
                <p className="text-ui text-ink" id={labelId}>
                  {copy.label}
                </p>
                <p className="text-tiny text-ink-muted" id={describedBy}>
                  {allowed ? copy.allowed : copy.forbidden}
                </p>
                {lockedByWorkspace ? (
                  <p className="mt-1 flex items-start gap-1.5 text-tiny text-ink-muted">
                    <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    Forbidden for the whole workspace. A {containerNoun} administrator may only narrow the
                    workspace-wide value, never widen it, so this cannot be allowed here.
                  </p>
                ) : (
                  <p className="mt-1 text-tiny text-ink-faint">Workspace-wide: {workspace}.</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn("text-tiny font-medium", allowed ? "text-good" : "text-ink-muted")}
                >
                  {allowed ? "Allowed" : "Forbidden"}
                </span>
                <Switch
                  aria-describedby={describedBy}
                  aria-labelledby={labelId}
                  checked={allowed}
                  disabled={readOnly || lockedByWorkspace}
                  onCheckedChange={(next) => onChange(key, next ? "allowed" : "forbidden")}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
