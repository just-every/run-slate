import { WorkspaceTransferJobs } from "../../settings/ui/workspace/WorkspaceTransferJobs";
import { useRef, useState } from "react";
import { FirstRunWizard } from "./FirstRunWizard";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { useWorkspace } from "../../../app/ui/WorkspaceContext";
export function FirstRunPage() {
  const { workspace } = useWorkspace();
  const [restore, setRestore] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [workspaceName, setWorkspaceName] = useState(
    workspace.data?.name ?? "",
  );
  const [containerName, setContainerName] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [addresses, setAddresses] = useState("");
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
      window.location.assign(`/app/pages/${created.current}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }
  if (restore)
    return (
      <div className="slate-app">
        <main className="main restore-workspace">
          <h1 className="title">Restore your existing workspace</h1>
          <WorkspaceTransferJobs restoreOnly />
          <button onClick={() => setRestore(false)}>
            Set up a new workspace
          </button>
        </main>
      </div>
    );
  return (
    <FirstRunWizard
      step={step}
      workspaceName={workspaceName}
      onWorkspaceNameChange={setWorkspaceName}
      containerName={containerName}
      onContainerNameChange={setContainerName}
      firstPageTitle={pageTitle}
      onFirstPageTitleChange={setPageTitle}
      invitationAddresses={addresses}
      onInvitationAddressesChange={setAddresses}
      onBack={() => setStep(step === 3 ? 2 : 1)}
      onNext={() => setStep(step === 1 ? 2 : 3)}
      onSkipInvitations={() => void complete(false)}
      onFinish={() => void complete(true)}
      submitting={pending}
      failure={error}
      onRestore={() => setRestore(true)}
    />
  );
}
