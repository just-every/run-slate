import { ApiProblem } from '../../app/problems';
export interface TimeCursor { at:string; id:string; ceiling:string }
export function encodeCursor(value:unknown):string { return btoa(unescape(encodeURIComponent(JSON.stringify(value)))); }
export function decodeCursor<T>(value:string|undefined):T|undefined { if(!value)return; try { if(value.length>4096)throw Error(); return JSON.parse(decodeURIComponent(escape(atob(value)))) as T; } catch { throw new ApiProblem(400,'INVALID_CURSOR','Invalid pagination cursor.'); } }
export function limitValue(value:unknown):number { const n=value===undefined?30:Number(value); if(!Number.isInteger(n)||n<1||n>100)throw new ApiProblem(400,'INVALID_LIMIT','Limit must be between 1 and 100.'); return n; }
export function timeCursor(value:string|undefined,now:string):TimeCursor { const cursor=decodeCursor<TimeCursor>(value)??{at:now,id:'\uffff',ceiling:now}; if(typeof cursor.at!=='string'||typeof cursor.id!=='string'||typeof cursor.ceiling!=='string'||!Number.isFinite(Date.parse(cursor.at))||!Number.isFinite(Date.parse(cursor.ceiling)))throw new ApiProblem(400,'INVALID_CURSOR','Invalid pagination cursor.'); return cursor; }
