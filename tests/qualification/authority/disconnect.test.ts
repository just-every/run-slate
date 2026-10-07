import {env} from 'cloudflare:test';
import {test,expect,beforeEach,afterEach,vi} from 'vitest';
import {fixture,reset,document,passingEvaluation} from './fixture';
import {connect,disconnect} from '../../../src/core/features/connectors/service';
import {addSource,refreshSource} from '../../../src/core/features/source-memory/service';
import {createSkill,transitionSkill} from '../../../src/core/features/skills/service';
import {requireActiveSkill} from '../../../src/core/features/skills/admission';
import {issueGrant} from '../../../src/core/features/effects/grants';
beforeEach(reset);afterEach(()=>vi.unstubAllGlobals());
test('SOURCE-006 — disconnect atomically stops queued work, withdraws activation and grant authority, and reconnect preserves suspension',async()=>{
 const f=await fixture(),host=await document(f,'Method host'),secret='test-only-credential-key-1234567890123456',ctx=()=>({...f.context(),sourceSecret:secret});
 // A labelled protocol double only: no hosted source acceptance is claimed.
 vi.stubGlobal('fetch',async(input:Request|string|URL)=>{const url=String(input);return Response.json(url.endsWith('/user')?{id:7,login:'reader'}:{title:'Owning source',body:'Permitted source evidence',updated_at:'v1',state:'open',number:1});});
 const connection=await connect(ctx(),{operationKey:'connect-for-disconnect',provider:'github',accountId:'reader',token:'test-only-token'},secret),source=await addSource(ctx(),{operationKey:'source-for-disconnect',connectionId:connection.value.id,remoteId:'acme/project/1'}),revision=await refreshSource(ctx(),source.value.id,secret);
 const ref={kind:'source' as const,sourceId:source.value.id,revisionId:revision.sourceRevisionId},def={instructions:'Exact owning source procedure',refs:[ref],audience:[f.owner],tools:['read-evidence' as const],effects:[],preconditions:[],successTests:['No dispatch after disconnect'],escalations:[],maxCostMicros:100};
 const skill=await createSkill(ctx(),{operationKey:'disconnect-skill',pageId:host.id,name:'Connected skill',definition:def});await passingEvaluation(ctx(),skill.value.revisionId);await transitionSkill(ctx(),{operationKey:'disconnect-activation',revisionId:skill.value.revisionId,action:'activate'});
 const grant=await issueGrant(ctx(),{operationKey:'disconnect-grant',subjectId:f.owner,kind:'skill',expiresAt:'2099-01-01T00:00:00.000Z',scope:{operations:['skill.activate'],targets:[skill.value.id],accounts:['reader'],sourceIds:[source.value.id],audience:[f.owner],maxCostMicros:100,conditions:{},acceptNonAtomicProvider:false}});
 await env.DB.prepare("INSERT INTO intelligence_runs(id,workspace_id,requester_id,page_id,kind,status,revision_id,input_json,refs_json,audience_json,skill_revision_id,created_at,updated_at) VALUES('queued-test-run',?,?,?,'procedure','queued','test-revision','{}',?,?,?,?,?)").bind(f.workspaceId,f.owner,host.id,JSON.stringify([ref]),JSON.stringify([f.owner]),skill.value.revisionId,ctx().now,ctx().now).run();
 await disconnect(ctx(),{id:connection.value.id,operationKey:'withdraw-connection',expectedRevisionId:connection.receipt.revisionId!});
 expect(await env.DB.prepare('SELECT status,failure_reason FROM intelligence_runs WHERE id=?').bind('queued-test-run').first()).toEqual({status:'paused',failure_reason:'SOURCE_DISCONNECTED'});
 expect(await env.DB.prepare('SELECT state,authority_id FROM intelligence_skill_versions WHERE id=?').bind(skill.value.revisionId).first()).toEqual({state:'evaluated',authority_id:null});
 expect(await env.DB.prepare('SELECT revoked_at FROM intelligence_grants WHERE id=?').bind(grant.value.id).first<string>('revoked_at')).not.toBeNull();
 await connect(ctx(),{operationKey:'reconnect-explicit-identity',provider:'github',accountId:'reader',token:'test-only-new-token'},secret);
 await expect(requireActiveSkill(ctx(),skill.value.revisionId,[ref],[f.owner],1)).rejects.toMatchObject({code:'SKILL_CHANGED'});
 expect(await env.DB.prepare('SELECT status FROM intelligence_runs WHERE id=?').bind('queued-test-run').first<string>('status')).toBe('paused');
});
