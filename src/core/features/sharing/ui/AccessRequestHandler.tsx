import {useEffect,useState} from 'react';
import {mutate,operationKey,errorMessage} from '../../../client/transport';
/** Delegated handling also covers mention markup inside the native rich-text editor. */
export function AccessRequestHandler(){
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  const pending=new Set<string>();
  const request=(event:MouseEvent)=>{
   const target=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-request-page-access]');
   const id=target?.dataset.requestPageAccess;if(!id||pending.has(id))return;
   event.preventDefault();pending.add(id);target!.disabled=true;
   void mutate(`/api/sharing/pages/${encodeURIComponent(id)}/request-access`,{operationKey:operationKey()})
    .then(()=>setNotice('Access request received'))
    .catch(error=>setNotice(errorMessage(error)))
    .finally(()=>{pending.delete(id);if(target)target.disabled=false;});
  };
  document.addEventListener('click',request);return()=>document.removeEventListener('click',request);
 },[]);
 return notice?<p role="status" className="request-notice">{notice} <button onClick={()=>setNotice('')}>Dismiss</button></p>:null;
}
