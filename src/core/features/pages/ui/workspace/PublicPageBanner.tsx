import {useEffect} from 'react';
import {useResource} from '../../../../client/useResource';
import type {DocumentView} from '../../../../client/content';
export function PublicPageBanner({document,onManage}:{document:DocumentView;onManage:()=>void}){
 const resource=useResource<{exposure:{host:string;slug:string;revokedAt:string|null}|null}>(document.permissions.canShare&&document.policyProfile['page.public-access.v1']==='site'?`/api/publishing/${document.page.id}`:null);
 useEffect(()=>{const changed=()=>{void resource.reload();};window.addEventListener('slate:public-page-changed',changed);return()=>window.removeEventListener('slate:public-page-changed',changed);},[resource.reload]);
 const exposure=resource.data?.exposure;
 if(!exposure||exposure.revokedAt)return null;
 return <aside className="public-page-banner" aria-label="Live public site"><span>This page is published to the web.</span> <a href={`${window.location.protocol}//${exposure.host}/p/${exposure.slug}`} target="_blank" rel="noreferrer">Open public site</a> <button onClick={onManage}>Manage public site</button></aside>;
}
