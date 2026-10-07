export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...init } = options;
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => null) as { message?: string; code?: string } | T | null;
  if (!response.ok) {
    const error = payload as { message?: string; code?: string } | null;
    throw new ApiError(error?.message ?? `Request failed (${response.status}).`, response.status, error?.code);
  }
  return payload as T;
}
