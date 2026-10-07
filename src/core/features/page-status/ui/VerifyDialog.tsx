import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { SubmitState, VerificationExpiryChoice } from "./types";

export interface VerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The status entry being set, such as "Verified". */
  statusLabel: string;
  /** The revision that would be attested to, such as "Version 12". */
  revisionLabel: string;
  expiry: VerificationExpiryChoice;
  onExpiryChange: (expiry: VerificationExpiryChoice) => void;
  /** The chosen date, when `expiry` is `date`. */
  expiryDate: string;
  onExpiryDateChange: (value: string) => void;
  /**
   * False when this member has not opened the exact revision they would be attesting to
   * (`STAT-003`); the dialog then refuses rather than verifying.
   */
  canAttest: boolean;
  onOpenRevision?: () => void;
  state: SubmitState;
  errorMessage?: string;
  onVerify: () => void;
}

const choices: { value: VerificationExpiryChoice; label: string }[] = [
  { value: "7", label: "In 7 days" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "date", label: "On a date I choose" },
  { value: "none", label: "No expiry" },
];

/** `STAT-003` — setting a status that requires verification. */
export function VerifyDialog(props: VerifyDialogProps) {
  const submitting = props.state === "submitting";
  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set {props.statusLabel}</DialogTitle>
          <DialogDescription>
            You attest to {props.revisionLabel} and become the owner of this verification.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-4 py-3">
          {props.canAttest ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-tiny font-medium text-ink-muted">Expires</legend>
              {choices.map((choice) => (
                <label className="flex items-center gap-2 text-ui text-ink" key={choice.value}>
                  <input
                    checked={props.expiry === choice.value}
                    name="verification-expiry"
                    onChange={() => props.onExpiryChange(choice.value)}
                    type="radio"
                  />
                  {choice.label}
                </label>
              ))}
              {props.expiry === "date" ? (
                <div className="mt-1 flex flex-col gap-1">
                  <Label htmlFor="verification-expiry-date">Expiry date</Label>
                  <Input
                    className="max-w-48"
                    id="verification-expiry-date"
                    onChange={(event) => props.onExpiryDateChange(event.target.value)}
                    type="date"
                    value={props.expiryDate}
                  />
                </div>
              ) : null}
              <p className="text-tiny text-ink-muted">
                When the expiry passes the status reads lapsed rather than verified, and you are notified once.
                Nothing renews it on its own.
              </p>
            </fieldset>
          ) : (
            <div
              className="flex items-start gap-2 rounded-card border border-warn/30 bg-warn-soft p-2.5"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn" />
              <div className="flex flex-col gap-1">
                <p className="text-ui font-medium text-ink">You have not opened {props.revisionLabel}.</p>
                <p className="text-ui text-ink-muted">
                  A {knowledgeNoun("member")} can verify only the exact revision they have read. Open{" "}
                  {props.revisionLabel} and come back.
                </p>
                {props.onOpenRevision ? (
                  <Button
                    className="mt-1 self-start"
                    onClick={props.onOpenRevision}
                    size="sm"
                    variant="secondary"
                  >
                    Open {props.revisionLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {props.state === "error" && props.errorMessage ? (
            <p
              className="flex items-start gap-1.5 rounded-card border border-danger/30 bg-danger-soft p-2.5 text-ui text-danger"
              role="alert"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {props.errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={() => props.onOpenChange(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={submitting || !props.canAttest} onClick={props.onVerify}>
            {submitting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {submitting ? "Verifying" : `Verify ${props.revisionLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
