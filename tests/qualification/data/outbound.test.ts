import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import manifest from '../../../seed.json';
import {previewLink,publicPreviewTransport} from '../../../src/core/features/editor/link-preview';
import {createResendMailer} from '../../../src/core/platform/mail/resend';
import {generateAnswer} from '../../../src/core/features/ai/provider';
import {providerJson} from '../../../src/core/features/connectors/http';
import {exchangeToken} from '../../../src/core/features/connectors/oauth-provider';
const boundary=()=> (env as unknown as {DATA_PROOF_LOG:Fetcher}).DATA_PROOF_LOG;
async function reset(){await boundary().fetch('https://boundary.invalid',{method:'DELETE'});}
async function requests(){return (await boundary().fetch('https://boundary.invalid')).json<{url:string;method:string;body:string;headers:Record<string,string>}[]>();}
test('BASE-DATA-004 actual pasted-link hostname DNS disclosure is declared',async()=>{
 await reset();expect((await previewLink('https://personal-canary.example.com/private',publicPreviewTransport)).preview.title).toBe('Local canary fixture');
 const sent=await requests();expect(sent).toHaveLength(3);expect(sent.filter(r=>new URL(r.url).hostname==='cloudflare-dns.com')).toHaveLength(2);
 expect(sent.every(r=>!r.headers.authorization&&!r.headers.cookie&&!r.body)).toBe(true);
 expect(JSON.stringify(manifest.externals)).toMatch(/DNS|dns/);
});
test('BASE-DATA-004 actual provider requests carry canaries only to declared external families',async()=>{
 await reset();await createResendMailer({from:'test@example.invalid',apiKey:'TEST-ONLY'}).send({to:'personal-canary@example.invalid',subject:'Sign in',text:'Personal sign-in URL https://owner.invalid/token/canary'});
 await expect(generateAnswer({apiKey:'TEST-ONLY'},{provider:'openai',model:'test',inputMicrosPerMillion:1,outputMicrosPerMillion:1} as never,'Personal AI canary',[],10,new AbortController().signal)).rejects.toThrow();
 for(const url of ['https://api.github.com/repos/canary/private/issues/1','https://slack.com/api/conversations.history?channel=personal-canary','https://www.googleapis.com/drive/v3/files/personal-canary'])await expect(providerJson(url,'TEST-ONLY')).rejects.toThrow();
 await expect(exchangeToken('github',{code:'personal-canary-code',client_id:'test',client_secret:'TEST-ONLY'})).rejects.toThrow();
 const sent=await requests();expect(sent).toHaveLength(6);expect(sent.map(r=>new URL(r.url).hostname)).toEqual(['api.resend.com','api.openai.com','api.github.com','slack.com','www.googleapis.com','github.com']);
 expect(sent[0].body).toContain('personal-canary@example.invalid');expect(sent[1].body).toContain('Personal AI canary');expect(sent[5].body).toContain('personal-canary-code');
 for(const id of ['resend-transactional-email','ai-inference-provider','connected-source-providers'])expect(manifest.externals.some(e=>e.id===id)).toBe(true);
});
test('BASE-DATA-004 identity, chat, native delegations and local inference remain inside declared destinations',async()=>{
 const {beginIdentity,finishIdentity}=await import('../../../src/core/features/session/oidc');const {readRuntimeConfig}=await import('../../../src/core/platform/config/runtime');
 const {slackNotifier}=await import('../../../src/core/features/notifications/slack');const {NativeAdapter}=await import('../../../src/core/features/connectors/native');
 await reset();
 const config={...readRuntimeConfig(env,false),ssoEnabled:true,identityIssuerUrl:'https://identity.example.invalid',identityClientId:'TEST-CLIENT',identityClientSecret:'TEST-SECRET'};
 const start=await beginIdentity(env.DB,config);await expect(finishIdentity(env.DB,config,{state:start.state,cookieState:start.state,code:'personal-canary-identity-code'})).rejects.toThrow();
 await expect(slackNotifier().send('TEST-TOKEN','C123','Personal canary actor — title https://owner.invalid/page','local-idempotency-key')).rejects.toThrow();
 for(const provider of ['happytohelp','orbit'] as const){const adapter=new NativeAdapter(provider,'TEST-TOKEN',{origin:`https://${provider}.example.invalid`,accountId:'test-account',clientId:'test-client',allowLoopback:false});await expect(adapter.request('evidence?target=personal-canary')).rejects.toThrow();}
 await expect(generateAnswer({localUrl:'http://127.0.0.1:9999',localToken:'TEST-TOKEN'},{provider:'local-codex',model:'test'} as never,'Personal local canary',[],10,new AbortController().signal)).rejects.toThrow();
 const sent=await requests();expect(sent.map(r=>new URL(r.url).hostname)).toEqual(['identity.example.invalid','identity.example.invalid','identity.example.invalid','slack.com','happytohelp.example.invalid','orbit.example.invalid','127.0.0.1']);
 expect(sent[2].body).toContain('personal-canary-identity-code');expect(sent[3].body).toContain('Personal canary actor');expect(sent[6].body).toContain('Personal local canary');
 for(const id of ['identity-provider','chat-notification-destination','connected-source-providers','ai-inference-provider'])expect(manifest.externals.some(e=>e.id===id)).toBe(true);
});
