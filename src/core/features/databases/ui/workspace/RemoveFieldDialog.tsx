import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { FieldDto } from "../../../../client/records";

export function RemoveFieldDialog({ field, onRemove, onClose }: {
  field: FieldDto;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ActionDialog title="Remove this field?" action="Remove field" onClose={onClose} onSubmit={onRemove}>
      <p>Remove “{field.name}” from this database. Records and their other fields are kept.</p>
      <p>Saved views using this field may need updating. Removal is blocked if any records still have retained values in this field or computed fields depend on it. Clear those values and update dependencies first.</p>
    </ActionDialog>
  );
}
