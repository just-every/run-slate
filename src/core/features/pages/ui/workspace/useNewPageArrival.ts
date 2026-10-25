import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from '@tanstack/react-router';
import { NEW_PAGE_PARAM } from '../../../../app/ui/pageDestination';

interface EarlyTitle { path:string;input:HTMLTextAreaElement;listener:EventListener;value:string;start:number;end:number;changed:boolean }
type ArrivalWindow=Window & { __slateNewPageTitle?:EarlyTitle };

/** Preserve parser-time input separately: React initializes a controlled textarea before layout effects. */
export const newPageArrivalScript=`(()=>{
  const input=document.currentScript?.previousElementSibling;
  if(!(input instanceof HTMLTextAreaElement)||input.readOnly||!new URL(location.href).searchParams.has('${NEW_PAGE_PARAM}'))return;
  input.focus();input.select();
  const early={path:location.pathname,input,value:input.value,start:input.selectionStart,end:input.selectionEnd,changed:false,listener:()=>{
    early.value=input.value;early.start=input.selectionStart;early.end=input.selectionEnd;early.changed=true;
    const status=input.closest('article')?.querySelector('.editor-save-status');if(status)status.textContent='Saving…';
  }};
  input.addEventListener('input',early.listener);
  window.__slateNewPageTitle=early;
})()`;

/** Consume the intent after focus, adopting text entered before hydration. */
export function useNewPageArrival(title:RefObject<HTMLTextAreaElement|null>,canEdit:boolean,value:string,onEarlyInput:(value:string)=>void) {
  const search=useLocation({select:location=>location.searchStr});
  const arrival=new URLSearchParams(search).has(NEW_PAGE_PARAM);
  const latest=useRef({value,onEarlyInput});latest.current={value,onEarlyInput};
  useLayoutEffect(()=>{
    if(!canEdit || !new URL(window.location.href).searchParams.has(NEW_PAGE_PARAM))return;
    let frame:number;
    const focus=()=>{
      const input=title.current;
      if(!input || input.readOnly || input.disabled){frame=requestAnimationFrame(focus);return;}
      const owner=window as ArrivalWindow;
      const early=owner.__slateNewPageTitle?.path===window.location.pathname?owner.__slateNewPageTitle:undefined;
      if(early)early.input.removeEventListener('input',early.listener);
      const typed=early?.changed?early.value:input.value;
      if(typed!==latest.current.value){
        input.value=typed;latest.current.onEarlyInput(typed);
        if(early?.changed){input.focus();input.setSelectionRange(early.start,early.end);}
      }else if(!early || early.input!==input || (!early.changed && document.activeElement===input)){input.focus();input.select();}
      else {const status=input.closest('article')?.querySelector('.editor-save-status');if(status)status.textContent='Saved';}
      if(document.activeElement!==input && !early){frame=requestAnimationFrame(focus);return;}
      if(early)delete owner.__slateNewPageTitle;
      const url=new URL(window.location.href);url.searchParams.delete(NEW_PAGE_PARAM);
      window.history.replaceState(window.history.state,'',`${url.pathname}${url.search}${url.hash}`);
    };
    focus();return()=>cancelAnimationFrame(frame);
  },[canEdit,title,arrival]);
  return arrival;
}
