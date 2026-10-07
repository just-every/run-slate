import { Copy, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "../../../ui";

/** One control in the configuration panel, described by whoever owns the rule. */
export type RuleConfigField =
  | { id: string; kind: "text"; label: string; value: string; placeholder?: string; hint?: string }
  | { id: string; kind: "textarea"; label: string; value: string; placeholder?: string; hint?: string }
  | {
      id: string;
      kind: "select";
      label: string;
      value: string;
      options: readonly { value: string; label: string }[];
      hint?: string;
    };

/**
 * `AUTO-001` — the configuration panel for the card selected on the rail.
 *
 * Design decision: the panel renders the fields it is handed rather than
 * knowing any trigger or action itself. Each component type owns its own field
 * list, which keeps a new action from needing a change here.
 */
export interface RuleConfigPanelProps {
  /** The selected card's own name, e.g. "Then: Add a comment". */
  title: string;
  description: string;
  fields: readonly RuleConfigField[];
  onFieldChange: (fieldId: string, value: string) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function RuleConfigPanel({
  title,
  description,
  fields,
  onFieldChange,
  onDuplicate,
  onRemove,
  className,
}: RuleConfigPanelProps) {
  const scope = useId();

  return (
    <section
      aria-label={`Configure ${title}`}
      className={cn("flex w-panel max-w-full flex-col gap-3 rounded-card border border-line bg-surface p-3", className)}
    >
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-ui font-medium text-ink">{title}</h3>
          <p className="text-tiny text-ink-muted">{description}</p>
        </div>
        {onDuplicate ? (
          <Button aria-label={`Duplicate ${title}`} onClick={onDuplicate} size="iconSm" variant="ghost">
            <Copy aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
        {onRemove ? (
          <Button aria-label={`Remove ${title}`} onClick={onRemove} size="iconSm" variant="ghost">
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </header>

      <div className="flex flex-col gap-3">
        {fields.map((field) => {
          const fieldId = `${scope}-${field.id}`;
          return (
            <div className="flex flex-col gap-1" key={field.id}>
              <Label htmlFor={fieldId}>{field.label}</Label>
              {field.kind === "text" ? (
                <Input
                  id={fieldId}
                  onChange={(event) => onFieldChange(field.id, event.target.value)}
                  placeholder={field.placeholder}
                  value={field.value}
                />
              ) : null}
              {field.kind === "textarea" ? (
                <Textarea
                  id={fieldId}
                  onChange={(event) => onFieldChange(field.id, event.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                  value={field.value}
                />
              ) : null}
              {field.kind === "select" ? (
                <Select onValueChange={(next) => onFieldChange(field.id, next)} value={field.value}>
                  <SelectTrigger id={fieldId}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {field.hint ? <p className="text-tiny text-ink-muted">{field.hint}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
