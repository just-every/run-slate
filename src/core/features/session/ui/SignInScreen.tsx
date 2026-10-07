import { AlertTriangle, Mail } from "lucide-react";
import { useId } from "react";
import { Button, Input, cn } from "../../../ui";

/**
 * The four states the magic-link sign-in screen has.
 *
 * `delivery-failed` is the one that matters most: `MAIL-002` requires the
 * provider's error to be shown to the person and forbids reporting the message
 * as sent. It is a separate state from `sent` for exactly that reason.
 */
export type SignInScreenState =
  "request" | "pending" | "unconfirmed" | "sent" | "link-expired" | "delivery-failed";

export function SignInScreen({
  state,
  email,
  onEmailChange,
  onSubmit,
  onUseAnotherAddress,
  submitting = false,
  deliveryError,
  identityProvider,
  productName,
  productMark,
  className,
}: {
  state: SignInScreenState;
  email: string;
  onEmailChange: (next: string) => void;
  onSubmit: () => void;
  onUseAnotherAddress: () => void;
  submitting?: boolean;
  /** `MAIL-002` — the provider's own error, shown verbatim. */
  deliveryError?: string | null;
  /** `WORK-015` — offered only when a provider is configured and working. */
  identityProvider?: { name: string; onSignIn: () => void } | null;
  productName: string;
  productMark: string;
  className?: string;
}) {
  const fieldId = useId();
  const showsForm =
    state === "request" ||
    state === "link-expired" ||
    state === "delivery-failed";

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-canvas px-5 py-12",
        className,
      )}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-control bg-ink text-tiny font-semibold text-ink-inverse"
          >
            {productMark}
          </span>
          <span className="text-ui font-semibold text-ink">{productName}</span>
        </div>

        <h1 className="mt-8 text-h2 font-semibold tracking-tight text-ink">
          {state === "sent" ? "Check your email" : "Sign in"}
        </h1>

        {state === "link-expired" ? (
          <p className="mt-2 text-ui text-ink-muted">
            That link has been used already or is more than an hour old. A
            sign-in link works once. Ask for a new one.
          </p>
        ) : null}

        {state === "pending" || state === "unconfirmed" ? <div className="mt-4 flex flex-col gap-3" role="status"><p>{state === "pending" ? "Your sign-in email is queued. We’ll show delivery status here." : "Your request was received. If this address can sign in, check its inbox. Delivery has not been confirmed here."}</p><Button onClick={onUseAnotherAddress} variant="link">Use a different address</Button></div> : null}
        {state === "sent" ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="flex items-start gap-2 rounded-card border border-line bg-sidebar px-3 py-2.5 text-ui text-ink">
              <Mail
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-ink-muted"
              />
              <span>
                A sign-in link is on its way to{" "}
                <span className="font-medium">{email}</span>. It works once and
                stops working an hour after it was sent.
              </span>
            </p>
            <Button
              className="self-start"
              onClick={onUseAnotherAddress}
              variant="link"
            >
              Use a different address
            </Button>
          </div>
        ) : null}

        {state === "delivery-failed" ? (
          <div
            className="mt-4 flex flex-col gap-1.5 rounded-card border border-danger/30 bg-danger-soft p-3"
            role="alert"
          >
            <p className="flex items-center gap-1.5 text-ui font-medium text-danger">
              <AlertTriangle aria-hidden="true" className="size-4" />
              The email was not sent
            </p>
            <p className="text-ui text-ink-muted">
              The mail provider did not confirm delivery. You can request
              another link when the problem is resolved.
            </p>
            {deliveryError ? (
              <p className="rounded-control bg-canvas px-2 py-1 font-mono text-tiny text-ink-muted">
                {deliveryError}
              </p>
            ) : null}
          </div>
        ) : null}

        {showsForm ? (
          <form
            className="mt-6 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label
              className="text-tiny font-medium text-ink-muted"
              htmlFor={fieldId}
            >
              Email address
            </label>
            <Input
              autoComplete="email"
              className="h-10"
              disabled={submitting}
              id={fieldId}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <Button
              className="mt-1"
              disabled={submitting || email.trim().length === 0}
              size="lg"
              type="submit"
            >
              {submitting ? "Sending the link…" : "Email me a sign-in link"}
            </Button>
          </form>
        ) : null}

        {identityProvider ? (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
              <span className="text-tiny text-ink-faint">or</span>
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </div>
            <Button
              onClick={identityProvider.onSignIn}
              size="lg"
              variant="secondary"
            >
              Continue with {identityProvider.name}
            </Button>
          </div>
        ) : null}

        <p className="mt-8 text-tiny text-ink-faint">
          Slate stores no password, so there is nothing to reset. Access to your
          mailbox is what signs you in.
        </p>
      </div>
    </main>
  );
}
