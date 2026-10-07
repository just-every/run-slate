import {vi} from 'vitest';
import {fixture,secret,transport} from './fixture';
import {connect} from '../../../../src/core/features/connectors/service';
import {startRun} from '../../../../src/core/features/runs/service';
export async function articleFixture(){
 const f=await fixture(),context=()=>({...f.context(),sourceSecret:secret}),origin='https://h2h.authority.test',accountId='test-project',target='projects/test-project/articles/test-article';
 const identity={provider:'happytohelp',protocol:'rer-delegation/1',installationId:'test-installation',accountId,principalId:'test-principal',label:'Controlled native protocol fixture',grantId:'test-provider-grant',expiresAt:'2099-01-01T00:00:00.000Z',scopes:['knowledge.read','knowledge.write'],targets:[target],capabilities:{readKinds:['knowledge.article'],operations:['happytohelp.article.update'],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true}};
 const requests:string[]=[],sends:string[]=[];let audienceRevision='audience-one';
 vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{const u=new URL(input instanceof Request?input.url:String(input)),method=init?.method??'GET';requests.push(method+' '+u);if(u.origin===origin&&method==='GET'){
  if(u.pathname==='/api/delegation/v1/identity')return Response.json(identity);
  if(u.pathname==='/api/delegation/v1/audience'&&u.searchParams.get('target')===target&&u.searchParams.get('operation')==='happytohelp.article.update'&&u.searchParams.get('intendedStatus')==='published')return Response.json({kind:'public',audienceRevision});
 }if(method!=='GET')sends.push(method+' '+u);throw new Error('Unmatched article authority transport: '+method+' '+u);});
 const conn=await connect(context(),{operationKey:'article-connect',provider:'happytohelp',token:'test-native-token',accountId,nativeConfig:{origin,clientId:'test-client',accountId,allowLoopback:false}},secret);
 const run=await startRun(context(),{...f.ask,kind:'procedure'},{apiKey:'test-only'});
 const content={title:'Repair',content:'Corrected controlled article',summary:'Test summary',status:'published' as const};
 const input={operationKey:'article-intent',runId:run.value.id,connectionId:conn.value.id,operation:'happytohelp.article.update' as const,accountId,target,expectedRevision:'article-one',expectedAudienceRevision:'audience-one',content,costMicros:0 as const};
 return {...f,context,run,input,requests,sends,setAudience:(value:string)=>{audienceRevision=value;},...await transport(f)};
}
