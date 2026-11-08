import type {NotificationEvent} from './events';
/** Digest periods use the recipient's calendar. Due reminders keep their own local instant. */
export function digestPeriod(now:string,mode:'immediate'|'daily'|'weekly',timezone:string,event:NotificationEvent){
 if(mode==='immediate'||event==='reminder'||event==='task-due')return {dueAt:now,bucket:now};
 const parts=(instant:Date)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
 const p=parts(new Date(now));
 let target=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),9);
 const local=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
 if(mode==='weekly'){
  const day=new Date(target).getUTCDay();target+=((8-day)%7)*86400000;
 }
 if(target<=local)target+=(mode==='weekly'?7:1)*86400000;
 // Resolve the calendar instant through the actual zone offset, including DST.
 let instant=target;
 for(let i=0;i<4;i++){const q=parts(new Date(instant)),represented=Date.UTC(Number(q.year),Number(q.month)-1,Number(q.day),Number(q.hour),Number(q.minute),Number(q.second));instant+=target-represented;}
 const dueAt=new Date(instant).toISOString();return {dueAt,bucket:dueAt};
}
