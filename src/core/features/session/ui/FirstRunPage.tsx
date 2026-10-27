import { WorkspaceTransferJobs } from "../../settings/ui/workspace/WorkspaceTransferJobs";
import { PageTitle } from "../../../app/ui/header/PageTitle";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { FirstRunWizard } from "./FirstRunWizard";
import { PaperPage } from "./PaperPage";
import { clearDraft, readDraft, writeDraft } from "./first-run-draft";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { useWorkspace } from "../../../app/ui/WorkspaceContext";
export function FirstRunPage({ owner }: { owner: string }) {
  const { localDevelopment, business } = useWorkspace();
  const [restore, setRestore] = useState(false);
  // The step is mirrored into the address (`/setup?step=2`) and the typed answers kept in this tab's session, so a reload shows
  // the same step with the same answers. The address is only written, never navigated: the form keeps its own state.
  const [step, setStepState] = useState(((useSearch({ strict: false }) as { step?: number }).step ?? 1) as 1 | 2 | 3);
  // Only an owner's answer is a draft; an untouched Business name remains a live prefill.
  const [workspaceNameAnswer, setWorkspaceName] = useState<string | null>(null);
  const workspaceName = workspaceNameAnswer ?? business?.name ?? "";
  const [containerName, setContainerName] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [addresses, setAddresses] = useState("");
  const [restored, setRestored] = useState(false);
  const goTo = (next: 1 | 2 | 3) => {
    setStepState(next);
    window.history.replaceState(window.history.state, "", next === 1 ? "/setup" : `/setup?step=${next}`);
  };
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setWorkspaceName(draft.workspaceName.trim() ? draft.workspaceName : null);
      setContainerName(draft.containerName);
      setPageTitle(draft.pageTitle);
      setAddresses(draft.addresses);
    }
    // An address that skips ahead of what was answered lands on the first open step.
    const reachable = !(draft?.workspaceName.trim() || business?.name.trim()) ? 1 : draft?.containerName.trim() && draft.pageTitle.trim() ? 3 : 2;
    setStepState((current) => {
      const next = Math.min(current, reachable) as 1 | 2 | 3;
      if (next !== current) window.history.replaceState(window.history.state, "", next === 1 ? "/setup" : `/setup?step=${next}`);
      return next;
    });
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) writeDraft({ workspaceName: workspaceNameAnswer ?? "", containerName, pageTitle, addresses });
  }, [restored, workspaceNameAnswer, containerName, pageTitle, addresses]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const key = useRef(operationKey());
  const created = useRef<string | undefined>(undefined);
  const invitations = useRef(new Map<string, string>());
  async function complete(send: boolean) {
    setPending(true);
    setError(undefined);
    try {
      const emails = send
        ? addresses
            .split(/[\n,;]/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      if (emails.some((email) => !/^\S+@\S+\.\S+$/.test(email)))
        throw new Error("Check each email address before continuing.");
      if (!created.current) {
        const result = await mutate<{ value: { pageId: string } }>(
          "/api/workspace/first-run",
          {
            operationKey: key.current,
            workspaceName,
            containerName,
            pageTitle,
          },
        );
        created.current = result.value.pageId;
      }
      for (const email of emails) {
        let invitationKey = invitations.current.get(email);
        if (!invitationKey) {
          invitationKey = operationKey();
          invitations.current.set(email, invitationKey);
        }
        await mutate("/api/invitations", {
          operationKey: invitationKey,
          email,
          kind: "member",
        });
      }
      clearDraft();
      window.location.assign(`/app/pages/${created.current}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }
  if (restore)
    return (
      <PaperPage owner={owner}>
        <div className="slate-app paper-restore">
          <div className="main restore-workspace">
            <PageTitle>Restore your existing workspace</PageTitle>
            <WorkspaceTransferJobs restoreOnly />
            <button className="paper-pill paper-pill--quiet" onClick={() => setRestore(false)} type="button">
              Set up a new workspace
            </button>
          </div>
        </div>
      </PaperPage>
    );
  return (
    <FirstRunWizard
      localDevelopment={localDevelopment}
      step={step}
      workspaceName={workspaceName}
      onWorkspaceNameChange={setWorkspaceName}
      containerName={containerName}
      onContainerNameChange={setContainerName}
      firstPageTitle={pageTitle}
      onFirstPageTitleChange={setPageTitle}
      invitationAddresses={addresses}
      onInvitationAddressesChange={setAddresses}
      onBack={() => goTo(step === 3 ? 2 : 1)}
      onNext={() => goTo(step === 1 ? 2 : 3)}
      owner={owner}
      onSkipInvitations={() => void complete(false)}
      onFinish={() => void complete(true)}
      submitting={pending}
      failure={error}
      onRestore={() => setRestore(true)}
    />
  );
}
