import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {fixture,reset} from './fixture';
import {exchangeToken} from '../../../src/core/features/connectors/oauth-provider';
import {connect} from '../../../src/core/features/connectors/service';
import {getEffectAdapter} from '../../../src/core/features/connectors/effects';
import {nativeHash} from '../../../src/core/features/connectors/native-effects';

beforeEach(reset);afterEach(()=>vi.unstubAllGlobals());
test('SOURCE-006 — native OAuth refuses a redirect without replaying or forwarding the personal authorization code',async()=>{
 const requests:{url:string;redirect:RequestRedirect|undefined}[]=[];
 vi.stubGlobal('fetch',async(input:Request|string|URL,init?:RequestInit)=>{requests.push({url:String(input),redirect:init?.redirect});return new Response(null,{status:302,headers:{Location:'https://unexpected.test/token'}});});
 await expect(exchangeToken('orbit',{code:'labelled-single-use-code'},'https://native.test/api/delegation/v1/token')).rejects.toMatchObject({code:'OAUTH_EXCHANGE_FAILED'});
 expect(requests).toEqual([{url:'https://native.test/api/delegation/v1/token',redirect:'manual'}]);
});
test('SOURCE-004 — typed native article receipt binds exact publication audience and rejects invalid observation time without dispatch',async()=>{
 const f=await fixture(),ctx=f.context(),origin='https://native.test',target='projects/account/articles/article',secret='test-only-credential-key-1234567890123456',now=ctx.now;
 const identity={protocol:'rer-delegation/1',provider:'happytohelp',installationId:'installation',accountId:'account',principalId:'native-owner',label:'Labelled protocol identity',grantId:'grant',expiresAt:'2099-01-01T00:00:00.000Z',scopes:['knowledge.article.read','knowledge.article.update','knowledge.article.publish'],targets:[target],capabilities:{readKinds:['knowledge.article'],operations:['happytohelp.article.update'],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true}};
 const content={title:'Scoped draft',content:'Local protocol fixture only.',summary:'Current scope',status:'published'},input={operationKey:'local-native-article',operation:'happytohelp.article.update',target,expectedRevision:'before',expectedAudienceRevision:'intended-public-epoch',content};
 let invalidTime=true,posted=0;const statuses:string[]=[];
 // Labelled owning-system protocol double; no remote account is contacted.
 vi.stubGlobal('fetch',async(request:Request|string|URL,init?:RequestInit)=>{
  const url=new URL(String(request));expect(url.origin).toBe(origin);expect(init?.redirect).toBe('manual');
  if(url.pathname.endsWith('/identity'))return Response.json(identity);
  if(url.pathname.endsWith('/check'))return Response.json({provider:'happytohelp',installationId:'installation',accountId:'account',principalId:'native-owner',target,revision:'before',observedAt:invalidTime?'not-a-timestamp':now,audience:{kind:'source-principals',principalIds:['native-owner']}});
  if(url.pathname.endsWith('/audience')){statuses.push(url.searchParams.get('intendedStatus')!);return Response.json({kind:'public',audienceRevision:'intended-public-epoch'});}
  if(url.pathname.endsWith('/effects')){posted++;const {operationKey,...body}=JSON.parse(String(init?.body));return Response.json({state:'confirmed',receipt:{id:'labelled-receipt',operationKey,requestHash:await nativeHash(body),provider:'happytohelp',installationId:'installation',accountId:'account',principalId:'native-owner',operation:input.operation,target,beforeRevision:'before',afterRevision:'after',committedAt:now},observed:{target,revision:'after',content,observedAt:now}});}
  throw Error('Unexpected local protocol request '+url.pathname);
 });
 const connected=await connect(ctx,{operationKey:'connect-native-protocol',provider:'happytohelp',accountId:'account',token:'test-only-personal-token',nativeConfig:{origin,accountId:'account',clientId:'slate',allowLoopback:false}},secret),adapter=await getEffectAdapter(ctx,connected.value.id,secret);
 await expect(adapter.dispatch(input)).rejects.toThrow();expect(posted).toBe(0);
 invalidTime=false;expect(await adapter.dispatch(input)).toMatchObject({confirmed:true,attributable:true,matches:true});expect(posted).toBe(1);expect(statuses).toEqual(['published']);
 await expect(adapter.dispatch({...input,content:{...content,sendReply:true}})).rejects.toThrow();expect(posted).toBe(1);
});
