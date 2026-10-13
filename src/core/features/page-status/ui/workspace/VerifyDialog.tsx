import { useState } from "react";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { VerificationExpiryChoice } from "../types";

const choices: { value: VerificationExpiryChoice; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "date", label: "On a date" },
  { value: "none", label: "No expiry" },
];

/** A chosen date lasts to the end of that day where the verifier is. */
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

/**
 * STAT-003: one person attests the exact revision they opened, with an expiry of 7, 30
 * or 90 days (counted by the server), a date, or none. The server refuses an unopened or
 * outdated revision; the dialog shows its reason.
 */
export function VerifyDialog({ pageId, statusKey, expectedRevisionId, attestRevisionId, openedCurrent, onClose, onVerified }: {
  pageId: string;
  statusKey: string;
  expectedRevisionId: string;
  attestRevisionId: string;
  openedCurrent?: boolean;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
}) {
  const [choice, setChoice] = useState<VerificationExpiryChoice>("90");
  return (
    <ActionDialog
      title="Verify this exact revision"
      action="I reviewed this revision"
      onClose={onClose}
      onSubmit={async (data) => {
        const date = String(data.get("expiryDate") ?? "");
        if (choice === "date" && !date) throw new Error("Choose the date the verification expires.");
        await mutate(`/api/status/page/${pageId}`, {
          operationKey: operationKey(),
          expectedRevisionId,
          statusKey,
          attestRevisionId,
          ...(choice === "date" ? { expiresAt: endOfDay(date) } : choice === "none" ? { expiresAt: null } : { expiresInDays: Number(choice) }),
        });
        await onVerified();
      }}
    >
      <p>
        You confirm that you read this page as it is now and that it is right.
        Slate records you as its verifier. No automated check can do this for you.
      </p>
      {openedCurrent === false ? (
        <p className="verify-warning">
          You have not opened the current version of this page yet, so Slate will
          refuse this. Open the page, read it as it is now, then verify it.
        </p>
      ) : null}
      <fieldset className="verify-expiry">
        <legend>Verification expires after</legend>
        {choices.map((item) => (
          <label key={item.value}>
            <input type="radio" name="expiry" value={item.value} checked={choice === item.value} onChange={() => setChoice(item.value)} />
            {item.label}
          </label>
        ))}
        {choice === "date" ? (
          <label>
            Expiry date
            <input name="expiryDate" type="date" min={today()} required />
          </label>
        ) : null}
      </fieldset>
    </ActionDialog>
  );
}
