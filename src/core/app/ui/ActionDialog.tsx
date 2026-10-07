import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { errorMessage } from "../../client/transport";

/** Native modal supplies focus containment and Escape; failed submission keeps input. */
export function ActionDialog({
  title,
  children,
  action,
  onSubmit,
  onClose,
}: {
  title: string;
  children: ReactNode;
  action: string;
  onSubmit: (data: FormData) => Promise<void | boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      const close = await onSubmit(data);
      if (close !== false) onClose();
      else setPending(false);
    } catch (cause) {
      setError(cause);
      setPending(false);
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
