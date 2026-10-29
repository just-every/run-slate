import {createAgentDoor,type Trust,type Capability} from '../../../../modules/agent-door/index.ts';
import {createBusinessSettings} from '../../../../modules/business-settings/index.ts';
import type {AppBindings} from '../../app/types';
import {runtimeConfigFor,assertStoredConfiguration} from '../../app/runtime-gate';
import {nativePeople} from './people';
import {wikiTools} from './tools';
import {wikiResources} from './resources';
import surface from '../../../../agent-surface.json';
function trust(env:AppBindings,origin:string):Trust|null{
 const issuer=env.RER_OWNER_CLAIM_ISSUER,installationId=env.RER_OWNER_CLAIM_INSTALLATION_ID,keys=env.RER_OWNER_CLAIM_PUBLIC_KEYS;
 if(!issuer&&!installationId&&!keys)return null;
 if(!issuer||!installationId||!keys)throw new Error('Incomplete agent door trust');
 return {issuer,installationId,appOrigin:origin,publicKeys:JSON.parse(keys)};
}
/** Called before app routing; only recognized door paths construct the runtime. */
export async function agentDoorResponse(request:Request,env:AppBindings):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname;
 if(!['/mcp','/api/agent/mcp','/api/rer/agent-policy','/api/rer/business-settings','/rer-business-logo','/rer-business.css','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/agents'].includes(path)&&!path.startsWith('/agents/'))return null;
 const config=runtimeConfigFor(env,url.hostname);
 await assertStoredConfiguration(env);
 const origin=new URL(config.appUrl!).origin;
 // The door owns bearer/signed checks; its person routes require same-origin native sessions.
 if(request.headers.has('origin')&&request.headers.get('origin')!==origin)return Response.json({code:'invalid_origin'},{status:403});
 const nativeOwner=await env.DB.prepare("SELECT email FROM members WHERE is_setup_owner=1 AND status='active' AND role='owner'").first<{email:string}>();
 const configured=env.RER_BUSINESS_TRUST?JSON.parse(env.RER_BUSINESS_TRUST):null;
 const business=createBusinessSettings({db:env.DB,trust:configured?{...configured,email:nativeOwner?.email??configured.email}:null,business:{settings:1,values:['display_name']}});
 const settings=await business.handle(request);if(settings)return settings;
 return createAgentDoor({seed:'slate',name:'Slate',specialist:'wiki curator',db:env.DB,origin,trust:trust(env,origin),capabilities:surface.capabilities as Capability[],paths:['/api/agent/mcp'],people:nativePeople(env,config),tools:wikiTools(env),resources:wikiResources(env),notTools:surface.notTools as Parameters<typeof createAgentDoor>[0]['notTools']}).handle(request);
}
