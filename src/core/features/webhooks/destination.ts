import { ApiProblem } from '../../app/problems';
import { publicIp, publicPreviewTransport } from '../editor/link-preview';

/** Uses the existing public-address test and DNS transport; POSTs never follow redirects. */
export async function validateDestination(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw refused(); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.hash || !host.includes('.') && !host.includes(':') || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|home|lan|onion)$/.test(host)) throw refused();
  const literal = /^[\d.]+$/.test(host) || host.startsWith('[');
  const addresses = literal ? [host] : await publicPreviewTransport.resolve(host);
  if (!addresses.length || addresses.some(address => !publicIp(address))) throw refused();
  return url;
}
const refused = () => new ApiProblem(400, 'DESTINATION_REFUSED', 'Use a public HTTPS destination on port 443, without credentials or a fragment.');
