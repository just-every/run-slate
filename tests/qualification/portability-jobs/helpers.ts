import {env} from 'cloudflare:test';
import {fixture,document,reset} from '../authority/fixture';
import {exportWorkspace} from '../../../src/core/features/portability/service';
import type {FeatureContext} from '../../../src/core/app/feature-context';
/** Labelled test-only R2 transport latch: delegates the actual put to local R2. */
export function latchR2(ctx:FeatureContext,prefix:string){
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const files=new Proxy(ctx.files,{get(target,property){if(property==='put')return async(key:string,...args:unknown[])=>{if(key.startsWith(prefix)){entered();await gate;}return (target.put as Function).call(target,key,...args);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
 return {ctx:{...ctx,files},started,release};
}
export function faultR2(ctx:FeatureContext,method:'put'|'delete',after=false){return {...ctx,files:new Proxy(ctx.files,{get(target,property){if(property===method)return async(...args:unknown[])=>{if(after)await (Reflect.get(target,property) as Function).apply(target,args);throw new Error('labelled R2 transport fault');};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}})};}
/** Labelled D1 transport fault after the REAL local D1 batch commits. */
export function lostCompletion(ctx:FeatureContext,unreadable=false){let committed=false;return {...ctx,db:new Proxy(ctx.db,{get(target,property){if(property==='batch')return async(statements:D1PreparedStatement[])=>{const result=await target.batch(statements);if(await target.prepare("SELECT id FROM portability_jobs WHERE state='completed' LIMIT 1").first()){committed=true;throw new Error('labelled lost commit acknowledgement');}return result;};if(property==='prepare'&&unreadable)return (sql:string)=>{if(committed&&sql==='SELECT * FROM portability_jobs WHERE id=?')throw new Error('labelled unavailable completion witness');return target.prepare(sql);};const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}})};}
export async function archivedFixture(){const source=await fixture();await document(source,'Portability real original');const exported=await exportWorkspace(source.context());const key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key');const bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());await reset();const target=await fixture();return {source,target,bytes};}
