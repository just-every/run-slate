import {env} from 'cloudflare:test';
import {beforeEach,test,expect} from 'vitest';
import {fixture,reset,document} from './fixture';
import {issueGrant,revokeGrant} from '../../../src/core/features/effects/grants';
import {exportWorkspace,restoreWorkspace} from '../../../src/core/features/portability/service';

beforeEach(reset);
test('FLAG-004 — recovery preserves prior revocation timestamps and failed export diagnostics as immutable history',async()=>{
 const f=await fixture(),host=await document(f,'Retained recovery history'),ctx=f.context();
 const grant=await issueGrant(ctx,{operationKey:'history-grant',subjectId:f.owner,kind:'skill',expiresAt:'2099-01-01T00:00:00.000Z',scope:{operations:['skill.activate'],targets:['labelled-method'],accounts:[],sourceIds:[host.id],audience:[f.owner],maxCostMicros:1,conditions:{},acceptNonAtomicProvider:false}});
 await revokeGrant(ctx,{id:grant.value.id,operationKey:'history-revoke'});
 const previous=await exportWorkspace(ctx);
 // Labelled retained diagnostic fixture: this tests history portability, not provider failure.
 const report={error:'LABELLED_PRIOR_EXPORT_FAILURE',detail:'The original diagnostic remains inspectable.'};
 await env.DB.prepare("UPDATE federation_exports SET state='failed',report_json=? WHERE id=?").bind(JSON.stringify(report),previous.id).run();
 const exported=await exportWorkspace(ctx),key=await env.DB.prepare('SELECT archive_key FROM federation_exports WHERE id=?').bind(exported.id).first<string>('archive_key'),bytes=new Uint8Array(await(await env.FILES.get(key!))!.arrayBuffer());
 await reset();const target=await fixture(),later=new Date(Date.parse(ctx.now)+60000).toISOString();await restoreWorkspace({...target.context(),now:later},bytes);
 expect(await env.DB.prepare('SELECT revoked_at FROM intelligence_grants WHERE id=?').bind(grant.value.id).first<string>('revoked_at')).toBe(ctx.now);
 const retained=await env.DB.prepare('SELECT state,archive_key,report_json FROM federation_exports WHERE id=?').bind(previous.id).first<{state:string;archive_key:string|null;report_json:string}>();
 expect(retained).toMatchObject({state:'failed',archive_key:null});expect(JSON.parse(retained!.report_json)).toMatchObject({...report,recovery:{archiveOmitted:true}});
});
