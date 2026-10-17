import { ApiProblem } from '../../app/problems';
export function validDate(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function validTimezone(zone:string){try{new Intl.DateTimeFormat('en',{timeZone:zone});return true;}catch{return false;}}
export function localDate(now:string,timezone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
/** Resolve wall time against IANA offsets, including transitions. A skipped time is invalid rather than silently moved. */
export function scheduleAt(date:string,time:string,timezone:string,offsetMinutes=0){
 if(!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!validTimezone(timezone)||!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>525600)throw new ApiProblem(400,'INVALID_REMINDER_DATE','Choose a valid local date, time, timezone and offset.');
 const target=Date.parse(`${date}T${time}:00Z`),format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const wall=(instant:number)=>{const p=Object.fromEntries(format.formatToParts(new Date(instant)).map(v=>[v.type,v.value]));return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);};
 const candidates=new Set<number>();for(const delta of [-86400000,0,86400000]){const probe=target+delta,offset=wall(probe)-probe,candidate=target-offset;if(wall(candidate)===target)candidates.add(candidate);}
 if(!candidates.size)throw new ApiProblem(400,'INVALID_REMINDER_DATE','This local time does not exist in that timezone. Choose another time.');
 return new Date(Math.min(...candidates)-offsetMinutes*60000).toISOString();
}
