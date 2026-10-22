import { SignedXml } from 'xml-crypto';
import { inflateRawSync } from 'node:zlib';

const ns='urn:oasis:names:tc:SAML:2.0:assertion',ds='http://www.w3.org/2000/09/xmldsig#',c14n='http://www.w3.org/2001/10/xml-exc-c14n#';
const xml=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]!));
const concat=(...values:Uint8Array[])=>{const out=new Uint8Array(values.reduce((n,v)=>n+v.length,0));let offset=0;for(const value of values){out.set(value,offset);offset+=value.length;}return out;};
const der=(tag:number,body:Uint8Array)=>concat(new Uint8Array([tag,...(body.length<128?[body.length]:body.length<256?[0x81,body.length]:[0x82,body.length>>8,body.length&255])]),body);
const sequence=(...values:Uint8Array[])=>der(0x30,concat(...values));
const bytes=(value:string)=>new TextEncoder().encode(value);
const pem=(label:string,data:Uint8Array)=>`-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...data)).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----`;

/** A real ephemeral RSA X.509 identity, generated inside the Workers runtime. */
async function identity() {
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['sign','verify']) as CryptoKeyPair;
 const algorithm=sequence(der(6,new Uint8Array([0x2a,0x86,0x48,0x86,0xf7,0x0d,1,1,0x0b])),der(5,new Uint8Array()));
 const name=sequence(der(0x31,sequence(der(6,new Uint8Array([0x55,4,3])),der(0x0c,bytes('SAML network test')))));
 const date=(offset:number)=>der(0x18,bytes(new Date(Date.now()+offset).toISOString().replace(/[-:T]/g,'').replace(/\.\d{3}Z$/,'Z')));
 const tbs=sequence(der(0xa0,der(2,new Uint8Array([2]))),der(2,new Uint8Array([1,...crypto.getRandomValues(new Uint8Array(15))])),algorithm,name,sequence(date(-86400000),date(86400000)),name,new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)));
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,tbs);
 return {certificate:pem('CERTIFICATE',sequence(tbs,algorithm,der(3,concat(new Uint8Array([0]),new Uint8Array(signature))))),privateKey:pem('PRIVATE KEY',new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey)))};
}

export async function samlProviderEdge() {
 const key=await identity(),issuer='https://saml-network-edge.invalid/entity',ssoUrl='https://saml-network-edge.invalid/sso';
 let published=false,dnsValue='',dnsName='';const observed:string[]=[];
 const previous=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin!=='https://cloudflare-dns.com')return previous(input,init);
  if(url.pathname!=='/dns-query'||url.searchParams.get('type')!=='TXT'||url.searchParams.get('name')!==dnsName)throw Error('Unexpected DNS edge request');
  observed.push(request.url);
  return Response.json({Status:0,Answer:published?[{name:dnsName,type:16,data:JSON.stringify(dnsValue)}]:[]});
 };
 function assertion(input:{origin:string;email:string;requestId?:string;variant?:string;audience?:string;recipient?:string;expiresAt?:number;subject?:string}) {
  const now=new Date().toISOString(),after=new Date(input.expiresAt??Date.now()+120000).toISOString(),before=new Date(Date.now()-30000).toISOString(),id='_'+crypto.randomUUID();
  const acs=input.origin+'/auth/saml/acs',correlation=input.requestId?` InResponseTo="${xml(input.requestId)}"`:'';
  const unsigned=`<saml:Assertion xmlns:saml="${ns}" ID="${id}" IssueInstant="${now}" Version="2.0"><saml:Issuer>${issuer}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${xml(input.subject??input.email)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData${correlation} NotOnOrAfter="${after}" Recipient="${xml(input.recipient??acs)}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${after}"><saml:AudienceRestriction><saml:Audience>${xml(input.audience??input.origin+'/auth/saml/metadata')}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement></saml:Assertion>`;
  let signed=unsigned;
  if(input.variant!=='unsigned'){
   const signer=new SignedXml({privateKey:key.privateKey,publicCert:key.certificate,signatureAlgorithm:'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',canonicalizationAlgorithm:c14n});
   signer.addReference({xpath:"//*[local-name(.)='Assertion']",transforms:[ds+'enveloped-signature',c14n],digestAlgorithm:'http://www.w3.org/2001/04/xmlenc#sha256'});
   signer.computeSignature(unsigned,{prefix:'ds',location:{reference:"//*[local-name(.)='Issuer']",action:'after'}});
   signed=signer.getSignedXml();
   if(input.variant==='wrong-signature')signed=signed.replace(/(<ds:SignatureValue>)([A-Za-z0-9+/])/,(_all,start,first)=>start+(first==='A'?'B':'A'));
  }
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${crypto.randomUUID()}" Version="2.0" IssueInstant="${now}" Destination="${xml(acs)}"${correlation}><saml:Issuer xmlns:saml="${ns}">${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${signed}</samlp:Response>`;
 }
 return {issuer,ssoUrl,certificate:key.certificate,assertion,observed,
  dns:(name:string,value:string,exists=true)=>{dnsName=name;dnsValue=value;published=exists;},
  unpublish:()=>{published=false;},
  requestId:(response:Response)=>{const url=new URL(response.headers.get('location')!);return {id:/\bID="([^"]+)"/.exec(inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest')!,'base64')).toString())![1]!,relay:url.searchParams.get('RelayState')!,cookie:response.headers.get('set-cookie')!.split(';')[0]!};},
  restore:()=>{globalThis.fetch=previous;},
 };
}
