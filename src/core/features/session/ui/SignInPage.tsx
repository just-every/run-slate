import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { requestJson } from "../../../api/request";
import { Button } from "../../../ui/button";
import { ownerIdentity } from "../../../app/ext-client";
import { SignInScreen } from "./SignInScreen";

interface Capabilities {
  localSession: boolean;
  mailDelivery: boolean;
  identityProvider: boolean;
}

/**
 * The sign-in document renders server-side. The capability probe stays a client
 * request against the public Hono endpoint: it reports what this deployment can
 * offer, and it is not first-response content.
 */
export function SignInPage({ next }: { next: string }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<
    "queued" | "sent" | "failed" | "uncertain" | "unconfirmed" | null
  >(null);
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

  useEffect(() => {
    let active = true;
    requestJson<Capabilities>("/api/auth/capabilities")
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setFailure(
            cause instanceof Error
              ? cause.message
              : "Slate could not check available sign-in methods.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function openLocalWorkspace() {
    setSubmitting(true);
    setFailure(null);
    try {
      const result = await requestJson<{ next: string }>(
        "/api/auth/local-sign-in",
        { method: "POST", body: { next } },
      );
      window.location.assign(result.next);
    } catch (cause) {
      setFailure(
        cause instanceof Error
          ? cause.message
          : "Slate could not start a local session.",
      );
      setSubmitting(false);
    }
  }

  if (capabilities?.mailDelivery)
    return (
      <SignInScreen
        productName={ownerIdentity.name}
        productMark={ownerIdentity.mark}
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
                onSignIn: () => window.location.assign("/api/auth/identity"),
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
    <main className="grid min-h-screen place-items-center bg-stone-100 px-5 py-10 text-stone-900">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-[0_20px_55px_rgba(41,37,36,0.10)] sm:p-10">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-stone-700 hover:text-stone-950"
          to="/"
        >
          <span className="grid size-7 place-items-center rounded-md bg-stone-900 text-xs text-white">
            {ownerIdentity.mark}
          </span>
          {ownerIdentity.name}
        </Link>
        <p className="mt-10 text-xs font-bold tracking-[0.15em] text-stone-500">
          SIGN IN
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-stone-950">
          Your workspace is private.
        </h1>
        <p className="mt-4 leading-7 text-stone-600">
          Email sign-in is not configured for this deployment yet. Slate has not
          sent an email.
        </p>

        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Configure Slate’s mail adapter to deliver magic links in a deployed
          workspace.
        </div>

        {capabilities?.localSession ? (
          <div className="mt-8">
            <Button
              className="w-full"
              data-testid="local-sign-in"
              disabled={submitting}
              onClick={openLocalWorkspace}
              type="button"
            >
              {submitting ? "Opening local workspace…" : "Open local workspace"}
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-stone-500">
              Private preview on this machine. Changes stay here.
            </p>
          </div>
        ) : null}
        {capabilities?.identityProvider ? (
          <Button onClick={() => window.location.assign("/api/auth/identity")}>
            Continue with your identity provider
          </Button>
        ) : null}

        {failure ? (
          <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {failure}
          </p>
        ) : null}
        {capabilities === null && !failure ? (
          <p className="mt-6 text-sm text-stone-500">
            Checking local sign-in availability…
          </p>
        ) : null}
      </section>
    </main>
  );
}
