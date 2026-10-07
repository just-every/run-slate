import { contentLimits } from './limits';
import { ApiProblem } from '../../app/problems';
import { parse } from 'parse5';
export interface PreviewTransport {
    resolve(hostname: string): Promise<string[]>;
    get(url: string, options: {
        signal: AbortSignal;
    }): Promise<Response>;
}
export function publicIp(address: string) {
    const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
    if (ip.includes(':'))
        return /^[0-9a-f:]+$/.test(ip) && !/^::|^fc|^fd|^fe[89ab]|^ff|^2001:db8|^2001:0:/.test(ip) && !ip.includes('ffff');
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255))
        return false;
    const [a, b] = parts;
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 || a! >= 224 || a === 100 && b! >= 64 && b! <= 127);
}
async function allowed(raw: string, transport: PreviewTransport) {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || u.hostname.endsWith('.localhost') || !u.hostname.includes('.'))
        throw new ApiProblem(400, 'PREVIEW_REFUSED', 'Only public HTTPS URLs are previewed.');
    const addresses = /^[\d.]+$/.test(u.hostname) ? [u.hostname] : await transport.resolve(u.hostname);
    if (!addresses.length || addresses.some(a => !publicIp(a)))
        throw new ApiProblem(400, 'PREVIEW_REFUSED', 'Private and local destinations cannot be previewed.');
    return u;
}
export async function previewLink(raw: string, transport: PreviewTransport) {
    const started = Date.now(), controller = new AbortController(), timer = setTimeout(() => controller.abort(), contentLimits.maximumUrlFetchSeconds * 1000);
    try {
        let url = await allowed(raw, transport);
        for (let hop = 0; hop <= contentLimits.maximumUrlFetchRedirects; hop++) {
            const response = await transport.get(url.href, { signal: controller.signal });
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location || hop === contentLimits.maximumUrlFetchRedirects)
                    throw new ApiProblem(400, 'PREVIEW_REFUSED', 'Too many redirects.');
                url = await allowed(new URL(location, url).href, transport);
                continue;
            }
            if (!response.ok || !contentLimits.allowedFetchMediaTypes.includes((response.headers.get('content-type') ?? '').split(';')[0]!.trim()))
                throw new ApiProblem(400, 'PREVIEW_FAILED', 'The destination did not return an HTML page.');
            const reader = response.body?.getReader();
            if (!reader)
                throw new ApiProblem(400, 'PREVIEW_FAILED', 'Empty response.');
            const chunks: Uint8Array[] = [], decoder = new TextDecoder();
            let bytes = 0, body = '';
            while (true) {
                const part = await reader.read();
                if (part.done)
                    break;
                bytes += part.value.byteLength;
                if (bytes > contentLimits.maximumUrlFetchBytes || Date.now() - started > contentLimits.maximumUrlFetchSeconds * 1000) {
                    await reader.cancel();
                    throw new ApiProblem(400, 'PREVIEW_REFUSED', 'Preview exceeds the size or time limit.');
                }
                body += decoder.decode(part.value, { stream: true });
            }
            body += decoder.decode();
            const doc = parse(body);
            let title = '', description = '';
            function visit(node: any) {
                if (node.tagName === 'title')
                    title = (node.childNodes ?? []).map((x: any) => x.value ?? '').join('');
                if (node.tagName === 'meta') {
                    const a = Object.fromEntries(node.attrs.map((a: any) => [a.name, a.value]));
                    if (a.name === 'description' || a.property === 'og:description')
                        description = a.content ?? description;
                }
                for (const child of node.childNodes ?? [])
                    visit(child);
            }
            visit(doc);
            return { url: raw, previewState: 'ready', display: 'card', preview: { title: title.slice(0, 500), description: description.slice(0, 2000) } };
        }
        throw new ApiProblem(400, 'PREVIEW_FAILED', 'Preview failed.');
    }
    finally {
        clearTimeout(timer);
    }
}
/** DNS is inspected before each anonymous, bodyless fetch; redirects are never followed by fetch. */
export const publicPreviewTransport: PreviewTransport = { async resolve(hostname) {
        const results = await Promise.all(['A', 'AAAA'].map(async (type) => {
            const u = new URL('https://cloudflare-dns.com/dns-query');
            u.searchParams.set('name', hostname);
            u.searchParams.set('type', type);
            const r = await fetch(u, { headers: { accept: 'application/dns-json' }, redirect: 'manual', signal: AbortSignal.timeout(3000) });
            if (!r.ok)
                throw new ApiProblem(503, 'DNS_UNAVAILABLE', 'Preview DNS lookup is unavailable.');
            const d = await r.json<{
                Answer?: {
                    type: number;
                    data: string;
                }[];
            }>();
            return (d.Answer ?? []).filter(a => a.type === 1 || a.type === 28).map(a => a.data);
        }));
        return results.flat();
    }, get(url, { signal }) { return fetch(url, { method: 'GET', redirect: 'manual', credentials: 'omit', headers: { accept: 'text/html' }, signal }); } };
