import { useId } from "react";
import { Badge, Switch } from "../../../ui";
import { SettingRow, SettingsSection } from "./SettingsSection";
import { containerNoun, memberNoun, pluralise } from "./nouns";
import type { ExternalAccess, ExternalAccessSettings } from "../../../shared/knowledge/model";

type SwitchKey = keyof ExternalAccessSettings;

/**
 * `CONT-007` — the workspace-wide value of the three external-access switches.
 * A container administrator may only narrow what is set here.
 *
 * These switches carry no plan, tier or upgrade gate. There is nothing to buy
 * to turn one on, and nothing on this pane may suggest otherwise.
 */
export function ExternalAccessDefaultsSection({
  value,
  onChange,
  canAdminister,
  /** How many containers have narrowed a switch below the workspace value. */
  narrowedContainerCount,
  className,
}: {
  value: ExternalAccessSettings;
  onChange: (key: SwitchKey, next: ExternalAccess) => void;
  canAdminister: boolean;
  narrowedContainerCount: number;
  className?: string;
}) {
  const fieldId = useId();

  const rows: Array<{ key: SwitchKey; label: string; description: string }> = [
    {
      key: "guests",
      label: "Guests",
      description: `A person who is not a ${memberNoun} can be invited to named pages. A ${containerNoun} may forbid guests for itself.`,
    },
    {
      key: "publicLinks",
      label: "Public links",
      description: "A page with full access can be published to a link. Forbidding this stops every existing link at once.",
    },
    {
      key: "anonymous",
      label: "Anonymous reading",
      description: "A published page resolves without signing in. Forbidding this leaves published pages readable only to someone signed in.",
    },
  ];

  return (
    <SettingsSection
      className={className}
      description={`The value every ${containerNoun} starts from. A ${containerNoun} administrator may narrow one of these for their own ${containerNoun} and may never widen it.`}
      title="External access"
    >
      <div className="flex flex-col">
        {rows.map((row) => {
          const allowed = value[row.key] === "allowed";
          const controlId = `${fieldId}-${row.key}`;
          return (
            <SettingRow
              control={
                <div className="flex items-center gap-2">
                  <Badge tone={allowed ? "good" : "neutral"}>{allowed ? "Allowed" : "Forbidden"}</Badge>
                  <Switch
                    aria-label={`${row.label}: ${allowed ? "allowed" : "forbidden"}`}
                    checked={allowed}
                    disabled={!canAdminister}
                    id={controlId}
                    onCheckedChange={(next) => onChange(row.key, next ? "allowed" : "forbidden")}
                  />
                </div>
              }
              description={row.description}
              key={row.key}
              label={row.label}
            />
          );
        })}
      </div>

      <p className="text-tiny text-ink-muted">
        {narrowedContainerCount > 0
          ? `${narrowedContainerCount} ${narrowedContainerCount === 1 ? containerNoun : pluralise(containerNoun)} ${narrowedContainerCount === 1 ? "has" : "have"} narrowed one of these for themselves. Forbidding a switch here takes effect there at once.`
          : `No ${containerNoun} has narrowed one of these. Forbidding a switch here takes effect everywhere at once.`}
      </p>
      {canAdminister ? null : (
        <p className="text-tiny text-ink-muted">Only a workspace owner changes the workspace-wide value.</p>
      )}
    </SettingsSection>
  );
}
