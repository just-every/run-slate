import {providerEmbed} from './providers';
import {html} from '../../publishing/html';
import {ApiProblem} from '../../../app/problems';
/** Same-origin wrapper carries the per-provider frame policy and no application script. */
export function embedDocument(content: unknown) {
  const c=content as {url?:string;display?:string};
  const embed=typeof c?.url==='string'?providerEmbed(c.url):null;
  if(!embed)throw new ApiProblem(404,'NOT_FOUND','No supported embed is available.');
  return new Response(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(embed.provider)} embed</title><style>html,body{margin:0;height:100%;}iframe{width:100%;height:100%;border:0}</style></head><body><iframe title="${html(embed.provider)} content" src="${html(embed.url)}" sandbox="${embed.sandbox}" referrerpolicy="no-referrer" allow="fullscreen" allowfullscreen></iframe></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':`default-src 'none'; style-src 'unsafe-inline'; frame-src ${new URL(embed.url).origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
}
