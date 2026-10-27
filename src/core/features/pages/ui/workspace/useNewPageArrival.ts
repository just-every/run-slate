import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from '@tanstack/react-router';
import { NEW_PAGE_PARAM } from '../../../../app/ui/pageDestination';

interface EarlyTitle { path:string;input:HTMLTextAreaElement;listener:EventListener;value:string;start:number;end:number;edited:boolean }
type ArrivalWindow=Window & { __slateNewPageTitle?:EarlyTitle };

/** Capture edits before React can reset or replace the server-rendered textarea. */
export const newPageArrivalScript=`(()=>{
  const input=document.currentScript?.previousElementSibling;
  if(!(input instanceof HTMLTextAreaElement)||input.readOnly||!new URL(location.href).searchParams.has('${NEW_PAGE_PARAM}'))return;
  input.focus();input.select();
  const early={path:location.pathname,input,value:input.value,start:input.selectionStart,end:input.selectionEnd,edited:false,listener:event=>{
    if(event.target!==input)return;
    early.value=input.value;early.start=input.selectionStart;early.end=input.selectionEnd;early.edited=true;
  }};
  window.addEventListener('input',early.listener,true);
  window.__slateNewPageTitle=early;
})()`;

/** Consume the intent after focus, adopting text entered before hydration. */
export function useNewPageArrival(title:RefObject<HTMLTextAreaElement|null>,canEdit:boolean,value:string,onEarlyInput:(value:string)=>void) {
  const search=useLocation({select:location=>location.searchStr});
  const arrival=new URLSearchParams(search).has(NEW_PAGE_PARAM);
  const latest=useRef({value,onEarlyInput});latest.current={value,onEarlyInput};
  useLayoutEffect(()=>{
    if(!canEdit || !new URL(window.location.href).searchParams.has(NEW_PAGE_PARAM))return;
    const input=title.current;
    if(!input || input.readOnly || input.disabled)return;
    const owner=window as ArrivalWindow;
    const early=owner.__slateNewPageTitle?.path===window.location.pathname?owner.__slateNewPageTitle:undefined;
    if(early)window.removeEventListener('input',early.listener,true);
    // React's textarea hydration resets the node; only the capture snapshot owns early edits.
    const typed=early?.value??input.value;
    if(typed!==latest.current.value){
      input.value=typed;latest.current.onEarlyInput(typed);
    }
    if(early?.edited){input.focus();input.setSelectionRange(early.start,early.end);}
    else if(!early || early.input!==input || document.activeElement===input){input.focus();input.select();}
    if(early)delete owner.__slateNewPageTitle;
    const url=new URL(window.location.href);url.searchParams.delete(NEW_PAGE_PARAM);
    window.history.replaceState(window.history.state,'',`${url.pathname}${url.search}${url.hash}`);
  },[canEdit,title,arrival]);
  return arrival;
}
