import { Plus } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Switch,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../ui";
import { StatusColourPicker } from "./StatusColourPicker";
import { StatusVocabularyRow } from "./StatusVocabularyRow";
import type { StatusColourKey, StatusEntry, StatusProfile } from "./types";

export interface StatusVocabularySettingsProps {
  statusProfile: StatusProfile;
  /** The whole vocabulary, stored under both profiles. */
  entries: readonly StatusEntry[];
  /** The key of the entry being renamed, or null. */
  editingKey: string | null;
  onEditingKeyChange: (key: string | null) => void;
  draftLabel: string;
  onDraftLabelChange: (value: string) => void;
  onCommitRename: (key: string) => void;
  onColourChange: (key: string, colour: StatusColourKey) => void;
  onVerificationChange: (key: string, requiresVerification: boolean) => void;
  onRetire: (key: string) => void;
  onBulkChange: (key: string) => void;
  /** The new entry being composed. */
  newLabel: string;
  onNewLabelChange: (value: string) => void;
  newColour: StatusColourKey;
  onNewColourChange: (colour: StatusColourKey) => void;
  newRequiresVerification: boolean;
  onNewRequiresVerificationChange: (value: boolean) => void;
  onAdd: () => void;
}

/**
 * `STAT-001` — the workspace's list of status entries: key, label, colour and
 * verification requirement, with add, rename, recolour and retire. Retiring an entry
 * keeps it on the pages that carry it and offers a bulk change.
 */
export function StatusVocabularySettings(props: StatusVocabularySettingsProps) {
  return (
    <section aria-labelledby="status-vocabulary-heading" className="flex max-w-wide flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-h2 font-semibold text-ink" id="status-vocabulary-heading">
          Page statuses
        </h2>
        <p className="text-ui text-ink-muted">
          Every page can carry one of these. The whole list is stored whichever way the status policy is set:{" "}
          {props.statusProfile === "verification-only"
            ? "this workspace offers only the entries that require verification on a page, and the rest stay here unexposed."
            : "this workspace offers every entry on a page, along with a colour and a custom label."}
        </p>
      </header>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Colour</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>In use</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.entries.map((entry) => (
              <StatusVocabularyRow
                draftLabel={props.draftLabel}
                editing={props.editingKey === entry.key}
                entry={entry}
                key={entry.key}
                onBulkChange={() => props.onBulkChange(entry.key)}
                onCancelRename={() => props.onEditingKeyChange(null)}
                onColourChange={(colour) => props.onColourChange(entry.key, colour)}
                onCommitRename={() => props.onCommitRename(entry.key)}
                onDraftLabelChange={props.onDraftLabelChange}
                onRetire={() => props.onRetire(entry.key)}
                onStartRename={() => props.onEditingKeyChange(entry.key)}
                onVerificationChange={(value) => props.onVerificationChange(entry.key, value)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-tiny text-ink-muted">
        Retiring an entry stops it being offered on new pages. The pages already carrying it keep it, and you
        are offered a bulk change for them.
      </p>

      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
        <h3 className="text-ui font-medium text-ink">Add a status</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="status-new-label">Label</Label>
            <div className="flex items-center gap-1.5">
              <StatusColourPicker
                label="Colour for the new status"
                onChange={props.onNewColourChange}
                value={props.newColour}
              />
              <Input
                className="w-56"
                id="status-new-label"
                onChange={(event) => props.onNewLabelChange(event.target.value)}
                placeholder="Needs an owner"
                value={props.newLabel}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch
              aria-label="The new status requires verification"
              checked={props.newRequiresVerification}
              onCheckedChange={props.onNewRequiresVerificationChange}
            />
            <span className="text-ui text-ink">Requires verification</span>
          </div>
          <Button
            className="mb-0.5"
            disabled={props.newLabel.trim().length === 0}
            onClick={props.onAdd}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add status
          </Button>
        </div>
      </div>
    </section>
  );
}
