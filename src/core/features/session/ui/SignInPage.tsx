import { useEffect, useRef, useState } from "react";
import { requestJson } from "../../../api/request";
import { SignInScreen } from "./SignInScreen";
import { PaperPage, PaperScene } from "./PaperPage";

import type { SignInCapabilities } from '../capabilities';

/** Base starts provider sign-in only from a same-origin POST. */
function startIdentityProvider() {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/auth/oidc/identity/start";
  document.body.appendChild(form);
  form.submit();
}

/** Public capabilities are request-specific first-response content. */
export function SignInPage({ capabilities, requested = false }: { next: string; capabilities: SignInCapabilities; requested?: boolean }) {
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<
    "queued" | "sent" | "failed" | "uncertain" | "unconfirmed" | null
  >(requested ? "unconfirmed" : null);
  const requestKey = useRef<string | null>(null);
  useEffect(() => {
    if (delivery !== "queued" || !requestKey.current) return;
    let alive = true;
    const timer = setInterval(() => {
      requestJson<{
        state: "queued" | "sent" | "failed" | "uncertain" | "unconfirmed";
        errorDetail?: string;
      }>("/api/auth/magic/status", {
        method: "POST",
        body: { email, requestKey: requestKey.current },
      })
        .then((result) => {
          if (alive) {
            setDelivery(result.state);
            if (result.state === "failed")
              setFailure(result.errorDetail ?? "Delivery failed.");
          }
        })
        .catch((cause) => {
          if (alive) {
            setFailure(
              cause instanceof Error
                ? cause.message
                : "Delivery status could not be checked.",
            );
            setDelivery("unconfirmed");
          }
        });
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [delivery, email]);

  if (capabilities?.mailDelivery)
    return (
      <SignInScreen
        localOutbox={capabilities.localOutbox}
        email={email}
        onEmailChange={(value) => {
          setEmail(value);
          requestKey.current = null;
          setDelivery(null);
        }}
        state={
          delivery === "sent"
            ? "sent"
            : failure
              ? "delivery-failed"
              : delivery === "queued"
                ? "pending"
                : delivery === "unconfirmed" || delivery === "uncertain"
                  ? "unconfirmed"
                  : "request"
        }
        deliveryError={failure}
        submitting={submitting}
        onUseAnotherAddress={() => {
          setDelivery(null);
          requestKey.current = null;
          setFailure(null);
        }}
        identityProvider={
          capabilities.identityProvider
            ? {
                name: "your identity provider",
                onSignIn: startIdentityProvider,
              }
            : null
        }
        onSubmit={() => {
          setSubmitting(true);
          setFailure(null);
          requestKey.current ??= crypto.randomUUID();
          requestJson("/api/auth/magic", {
            method: "POST",
            body: { email, requestKey: requestKey.current },
          })
            .then(() => setDelivery("queued"))
            .catch((cause: unknown) =>
              setFailure(
                cause instanceof Error
                  ? cause.message
                  : "The sign-in request failed.",
              ),
            )
            .finally(() => setSubmitting(false));
        }}
      />
    );

  return (
    <PaperPage>
      <div className="paper-columns">
        <div className="paper-body paper-body--narrow">
          <h1 className="paper-title">Your workspace is private.</h1>
          <p className="paper-lede">
            Email sign-in is not configured for this deployment yet. Slate has not
            sent an email.
          </p>
          <div className="paper-alert">
            Configure Slate’s mail adapter to deliver magic links in a deployed
            workspace.
          </div>

          {capabilities?.identityProvider ? (
            <div className="paper-actions">
              <button className="paper-pill" onClick={startIdentityProvider} type="button">
                Continue with your identity provider
              </button>
            </div>
          ) : null}

          {failure ? <p className="paper-alert" role="alert">{failure}</p> : null}
        </div>
        <PaperScene />
      </div>
    </PaperPage>
  );
}
