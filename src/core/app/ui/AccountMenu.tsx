import { personInitials } from '../../shared/person-identity';
import { ChevronRight, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { mutate, errorMessage } from '../../client/transport';

/** Account actions stay above the trigger without changing the sidebar's height. */
export function AccountMenu() {
  const { member } = useWorkspace();
  const [open,setOpen]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<unknown>();
  const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLElement>(null);
  const close=()=>{setOpen(false);trigger.current?.focus();};
  useEffect(()=>{if(open)menu.current?.querySelector<HTMLElement>('button')?.focus();},[open]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:MouseEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target)&&!trigger.current?.contains(event.target))setOpen(false);};
    document.addEventListener('click',outside,true);return()=>document.removeEventListener('click',outside,true);
  },[open]);
  return <div className="workspace" onKeyDown={event=>{
    if(!open)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();menu.current?.querySelector<HTMLElement>('button')?.focus();}
  }}>
    {open?<nav ref={menu} aria-label="Account" role="menu">
      <button type="button" role="menuitem" className="navlink" disabled={pending} onClick={async()=>{
        setPending(true);setError(undefined);
        try{await mutate('/api/auth/logout',{});window.location.assign('/signin');}
        catch(cause){setError(cause);setPending(false);}
      }}><LogOut aria-hidden="true"/>Sign out</button>
      {error?<p role="alert">{errorMessage(error)}</p>:null}
    </nav>:null}
    <button ref={trigger} className="workrow" type="button" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(!open)}>
      <span data-testid="member-initials" className="member-initials">{personInitials(member.displayName,member.email)}</span>
      <span data-testid="member-name">{member.displayName}</span><ChevronRight aria-hidden="true" className="workrow-chevron"/>
    </button>
  </div>;
}
