import { ChevronDown, Columns3, Copy, Lock, LockOpen, Plus, Settings2, SlidersHorizontal, Trash2, Layers } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../../../ui";
import type { FieldDto } from "../../../../client/records";

/** The saved view's own actions. Every item is disabled while the structure is locked. */
export function ViewMenu({
  hasView,
  locked,
  onSettings,
  onAdd,
  onDuplicate,
  onDelete,
}: {
  hasView: boolean;
  locked: boolean;
  onSettings: () => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="tool" type="button" aria-label="View options">
          <SlidersHorizontal aria-hidden="true" />
          View
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem disabled={locked} onSelect={onSettings}>
          <Settings2 aria-hidden="true" />
          View settings
        </DropdownMenuItem>
        <DropdownMenuItem disabled={locked} onSelect={onAdd}>
          <Plus aria-hidden="true" />
          Add view
        </DropdownMenuItem>
        {hasView ? (
          <>
            <DropdownMenuItem disabled={locked} onSelect={onDuplicate}>
              <Copy aria-hidden="true" />
              Duplicate view
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={locked} onSelect={onDelete}>
              <Trash2 aria-hidden="true" />
              Delete view
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The database's structure: add or edit a field, and lock or unlock the structure. */
export function FieldsMenu({
  fields,
  canEdit,
  canShare,
  locked,
  onAddField,
  onEditField,
  onToggleLock,
}: {
  fields: FieldDto[];
  canEdit: boolean;
  canShare: boolean;
  locked: boolean;
  onAddField: () => void;
  onEditField: (field: FieldDto) => void;
  onToggleLock: () => void;
}) {
  if (!canEdit && !canShare) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="tool" type="button" aria-label="Field options">
          <Columns3 aria-hidden="true" />
          Fields
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[70vh] overflow-y-auto">
        {canEdit ? (
          <>
            <DropdownMenuItem disabled={locked} onSelect={onAddField}>
              <Plus aria-hidden="true" />
              Add field
            </DropdownMenuItem>
            {!locked && fields.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Edit a field</DropdownMenuLabel>
                {fields.map((field) => (
                  <DropdownMenuItem key={field.id} onSelect={() => onEditField(field)}>
                    <Layers aria-hidden="true" />
                    {field.name}
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </>
        ) : null}
        {canShare ? (
          <>
            {canEdit ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={onToggleLock}>
              {locked ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
              {locked ? "Unlock structure" : "Lock structure"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
