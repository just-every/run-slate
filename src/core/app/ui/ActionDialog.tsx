import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { errorMessage } from "../../client/transport";

/** Native modal supplies focus containment and Escape; failed submission keeps input. */
export function ActionDialog({
  title,
  children,
  action,
  onSubmit,
  onClose,
  initialFocus,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  action: string;
  onSubmit: (data: FormData) => Promise<void | boolean>;
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Work started by the dialog continues outside it (e.g. the browser is leaving); keeps it disabled. */
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = submitting || busy;
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const previous = document.activeElement;
    const modal = dialog.current;
    modal?.showModal();
    const target = initialFocus?.current;
    if (target && modal?.contains(target)) target.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [initialFocus]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(undefined);
    try {
      const close = await onSubmit(data);
      if (close !== false) onClose();
      else setSubmitting(false);
    } catch (cause) {
      setError(cause);
      setSubmitting(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="folio-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <h2>{title}</h2>
          <button
            aria-label="Close dialog"
            type="button"
            disabled={pending}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <fieldset disabled={pending}>{children}</fieldset>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
        <footer>
          <button type="button" disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : action}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
