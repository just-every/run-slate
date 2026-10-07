import {localDateTime} from "../../../../app/ui/localDateTime";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { FieldDto } from "../../../../client/records";
export function RecordValueDialog({
  field,
  value,
  onSave,
  onClose,
}: {
  field: FieldDto;
  value: unknown;
  onSave: (value: unknown) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ActionDialog
      title={`Edit ${field.name}`}
      action="Save value"
      onClose={onClose}
      onSubmit={async (form) => {
        let next: unknown = form.get("value");
        if (field.type === "number") next = next === "" ? null : Number(next);
        if (field.type === "checkbox") next = next === "on";
        if (field.type === "multi-select") next = form.getAll("value");
        if (field.type === "date" && next)
          next = new Date(String(next)).toISOString();
        await onSave(next);
      }}
    >
      <label>
        {field.name}
        {field.type === "checkbox" ? (
          <input name="value" type="checkbox" defaultChecked={value === true} />
        ) : ["select", "status", "multi-select"].includes(field.type) ? (
          <select
            name="value"
            multiple={field.type === "multi-select"}
            defaultValue={
              field.type === "multi-select"
                ? ((value as string[]) ?? [])
                : String(value ?? "")
            }
          >
            <option value="">Empty</option>
            {(Array.isArray(field.config.options)
              ? field.config.options
              : []
            ).map((raw, index) => {
              const option =
                typeof raw === "string"
                  ? { id: raw, label: raw }
                  : (raw as { id: string; label: string });
              return (
                <option key={option.id ?? index} value={option.id}>
                  {option.label}
                </option>
              );
            })}
          </select>
        ) : (
          <input
            name="value"
            type={
              field.type === "number"
                ? "number"
                : field.type === "date"
                  ? "datetime-local"
                  : field.type === "email"
                    ? "email"
                    : field.type === "url"
                      ? "url"
                      : "text"
            }
            step="any"
            defaultValue={
              field.type === "date" && value
                ? localDateTime(String(value))
                : String(value ?? "")
            }
          />
        )}
      </label>
    </ActionDialog>
  );
}
