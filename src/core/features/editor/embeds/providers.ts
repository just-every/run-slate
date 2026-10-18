/** Only provider-owned embed endpoints are admitted; a pasted URL is never an iframe URL. */
export interface ProviderEmbed { provider: string; url: string; sandbox: string }
export const embedFrameSources = "https://embed.figma.com https://miro.com https://lucid.app https://www.lucidchart.com https://www.loom.com https://www.youtube-nocookie.com https://player.vimeo.com https://docs.google.com https://onedrive.live.com https://*.sharepoint.com";
export function providerEmbed(raw: string): ProviderEmbed | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host=u.hostname, parts=u.pathname.split('/').filter(Boolean);
  let provider='', url='';
  const id=(value:string|undefined)=>!!value && /^[A-Za-z0-9_!:=.-]+$/.test(value);
  if (['www.figma.com','figma.com','embed.figma.com'].includes(host) && ['design','file','board','proto'].includes(parts[0]??'') && id(parts[1])) {
    provider='Figma'; url=`https://embed.figma.com/${parts[0]==='file'?'design':parts[0]}/${parts[1]}?embed-host=slate`;
    if(u.searchParams.has('node-id')) url+='&node-id='+encodeURIComponent(u.searchParams.get('node-id')!);
  } else if (host==='miro.com' && parts[0]==='app' && ['board','live-embed'].includes(parts[1]??'') && id(parts[2])) {
    provider='Miro'; url=`https://miro.com/app/live-embed/${parts[2]}/?embedMode=view_only_without_ui`;
  } else if (['lucid.app','www.lucidchart.com'].includes(host) && /^(?:\/(?:lucidchart|lucidspark))?\/invitations\/accept\//.test(u.pathname)) {
    return null;
  } else if (['lucid.app','www.lucidchart.com'].includes(host) && (/^\/documents\/embedded\/[A-Za-z0-9-]+$/.test(u.pathname) || /^\/(?:lucidchart|lucidspark)\/[A-Za-z0-9-]+\/view$/.test(u.pathname))) {
    provider='Lucid'; url=u.origin+u.pathname;
  } else if (['loom.com','www.loom.com'].includes(host) && ['share','embed'].includes(parts[0]??'') && id(parts[1])) {
    provider='Loom'; url=`https://www.loom.com/embed/${parts[1]}`;
  } else if (['youtube.com','www.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(host)) {
    const video=host==='youtu.be'?parts[0]:parts[0]==='watch'?u.searchParams.get('v'):['embed','shorts'].includes(parts[0]??'')?parts[1]:null;
    if(video && /^[A-Za-z0-9_-]{11}$/.test(video)) {provider='YouTube';url=`https://www.youtube-nocookie.com/embed/${video}`;}
  } else if (['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)) {
    const video=parts[0]==='video'?parts[1]:parts[0];
    if(video && /^\d+$/.test(video)){provider='Vimeo';url=`https://player.vimeo.com/video/${video}`;if(u.searchParams.has('h') && /^[a-f0-9]+$/.test(u.searchParams.get('h')!))url+='?h='+u.searchParams.get('h');}
  } else if (host==='docs.google.com' && ['document','spreadsheets','presentation'].includes(parts[0]??'') && parts[1]==='d' && id(parts[2])) {
    provider=parts[0]==='document'?'Google Docs':parts[0]==='spreadsheets'?'Google Sheets':'Google Slides';
    url=`https://docs.google.com/${parts[0]}/d/${parts[2]}/${parts[0]==='presentation'?'embed':'preview'}`;
  } else if ((host==='onedrive.live.com' && u.pathname==='/embed') || (/^[a-z0-9-]+\.sharepoint\.com$/.test(host) && /\/_layouts\/15\/Doc\.aspx$/i.test(u.pathname) && u.searchParams.get('action')==='embedview')) {
    provider='Microsoft 365';url=u.href;
  }
  return url?{provider,url,sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation'}:null;
}
