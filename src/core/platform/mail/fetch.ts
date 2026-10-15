/** Preserve Base's redirect refusal using the modes workerd supports. */
export async function fetchMail(input: RequestInfo | URL, init?: RequestInit, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<Response> {
  const refuseRedirects = init?.redirect === 'error';
  const response = await fetcher(input, refuseRedirects ? { ...init, redirect: 'manual' } : init);
  if (refuseRedirects && response.status >= 300 && response.status < 400) {
    throw new TypeError('Mail transport refused a redirect.');
  }
  return response;
}
