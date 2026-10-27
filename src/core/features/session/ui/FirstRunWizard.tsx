import { useEffect, useId, useState } from "react";
import { PaperPage, PaperScene } from "./PaperPage";
import { FirstRunProgress, type FirstRunStep } from "./FirstRunProgress";
import { containerNoun, sentenceCase } from "./nouns";
import { LocalInvitationNotice } from "../../settings/ui/workspace/LocalInvitationNotice";

export interface FirstRunWizardProps {
  step: FirstRunStep;
  workspaceName: string;
  onWorkspaceNameChange: (next: string) => void;
  containerName: string;
  onContainerNameChange: (next: string) => void;
  firstPageTitle: string;
  onFirstPageTitleChange: (next: string) => void;
  /** One address per line. The step can be skipped entirely. */
  invitationAddresses: string;
  onInvitationAddressesChange: (next: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkipInvitations: () => void;
  onFinish: () => void;
  onRestore?: () => void;
  /** The signed-in owner's own address, shown in the header. */
  owner?: string;
  submitting?: boolean;
  failure?: string | null;
  className?: string;
  localDevelopment?: boolean;
}

/**
 * `WORK-013` — the wizard a new deployment runs once: it names the workspace,
 * creates the first container and its first page, and ends on an invitation
 * step that can be skipped.
 *
 * It creates nothing beyond those three records, and the closing line says so
 * rather than leaving the member to wonder what else it touched.
 */
export function FirstRunWizard({
  step,
  workspaceName,
  onWorkspaceNameChange,
  containerName: containerNameValue,
  onContainerNameChange,
  firstPageTitle,
  onFirstPageTitleChange,
  invitationAddresses,
  onInvitationAddressesChange,
  onBack,
  onNext,
  onSkipInvitations,
  onFinish,
  onRestore,
  owner,
  submitting = false,
  failure,
  className,
  localDevelopment = false,
}: FirstRunWizardProps) {
  const fieldId = useId();
  // Controlled fields cannot accept input until their client handlers exist.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  useEffect(() => {
    if (interactive && step < 3) document.getElementById(`${fieldId}-${step === 1 ? "workspace" : "container"}`)?.focus();
  }, [interactive, step, fieldId]);
  const hasInvitations = invitationAddresses.trim().length > 0;
  const workspaceNameLength = [...workspaceName.trim()].length;
  const workspaceNameError = step === 1 && workspaceNameLength > 200
    ? "Workspace names must contain 1–200 characters."
    : null;
  const canContinue =
    step === 1
      ? workspaceNameLength > 0 && workspaceNameLength <= 200
      : step === 2
        ? containerNameValue.trim().length > 0 && firstPageTitle.trim().length > 0
        : true;

  const hint = step === 1 ? "Enter your workspace name to continue." : "Enter a space name and first page title to continue.";

  return (
    <PaperPage className={className} owner={owner}>
      <div className="paper-columns paper-columns--rail">
        <FirstRunProgress step={step} />

        <div className="paper-body">
          {step === 1 ? (
            <section className="paper-body">
              <h1 className="paper-title">Name this workspace</h1>
              <p className="paper-lede">You can rename it later in settings.</p>
              <div className="paper-field">
                <label htmlFor={`${fieldId}-workspace`}>Workspace name</label>
                <input
                  aria-describedby={workspaceNameError ? `${fieldId}-workspace-error` : undefined}
                  aria-invalid={Boolean(workspaceNameError)}
                  autoFocus
                  className="paper-input"
                  disabled={!interactive || submitting}
                  id={`${fieldId}-workspace`}
                  onChange={(event) => onWorkspaceNameChange(event.target.value)}
                  value={workspaceName}
                />
                {workspaceNameError ? <p className="paper-note" id={`${fieldId}-workspace-error`} role="alert">{workspaceNameError}</p> : null}
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="paper-body">
              <h1 className="paper-title">Create the first {containerNoun}</h1>
              <p className="paper-lede">Keep related pages together in a {containerNoun}.</p>
              <div className="paper-field">
                <label htmlFor={`${fieldId}-container`}>{sentenceCase(containerNoun)} name</label>
                <input
                  autoFocus
                  className="paper-input"
                  disabled={!interactive || submitting}
                  id={`${fieldId}-container`}
                  onChange={(event) => onContainerNameChange(event.target.value)}
                  value={containerNameValue}
                />
              </div>
              <div className="paper-field">
                <label htmlFor={`${fieldId}-page`}>First page title</label>
                <input
                  className="paper-input"
                  disabled={!interactive || submitting}
                  id={`${fieldId}-page`}
                  onChange={(event) => onFirstPageTitleChange(event.target.value)}
                  value={firstPageTitle}
                />
              </div>
              <p className="paper-note">Everyone with active workspace membership can view the first page.</p>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="paper-body">
              <h1 className="paper-title">Invite people</h1>
              <p className="paper-lede">Optional. One address per line. Invitations expire after 7 days and can be used once.</p>
              {localDevelopment ? <LocalInvitationNotice /> : null}
              <div className="paper-field">
                <label htmlFor={`${fieldId}-invitations`}>Email addresses</label>
                <textarea
                  className="paper-input"
                  disabled={!interactive || submitting}
                  id={`${fieldId}-invitations`}
                  onChange={(event) => onInvitationAddressesChange(event.target.value)}
                  value={invitationAddresses}
                />
              </div>
            </section>
          ) : null}

          {failure ? (
            <div className="paper-alert" role="alert">
              <strong>Slate could not finish this step.</strong>
              <span>{failure}</span>
            </div>
          ) : null}

          <div className="paper-actions">
            {step > 1 ? (
              <button className="paper-pill paper-pill--quiet" disabled={!interactive || submitting} onClick={onBack} type="button">
                Back
              </button>
            ) : null}
            {step < 3 ? (
              <button className="paper-pill" disabled={!interactive || submitting || !canContinue} onClick={onNext} type="button">
                Continue
              </button>
            ) : (
              <>
                {hasInvitations ? (
                  <button className="paper-pill" disabled={!interactive || submitting} onClick={onFinish} type="button">
                    {localDevelopment
                      ? submitting ? "Recording locally…" : "Record invitations locally and finish"
                      : submitting ? "Sending the invitations…" : "Send the invitations and finish"}
                  </button>
                ) : null}
                <button className={`paper-pill${hasInvitations ? " paper-pill--quiet" : ""}`} disabled={!interactive || submitting} onClick={onSkipInvitations} type="button">
                  {submitting && !hasInvitations ? "Creating workspace…" : "Skip this step"}
                </button>
              </>
            )}
            {!canContinue && !workspaceNameError ? <p className="paper-note">{hint}</p> : null}
          </div>

          {step === 1 && onRestore ? (
            <div className="paper-actions">
              <button className="paper-pill paper-pill--quiet" disabled={!interactive || submitting} onClick={onRestore} type="button">
                Restore an existing workspace
              </button>
            </div>
          ) : null}
          <p className="paper-note paper-foot">
            This setup runs once. It creates your workspace, one {containerNoun} and one page, and nothing else.
          </p>
        </div>

        <PaperScene />
      </div>
    </PaperPage>
  );
}
