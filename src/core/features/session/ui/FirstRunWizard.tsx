import { useId } from "react";
import { Button, ErrorState, Input, Textarea } from "../../../ui";
import { FirstRunProgress, type FirstRunStep } from "./FirstRunProgress";
import { containerNoun, sentenceCase } from "./nouns";

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
  onRestore?:()=>void;
  submitting?: boolean;
  failure?: string | null;
  className?: string;
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
  submitting = false,
  failure,
  className,
}: FirstRunWizardProps) {
  const fieldId = useId();
  const hasInvitations = invitationAddresses.trim().length > 0;
  const canContinue =
    step === 1
      ? workspaceName.trim().length > 0
      : step === 2
        ? containerNameValue.trim().length > 0 && firstPageTitle.trim().length > 0
        : true;

  return (
    <main className={className}>
      <div className="mx-auto flex min-h-screen w-full max-w-reading flex-col justify-center gap-6 px-5 py-12">
        <FirstRunProgress step={step} />

        {step === 1 ? (
          <section className="flex flex-col gap-3">
            <h1 className="text-h2 font-semibold tracking-tight text-ink">Name this workspace</h1>
            <p className="text-ui text-ink-muted">
              You can rename it later in settings.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-workspace`}>
                Workspace name
              </label>
              <Input
                autoFocus
                className="h-10"
                id={`${fieldId}-workspace`}
                onChange={(event) => onWorkspaceNameChange(event.target.value)}
                placeholder="Northwind Field Operations"
                value={workspaceName}
              />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-col gap-3">
            <h1 className="text-h2 font-semibold tracking-tight text-ink">
              Create the first {containerNoun}
            </h1>
            <p className="text-ui text-ink-muted">
              Keep related pages together in a {containerNoun}.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-container`}>
                {sentenceCase(containerNoun)} name
              </label>
              <Input
                autoFocus
                className="h-10"
                id={`${fieldId}-container`}
                onChange={(event) => onContainerNameChange(event.target.value)}
                placeholder="Customer Success"
                value={containerNameValue}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-page`}>
                First page title
              </label>
              <Input
                className="h-10"
                id={`${fieldId}-page`}
                onChange={(event) => onFirstPageTitleChange(event.target.value)}
                placeholder="How we handle an escalation"
                value={firstPageTitle}
              />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-col gap-3">
            <h1 className="text-h2 font-semibold tracking-tight text-ink">Invite people</h1>
            <p className="text-ui text-ink-muted">
              Optional. One address per line. Invitations expire after 24 hours and can be used once.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-tiny font-medium text-ink-muted" htmlFor={`${fieldId}-invitations`}>
                Email addresses
              </label>
              <Textarea
                className="min-h-28"
                id={`${fieldId}-invitations`}
                onChange={(event) => onInvitationAddressesChange(event.target.value)}
                placeholder={"rosa.medina@example.com\ndaniel.okafor@example.com"}
                value={invitationAddresses}
              />
            </div>
          </section>
        ) : null}

        {failure ? <ErrorState detail={failure} title="Slate could not finish this step." /> : null}

        <div className="flex flex-wrap items-center gap-2">
          {step > 1 ? (
            <Button disabled={submitting} onClick={onBack} variant="secondary">
              Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button disabled={submitting || !canContinue} onClick={onNext}>
              Continue
            </Button>
          ) : (
            <>
              {hasInvitations ? <Button disabled={submitting} onClick={onFinish}>
                {submitting ? "Sending the invitations…" : "Send the invitations and finish"}
              </Button> : null}
              <Button disabled={submitting} onClick={onSkipInvitations} variant={hasInvitations ? "ghost" : "primary"}>
                {submitting && !hasInvitations ? "Creating workspace…" : "Skip this step"}
              </Button>
            </>
          )}
        </div>

        {step===1&&onRestore?<Button onClick={onRestore} variant="ghost">Restore an existing workspace</Button>:null}
        <p className="text-tiny text-ink-faint">
          This setup runs once. It creates your workspace, one {containerNoun} and one page, and nothing else.
        </p>
      </div>
    </main>
  );
}
