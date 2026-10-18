import {embedFrameSources} from '../features/editor/embeds/providers';
import {parseConfig, type EditorConfig} from '../../editor/config';
import type {AppBindings} from './types';
export function editorConfig(bindings: AppBindings): EditorConfig | null {
  if (!bindings.RER_MANAGEMENT_ORIGIN && !bindings.RER_INSTALLATION_ID) return null;
  return parseConfig({enabled: true, managementOrigin: bindings.RER_MANAGEMENT_ORIGIN, installationId: bindings.RER_INSTALLATION_ID});
}
export function editorHeaders(response: Response, bindings: AppBindings): Response {
  if (response.status === 101) return response;
  const config = editorConfig(bindings);
  const headers = new Headers(response.headers);
  const origin = config?.managementOrigin;
  // Additional CSP preserves any existing script/nonces and other policy.
  headers.append('Content-Security-Policy', `base-uri 'self'; object-src 'none'; frame-src 'self' ${embedFrameSources}${origin ? ' ' + origin : ''}; frame-ancestors 'self'${origin ? ' ' + origin : ''}`);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
