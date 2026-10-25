import { useLayoutEffect, type RefObject } from 'react';
import { NEW_PAGE_PARAM } from '../../../../app/ui/pageDestination';

/** Consume the arrival intent only after the editable title owns the caret. */
export function useNewPageArrival(title:RefObject<HTMLTextAreaElement|null>,canEdit:boolean) {
  useLayoutEffect(()=>{
    if(!canEdit || !new URL(window.location.href).searchParams.has(NEW_PAGE_PARAM))return;
    let frame:number;
    const focus=()=>{
      const input=title.current;
      if(!input || input.readOnly || input.disabled){frame=requestAnimationFrame(focus);return;}
      input.focus();input.select();
      if(document.activeElement!==input){frame=requestAnimationFrame(focus);return;}
      const url=new URL(window.location.href);url.searchParams.delete(NEW_PAGE_PARAM);
      window.history.replaceState(window.history.state,'',`${url.pathname}${url.search}${url.hash}`);
    };
    focus();return()=>cancelAnimationFrame(frame);
  },[canEdit,title]);
}
