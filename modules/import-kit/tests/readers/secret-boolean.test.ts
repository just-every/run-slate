import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSource, readApiSource } from '../../src/readers/index.ts';
import { planD1Import, createD1ImportJob, readD1ImportOriginals, resumeD1Import, canonicalJson, sha256 } from '../../src/d1/index.ts';
import { sqliteRuntime, sqliteMapping, sqliteTargets } from '../d1/sqlite-runtime.ts';

test('public readers and durable planning retain boolean secret semantics with exact originals and refuse credential values',async t=>{
  const r=await sqliteRuntime(t);
  const parse=(value:any)=>value.collection.map((payload:any)=>({kind:'record',sourceId:payload.uri,payload}));
  for(const secret of [true,false])for(const api of [false,true]){
    const bytes=Buffer.from(JSON.stringify({collection:[{uri:`https://api.calendly.com/event_types/example-${api}-${secret}`,secret}]}));
    const source=api?await readApiSource({namespace:'archive',url:'https://api.calendly.com/event_types',parsePage:value=>({records:parse(value)})},async()=>new Response(bytes)):await readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,parse});
    const plan=await planD1Import(source,sqliteMapping,r.context());
    const job=await createD1ImportJob(plan,{...r.context(),reviewedFingerprint:plan.fingerprint});
    await resumeD1Import(job.id,r.context());
    const changed=structuredClone(source);
    changed.records[0].payload={secret:'synthetic-credential'};
    changed.records[0].payloadHash=sha256(canonicalJson(changed.records[0].payload));
    await assert.rejects(planD1Import(changed,sqliteMapping,r.context()),/CREDENTIAL_IN_DURABLE_DATA/);
    const original=(await readD1ImportOriginals(job.id,r.context()))[0].original;
    assert.equal(original.status,'retained');
    if(original.status==='retained')assert.deepEqual(Buffer.from(original.base64,'base64'),bytes);
    assert.deepEqual((await sqliteTargets.read(r.db(),'workspace','record',source.records[0].sourceId))!.value,source.records[0].payload);
  }
  for(const secret of ['synthetic-credential',{value:'synthetic-credential'},1]){
    const bytes=Buffer.from(JSON.stringify({collection:[{uri:'https://source.test/event',secret}]}));
    // Inspect raw originals even when the parser intentionally drops metadata.
    await assert.rejects(readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,parse:()=>[]}),/INVALID_OR_CREDENTIAL_SOURCE_DATA/);
    await assert.rejects(readApiSource({namespace:'archive',url:'https://source.test/events',parsePage:()=>({records:[]})},async()=>new Response(bytes)),/INVALID_OR_CREDENTIAL_SOURCE_DATA/);
  }
  // Null, an empty string or a mask where a credential would go is not a credential.
  for(const secret of [null,'','********']){
    const bytes=Buffer.from(JSON.stringify({collection:[{uri:`https://source.test/event-${JSON.stringify(secret)}`,secret}]}));
    const source=await readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,parse});
    assert.deepEqual(source.records[0].payload,{uri:`https://source.test/event-${JSON.stringify(secret)}`,secret});
    assert.equal(source.artifacts[0].original?.status,'available');
    const plan=await planD1Import(source,sqliteMapping,r.context());assert.equal(plan.counts.mapped,1);
  }
  // Refuse mode refuses the common credential shapes the import door removes, naming the field kind.
  const read=(value:Record<string,unknown>)=>readFileSource({namespace:'archive',name:'event.json',format:'json',bytes:Buffer.from(JSON.stringify({collection:[{uri:'https://source.test/event',...value}]})),parse});
  const refused:[Record<string,unknown>,string][]=[
    [{secret_key:'synthetic-credential'},'credential field "secretkey"'],[{headers:{'x-functions-key':'synthetic-credential'}},'credential field "xfunctionskey"'],
    [{headers:{'Ocp-Apim-Subscription-Key':'synthetic-credential'}},'credential field "ocpapimsubscriptionkey"'],[{headers:{'X-Auth':'synthetic-credential'}},'credential field "xauth"'],
    [{pwd:'synthetic-credential'},'credential field "pwd"'],[{apiKeys:['synthetic-credential']},'credential field "apikeys"'],[{tokens:['synthetic-credential']},'credential field "tokens"'],
    [{headers:[['Authorization','Bearer synthetic-credential'],['Accept','*/*']]},'credential field "authorization"'],
    [{link:'https://acct.blob.core.windows.net/c/b?sv=2020-08-04&sig=synthetic-credential'},'URL credential query parameter'],
    // A plural name's container is still searched: a credential nested under it is refused.
    [{tokens:[{token:'synthetic-credential'}]},'credential field "token"'],[{secrets:{github:{token:'synthetic-credential'}}},'credential field "token"'],
    [{apiKeys:[{apiKey:'synthetic-credential'}]},'credential field "apikey"'],[{tokens:[{url:'https://u:synthetic-credential@source.test/'}]},'URL user name or password'],
  ];
  for(const [value,field] of refused) await assert.rejects(read(value),(error:any)=>error.code==='INVALID_OR_CREDENTIAL_SOURCE_DATA'&&error.field===field,field);
  // Names are matched by whole parts (camelCase, `_`, `-`, `.`, digits), as a field, a header-tuple name or a URL query and fragment key.
  const credentialNames=['apiKey','api_key','API-KEY','x-api-key','secret_key','secretKey','client_secret','x-functions-key','Ocp-Apim-Subscription-Key','X-Auth','X-Auth-Token','Authorization','auth',
    'authToken','accessToken','access_token','refreshToken','token','tokens','bearer','password','passwd','pwd','httpPassword','http_password','privateKey','private_key','sig','signature','sessionId','cookie','apiKeys','secrets','passwords',
    // Names that are credentials everywhere: a passphrase, a JWT, and Java's and PHP's session cookies.
    'passphrase','jwt','jsessionid','JSESSIONID','PHPSESSID'];
  const plainNames=['keyword','keywords','monkey','donkey','turkey','hockey','author','authority','authors','signal','design','signup','tokenizer','passwordless','keyboard','primaryKey','foreignKey','sortKey','keyType','monitorKey'];
  const kind=(field:string)=>(error:any)=>error.code==='INVALID_OR_CREDENTIAL_SOURCE_DATA'&&error.field.startsWith(field);
  // `sig`, `signature` and `sessionId` are credentials as header names and URL keys, never as a record's field (an agent's signature, a chat's session id).
  const headerOnly=new Set(['sig','signature','sessionId']);
  for(const name of credentialNames){
    const value=/^(?:tokens|secrets|passwords|apiKeys)$/.test(name)?['synthetic-credential']:'synthetic-credential';
    if(headerOnly.has(name))assert.deepEqual((await read({[name]:value})).records[0].payload,{uri:'https://source.test/event',[name]:value},`field ${name}`);
    else await assert.rejects(read({[name]:value}),kind('credential field'),`field ${name}`);
    await assert.rejects(read({headers:{[name]:value}}),kind('credential field'),`header ${name}`);
    await assert.rejects(read({headers:[[name,'synthetic-credential'],['Accept','*/*']]}),kind('credential field'),`tuple ${name}`);
    await assert.rejects(read({link:`https://source.test/page?${name}=synthetic-credential`}),kind('URL credential query'),`query ${name}`);
  }
  // Documented credential query and fragment keys: Matomo's `token_auth`, Datadog's `application_key`, 3scale's `user_key`, HubSpot's `hapikey`.
  const readRemoved=(value:Record<string,unknown>)=>readFileSource({namespace:'archive',name:'event.json',format:'json',credentials:'remove',bytes:Buffer.from(JSON.stringify({collection:[{uri:'https://source.test/event',...value}]})),parse});
  for(const name of ['token_auth','application_key','user_key','account_key','AccountKey','shared_key','deploy_key','DD-APPLICATION-KEY','hapikey','service_account_key','serviceAccountKey','basic_auth','basicAuth','http_auth']){
    await assert.rejects(read({link:`https://source.test/page?${name}=synthetic-credential&region=eu`}),kind('URL credential query'),`query ${name}`);
    const removed=await readRemoved({link:`https://source.test/page?${name}=synthetic-credential&region=eu`,callback:`https://source.test/cb#${name}=synthetic-credential&state=s`});
    assert.deepEqual([removed.records[0].payload,removed.diagnostics.filter(d=>d.code==='CREDENTIAL_REMOVED').map(d=>d.field)],
      [{uri:'https://source.test/event',link:'https://source.test/page?region=eu',callback:'https://source.test/cb#state=s'},['/link','/callback']],`removed ${name}`);
  }
  // In remove mode they go as fields, header names and URL keys alike, each noted.
  for(const name of ['passphrase','passPhrase','ssh_passphrase','jwt','JSESSIONID','jsessionId','PHPSESSID']){
    const removed=await readRemoved({[name]:'synthetic-credential',headers:{[name]:'synthetic-credential'},link:`https://source.test/page?${name}=synthetic-credential&region=eu`});
    assert.deepEqual([removed.records[0].payload,removed.diagnostics.filter(d=>d.code==='CREDENTIAL_REMOVED').map(d=>d.field)],
      [{uri:'https://source.test/event',headers:{},link:'https://source.test/page?region=eu'},[`/${name}`,`/headers/${name}`,'/link']],`removed ${name}`);
  }
  for(const name of plainNames){
    const plain={[name]:'synthetic',headers:[[name,'synthetic'],['Accept','*/*']],link:`https://source.test/page?${name}=synthetic&region=eu#${name}=synthetic`};
    assert.deepEqual((await read(plain)).records[0].payload,{uri:'https://source.test/event',...plain},`plain ${name}`);
  }
  // A bare `key` is a credential only as a query key (`?key=`), never as a field; `primaryKey` and `sortKey` are not credentials anywhere.
  await assert.rejects(read({link:'https://source.test/page?key=synthetic-credential'}),kind('URL credential query'));
  assert.equal((await read({key:'k_1',primaryKey:'pk_1'})).records.length,1);
  // Look-alike names, counts under a plural name, a lone two-item list and placeholders are accepted as they are.
  const accepted={keyword:'uptime',monkey:'chaos',signal:'green',design:'v2',link:'https://source.test/?signal=1&design=2',tags:['password','reset'],
    tokens:{input:1500,output:300},inputTokens:1500,next_page_token:'cursor/a+b',nextSyncToken:'sync-1',emailSignature:'Thanks',hasSecretKey:true,pwd:null,secret_key:'',apiKeys:['****'],headers:[['Authorization','none'],['X-Auth','[redacted]']]};
  const source=await read(accepted);
  assert.deepEqual(source.records[0].payload,{uri:'https://source.test/event',...accepted});assert.equal(source.artifacts[0].original?.status,'available');
  // Support exports import as they are in both modes: a Zendesk agent's and a Freshdesk agent's `signature`, a chat's session ids.
  const support=[
    {uri:'https://example.zendesk.com/api/v2/users/35436.json',id:35436,name:'Ops Agent',role:'agent',signature:'Best regards,\nOps Agent\nExample Support',shared_agent:false,user_fields:{}},
    {uri:'https://example.zendesk.com/api/v2/chats/2405.1.LwKcQYqRXr9WRA',id:'2405.1.LwKcQYqRXr9WRA',type:'chat',session_id:'2405.1.LwKcQYqRXr9WRA',sessionId:'zchat-session-77',session:{browser:'Chrome'}},
    {uri:'https://example.freshdesk.com/api/v2/agents/43000012345',id:43000012345,available:true,occasional:false,signature:'<div>Thanks,<br>Ops Agent</div>',ticket_scope:1,contact:{name:'Ops Agent'}},
    {uri:'https://example.freshdesk.com/api/v2/tickets/20',id:20,subject:'Chat follow-up',custom_fields:{cf_chat_session_id:'fc-session-7'}},
    // A `{name, value}` pair outside a header container labels a field: Help Scout's custom fields and Zendesk's ticket field options.
    {uri:'https://api.helpscout.net/v2/conversations/501',id:501,customFields:[{id:1,name:'Session ID',value:'sess-3c4d5e6f7a',text:'sess-3c4d5e6f7a'},{id:2,name:'Signature',value:'Signed in person',text:'Signed in person'}]},
    {uri:'https://example.zendesk.com/api/v2/ticket_fields/360',id:360,type:'tagger',custom_field_options:[{id:1,name:'Signature',raw_name:'Signature',value:'request_signature'},{id:2,name:'Session ID',raw_name:'Session ID',value:'request_session_id'}]},
  ];
  // `auth` and `credentials` holding no credential stay; their credential fields are refused, or removed and noted.
  const containers=[{auth:{type:'oauth2'}},{credentials:[]},{request:{credentials:'include'}},{auth:'Bearer'},{auth:{type:'bearer'}},{credentials:{username:'ops'}},{credentials:'same-origin'},{smtpServer:{auth:'true'}}];
  for(const value of [...support,...containers]){
    const bytes=Buffer.from(JSON.stringify({collection:[value]}));
    assert.deepEqual((await readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,parse:()=>[{kind:'record',sourceId:'s',payload:value}]})).records[0].payload,value,'refuse mode');
    const removed=await readFileSource({namespace:'archive',name:'event.json',format:'json',bytes,credentials:'remove',parse:()=>[{kind:'record',sourceId:'s',payload:value}]});
    assert.deepEqual([removed.records[0].payload,removed.diagnostics.filter(d=>d.code==='CREDENTIAL_REMOVED')],[value,[]],'remove mode');
  }
  for(const [value,field,path,kept] of [[{auth:{token:'synthetic-credential'}},'credential field "token"','/auth/token',{auth:{}}],[{credentials:{password:'synthetic-credential'}},'credential field "password"','/credentials/password',{credentials:{}}],
    [{auth:'synthetic-credential'},'credential field "auth"','/auth',{}],
    // Under `auth` and `credential(s)`, a credential under a generic member name: a Keycloak realm user's `{type, value}` and `secretData`,
    // nodemailer's `{user, pass}`, `credential: {type: 'apiKey', value}`, `pw`, and a `jwt`.
    [{credentials:[{type:'password',value:'synthetic-credential',temporary:false}]},'credential field "value"','/credentials/0/value',{credentials:[{type:'password',temporary:false}]}],
    [{credentials:[{id:'c2',type:'password',secretData:'{"value":"synthetic-credential"}'}]},'credential field "secretdata"','/credentials/0/secretData',{credentials:[{id:'c2',type:'password'}]}],
    [{credentials:{user:'ops',pass:'synthetic-credential'}},'credential field "pass"','/credentials/pass',{credentials:{user:'ops'}}],
    [{credential:{type:'apiKey',value:'synthetic-credential'}},'credential field "value"','/credential/value',{credential:{type:'apiKey'}}],
    [{smtp:{auth:{user:'ops',pw:'synthetic-credential'}}},'credential field "pw"','/smtp/auth/pw',{smtp:{auth:{user:'ops'}}}],
    [{auth:{jwt:'synthetic-credential'}},'credential field "jwt"','/auth/jwt',{auth:{}}]] as const){
    await assert.rejects(read(value),(error:any)=>error.code==='INVALID_OR_CREDENTIAL_SOURCE_DATA'&&error.field===field,field);
    const removed=await readRemoved(value);
    assert.deepEqual([removed.records[0].payload,removed.diagnostics.filter(d=>d.code==='CREDENTIAL_REMOVED').map(d=>d.field)],[{uri:'https://source.test/event',...kept},[path]],path);
  }
  // A `{name|key, value}` pair named `Signature` or `Session-Id` under a header container (customHttpHeaders, Postman's `header`, HAR's `headers`) is a credential.
  const headerPairs={customHttpHeaders:[{name:'Signature',value:'synthetic-credential-a'},{name:'Accept',value:'*/*'}],request:{header:[{key:'Session-Id',value:'synthetic-credential-b'}]},
    entries:[{request:{headers:[{name:'Signature',value:'synthetic-credential-c'}]}}]};
  const pairs=await readRemoved(headerPairs);
  assert.deepEqual([pairs.records[0].payload,pairs.diagnostics.filter(d=>d.code==='CREDENTIAL_REMOVED').map(d=>d.field)],
    [{uri:'https://source.test/event',customHttpHeaders:[{name:'Signature'},{name:'Accept',value:'*/*'}],request:{header:[{key:'Session-Id'}]},entries:[{request:{headers:[{name:'Signature'}]}}]},
      ['/customHttpHeaders/0/value','/request/header/0/value','/entries/0/request/headers/0/value']]);
});
