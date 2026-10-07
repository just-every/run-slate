import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * The headers a Start server function may read. Only the cookie is carried, so a
 * server function authenticates against exactly what the native session needs.
 */
export function startRequestHeaders(): Headers {
  const cookie = getRequestHeader("cookie");
  return new Headers(cookie ? { cookie } : {});
}
