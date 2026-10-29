import {z} from 'zod';
import type {AppBindings} from '../../app/types';
import {readWorkspace} from '../workspace/settings';
import {activity} from '../activity/service';
import {navigation} from '../navigation/service';
import {search} from '../search/service';
import {readPage} from '../pages/service';
import {job,id,standard} from './tool';
import {pageFacts,pageTarget} from './page-facts';
import {sensitiveKinds} from './classification';

export function readTools(env:AppBindings){return [
  job(env,{name:'workspace.read',title:'Read workspace settings',clauses:['WORK-001'],schema:z.object({}),readOnly:true,classes:['standard','sensitive'],classify:async(_a,ctx)=>{const kinds=sensitiveKinds(await readWorkspace(ctx));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},run:(_a,ctx)=>readWorkspace(ctx)}),
  job(env,{name:'audit.read',title:'Read permitted native activity',clauses:['ACT-001','ACT-002','ACT-003','ACT-004','ACT-005'],schema:z.object({}),readOnly:true,classes:['standard'],classify:standard,run:async(_a,ctx)=>{const result=await activity(ctx,{limit:100});return {items:result.items};}}),
  job(env,{name:'navigation.read',title:'Read permitted navigation',clauses:['NAV-001','NAV-002','NAV-003'],schema:z.object({}),readOnly:true,classes:['standard','sensitive'],classify:async(_a,ctx)=>{const kinds=sensitiveKinds(await navigation(ctx));return kinds.length?[{class:'sensitive',facts:{measure:1,kind:kinds.join(', ')}}]:standard();},run:(_a,ctx)=>navigation(ctx)}),
  job(env,{name:'blocks.list',title:'Read permitted page blocks',clauses:['BLOCK-001'],schema:z.object({id}),readOnly:true,classes:['standard','sensitive'],classify:(a,ctx)=>pageFacts(ctx,a.id),target:(a,ctx)=>pageTarget(ctx,a.id),run:async(a,ctx)=>({items:(await readPage(ctx,a.id)).blocks})}),
];}
