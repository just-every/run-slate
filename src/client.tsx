import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { createRecoverableErrorHandler } from "./base/runtime/hydration/report";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    { onRecoverableError: createRecoverableErrorHandler() },
  );
});
