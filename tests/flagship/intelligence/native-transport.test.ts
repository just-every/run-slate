import {runFoldCases} from '../fold-cases';
import {test,expect,vi,afterEach} from 'vitest';
import {NativeAdapter,nativeTimeSchema} from '../../../src/core/features/connectors/native';
import {exchangeToken} from '../../../src/core/features/connectors/oauth-provider';
afterEach(()=>vi.unstubAllGlobals());
test("native transport refuses credential redirects and preserves exact bounded timestamps", async () => {
  await runFoldCases([
{name:"Native transport refuses redirected token and credential requests without following a location",before:async()=>{},run:async()=>{
try {

 const calls:{url:string;redirect?:RequestRedirect}[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{calls.push({url,redirect:init.redirect});return new Response(null,{status:302,headers:{location:'https://untrusted.example/receive'}});});
 await expect(exchangeToken('orbit',{code:'test-only'},'https://source.example/api/delegation/v1/token')).rejects.toMatchObject({code:'OAUTH_EXCHANGE_FAILED'});
 const adapter=new NativeAdapter('orbit','test-only',{origin:'https://source.example',clientId:'slate',accountId:'workspace',allowLoopback:false});
 await expect(adapter.identity()).rejects.toMatchObject({code:'SOURCE_REDIRECT_REFUSED'});expect(calls).toHaveLength(2);expect(calls.every(call=>call.redirect==='manual'&&call.url.startsWith('https://source.example/'))).toBe(true);

} finally {{await (vi.unstubAllGlobals());}}
}},
{name:"Native timestamps preserve valid ISO instants and normalize bounded Unix milliseconds",before:async()=>{},run:async()=>{
try {
const iso='2026-09-29T00:00:00.000Z';expect(nativeTimeSchema.parse(Date.parse(iso))).toBe(iso);expect(nativeTimeSchema.parse(iso)).toBe(iso);for(const value of [NaN,Infinity,-1,8.64e15+1,'unknown',''])expect(nativeTimeSchema.safeParse(value).success).toBe(false);
} finally {{await (vi.unstubAllGlobals());}}
}}
  ]);
});
