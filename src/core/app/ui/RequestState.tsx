import type { ReactNode } from "react";
import { ApiError, errorMessage } from "../../client/transport";

export function RequestState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error?: unknown;
  retry?: () => void;
  children?: ReactNode;
}) {
  if (error)
    return (
      <div className="request-notice" role="alert">
        <h2>
          {error instanceof ApiError && [403, 404].includes(error.status)
            ? "Content unavailable"
            : "We couldn’t finish that request"}
        </h2>
        <p>{errorMessage(error)}</p>
        {error instanceof ApiError && error.status === 401 ? (
          <a href="/signin">Sign in again</a>
        ) : retry && !(error instanceof ApiError && [403,404].includes(error.status)) ? (
          <button type="button" onClick={retry}>
            Try again
          </button>
        ) : null}
      </div>
    );
  if (loading)
    return (
      <p className="request-loading" role="status">
        Loading…
      </p>
    );
  return <>{children}</>;
}
