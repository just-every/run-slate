const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function socialMetadata(exposure:Record<string,any>,title:string){
 const social=JSON.parse(exposure.social_preview_json??'{}');const t=typeof social.title==='string'?social.title:title;const description=typeof social.description==='string'?social.description:'';
 return `<meta property="og:type" content="article"><meta property="og:title" content="${escape(t)}"><meta property="og:description" content="${escape(description)}"><meta name="description" content="${escape(description)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(t)}"><meta name="twitter:description" content="${escape(description)}">`;
}
export function renderPublicHeader(exposure:Record<string,any>){
 const controls=JSON.parse(exposure.header_controls_json??'[]') as string[];
 const breadcrumbs=controls.includes('breadcrumbs')&&(exposure.breadcrumbs??[]).length?`<nav aria-label="Published ancestors">${exposure.breadcrumbs.map((b:any)=>`<a href="${escape(b.url)}">${escape(b.title)}</a>`).join(' / ')}</nav>`:'';
 const search=controls.includes('search')?`<form role="search" method="get" action="/p/${escape(exposure.slug)}"><label>Search published pages <input type="search" name="q" maxlength="200" value="${escape(exposure.searchQuery)}"></label><button type="submit">Search</button></form>`:'';
 const duplicate=controls.includes('duplicate')&&exposure.duplicate_as_template?`<a href="/signin?next=${encodeURIComponent(`/app?duplicatePublic=${exposure.page_id}&publicHost=${encodeURIComponent(exposure.host)}&publicSlug=${encodeURIComponent(exposure.slug)}`)}">Duplicate this page</a>`:'';
 const results=controls.includes('search')&&exposure.searchQuery?`<section aria-label="Search results"><h2>Results for ${escape(exposure.searchQuery)}</h2>${exposure.searchResults?.length?`<ul>${exposure.searchResults.map((r:any)=>`<li><a href="${escape(r.url)}">${escape(r.title)}</a></li>`).join('')}</ul>`:'<p>No published pages found.</p>'}</section>`:'';
 return `${breadcrumbs||search||duplicate?`<header>${breadcrumbs}${search}${duplicate}</header>`:''}${results}`;
}
