import {useEffect,useRef} from 'react';
import {RecordWorkspace} from './RecordWorkspace';
export function RecordPeek({databaseId,id,mode,onMode,onClose}:{databaseId:string;id:string;mode:'side'|'center';onMode:(mode:'side'|'center')=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement;dialog.current?.show();const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog:modal')){event.preventDefault();onClose();}};document.addEventListener('keydown',close);return ()=>{document.removeEventListener('keydown',close);if(previous instanceof HTMLElement)previous.focus();};},[]);
 return <dialog ref={dialog} className={`record-peek record-peek-${mode}`} aria-label="Record preview" onCancel={e=>{e.preventDefault();onClose();}}><div className="action-row"><button onClick={onClose}>Close preview</button><button onClick={()=>onMode(mode==='side'?'center':'side')}>{mode==='side'?'Centre peek':'Side peek'}</button><a href={`/app/databases/${databaseId}/records/${id}`}>Open full page</a></div><RecordWorkspace databaseId={databaseId} id={id}/></dialog>;
}
