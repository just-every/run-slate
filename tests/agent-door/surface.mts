import {nativeTools} from '../../src/core/features/company-agent/catalogue.ts';
import {nativeNotTools} from '../../src/core/features/company-agent/not-tools.ts';
import {grantTools} from '../../src/core/features/company-agent/grant-tools.ts';
// Regenerate with: pnpm exec tsx tests/agent-door/surface.mts
import fs from 'node:fs';
import {pageTools} from '../../src/core/features/company-agent/page-tools.ts';
import {containerTools} from '../../src/core/features/company-agent/container-tools.ts';
import {readTools} from '../../src/core/features/company-agent/read-tools.ts';
import {nativeResources} from '../../src/core/features/company-agent/resources.ts';
const env={} as any;
const tools=nativeTools(env).map(({name,scope,clauses,classes,readOnly,inputSchema})=>({name,scope,clauses,classes,readOnly,...(['slate.grants.set','slate.groups.manage'].includes(name)?{}:classes.includes('access')?{sponsorEscalation:false}:{}),inputSchema}));
tools.push({name:'slate.events.list',scope:'events:read',clauses:['BASE-AGENT-010'],classes:['standard'],readOnly:true} as any);
const journey=[];
for(const tool of tools)for(const cls of tool.classes){const id=tool.name.slice(6).replaceAll('.','_')+'_'+cls;journey.push({id,tool:tool.name,args:{$fixture:id,pointer:''},expect:[...(tool.name==='slate.grants.set'&&cls!=='access'?[{class:'access',facts:{measure:1,direction:cls==='external'?'widens':'narrows'}}]:[]),{class:cls,facts:cls==='standard'?{measure:1}:cls==='sensitive'?{measure:1,kind:'regulated ID'}:cls==='external'?{measure:1,counterparty:tool.name==='slate.grants.set'?'known':'public'}:{measure:1,direction:['slate.grants.set','slate.groups.manage'].includes(tool.name)?'narrows':'widens'}}],inject:tool.readOnly?undefined:{internal:true,confirmExternal:true,confirmedByHuman:true}});}
journey.push({id:'local_page_read',tool:'slate.pages.read',client:'reader',args:{$fixture:'local_page',pointer:''},expect:[{class:'standard',facts:{measure:1}}]});
journey.push({id:'local_page_create',tool:'slate.pages.create',client:'local',args:{$fixture:'local_create',pointer:''},expect:[{class:'standard',facts:{measure:1}}],inject:{internal:true,confirmExternal:true}});
const surface={schema:'rer-agent-surface/1',seed:'slate',specialist:'wiki curator',tools,resources:nativeResources(env).map(r=>r.uriTemplate),notTools:nativeNotTools,journey,escalations:[{id:'own_group_widen',tool:'slate.groups.manage',args:{id:{$fixture:'escalation_group',pointer:'/id'},name:{$fixture:'escalation_group',pointer:'/name'},memberIds:[{$fixture:'escalation_group',pointer:'/memberId'},{$sponsor:'id'}]}},{id:'own_grant_widen',tool:'slate.grants.set',args:{targetKind:'page',targetId:{$fixture:'escalation_page',pointer:''},principalKind:'member',principalId:{$sponsor:'id'},level:'full'}}],witness:{tool:'slate.audit.read',args:{category:'changes'}},verification:{owner:{email:'synthetic-owner@example.invalid',initializer:'tests/agent-door/owner.mjs',bindings:{SESSION_SECRET:'sessionSecret',MAIL_PROVIDER:{module:'tests/agent-door/mail-provider.mjs'},MAIL_FROM:'email'}},reviewers:[{label:'reviewer',email:'synthetic-reviewer@example.invalid',initializer:'tests/agent-door/reviewer.mjs'},{label:'guest',email:'synthetic-guest@example.invalid',initializer:'tests/agent-door/guest.mjs'}],fixtures:{module:'tests/agent-door/fixtures.mjs'},journey:'tests/agent-door/journey.mjs',invoke:{module:'tests/agent-door/invoke.mjs',entrypoint:'SlateAgentOperations'},replayAdmission:{prepare:['containers_create_standard']}}};
fs.writeFileSync('agent-surface.json',JSON.stringify(surface,null,2)+'\n');
