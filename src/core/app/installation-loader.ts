import { createServerFn } from "@tanstack/react-start";

/** Only the public environment label crosses the Start boundary. */
export const loadPreviewEnvironment = createServerFn({ method: "GET" }).handler(async () => {
  const [{ requestBindings }, { isPreviewWorker }] = await Promise.all([
    import("../platform/bindings.server"), import("../platform/config/preview"),
  ]);
  return isPreviewWorker(requestBindings());
});
