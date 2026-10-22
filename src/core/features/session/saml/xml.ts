import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import { X509Certificate } from 'node:crypto';
import { z } from 'zod';
import { ApiProblem } from '../../../app/problems';
import { DS_NS, PROTOCOL_NS, SAML_NS, samlEndpoints, type SamlAssertion, type SamlConfig, DAY } from './types';

const C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const signatures = new Set(['sha256','sha384','sha512'].map(hash => `http://www.w3.org/2001/04/xmldsig-more#rsa-${hash}`));
const digests = new Set(['http://www.w3.org/2001/04/xmlenc#sha256','http://www.w3.org/2001/04/xmldsig-more#sha384','http://www.w3.org/2001/04/xmlenc#sha512']);
const emailAttributes = new Set(['email','mail','urn:oid:0.9.2342.19200300.100.1.3','http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']);
const fail = ():never => { throw new ApiProblem(400, 'SAML_INVALID', 'The SAML response could not be verified.'); };
const assert = (condition:unknown):void => { if (!condition) fail(); };
export const escapeXml = (value:string) => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]!));
const children = (node:XmlElement, ns:string, name:string) => Array.from(node.childNodes).filter((n):n is XmlElement => n.nodeType===1 && (n as XmlElement).namespaceURI===ns && n.localName===name);
const one = (node:XmlElement, ns:string, name:string):XmlElement => { const values=children(node,ns,name); assert(values.length===1); return values[0]!; };
const text = (node:XmlElement) => { assert(!Array.from(node.childNodes).some(n=>n.nodeType===1)); return (node.textContent??'').trim(); };
const attr = (node:XmlElement, name:string) => node.getAttribute(name)??'';
const time = (value:string):number => { assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)); const result=Date.parse(value); assert(Number.isFinite(result)); return result; };
const id = (value:string) => { assert(/^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/.test(value)); return value; };
function parse(xml:string) {
 assert(xml.length>0 && xml.length<=256*1024 && !/<!DOCTYPE|<!ENTITY/i.test(xml));
 const doc = new DOMParser({ onError: () => fail() }).parseFromString(xml,'application/xml');
 assert(doc.documentElement && !doc.doctype);
 const nodes=Array.from(doc.getElementsByTagName('*')); assert(nodes.length<3000);
 const ids=new Set<string>();
 for(const node of nodes){
  let depth=0; for(let p=node.parentNode;p;p=p.parentNode)assert(++depth<32);
  for(const a of Array.from(node.attributes))if(a.localName?.toLowerCase()==='id'){
   assert(!ids.has(a.value)); ids.add(a.value);
  }
 }
 return doc;
}
export function validateCertificate(pem:string, now=Date.now()):string {
 try {
  assert(/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(pem.trim()));
  assert((pem.match(/-----BEGIN CERTIFICATE-----/g)??[]).length===1);
  const cert=new X509Certificate(pem), key=cert.publicKey;
  assert(key.asymmetricKeyType==='rsa' && (key.asymmetricKeyDetails?.modulusLength??0)>=2048);
  assert(Date.parse(cert.validFrom)<=now && Date.parse(cert.validTo)>now);
  return cert.toString();
 } catch { return fail(); }
}

/** Claims are read exclusively from the verifier's authenticated reference bytes. */
export function verifySamlResponse(xml:string, config:SamlConfig, origin:string, now:number):SamlAssertion {
 try {
  const doc=parse(xml), response=doc.documentElement!;
  assert(response.namespaceURI===PROTOCOL_NS && response.localName==='Response' && attr(response,'Version')==='2.0');
  id(attr(response,'ID'));
  const endpoints=samlEndpoints(origin);
  assert(attr(response,'Destination')===endpoints.acsUrl);
  assert(Math.abs(time(attr(response,'IssueInstant'))-now)<=300_000);
  assert(text(one(response,SAML_NS,'Issuer'))===config.idp_entity_id);
  assert(attr(one(one(response,PROTOCOL_NS,'Status'),PROTOCOL_NS,'StatusCode'),'Value')==='urn:oasis:names:tc:SAML:2.0:status:Success');
  assert(doc.getElementsByTagNameNS(SAML_NS,'Assertion').length===1 && !doc.getElementsByTagNameNS(SAML_NS,'EncryptedAssertion').length);
  const assertion=one(response,SAML_NS,'Assertion'), assertionId=id(attr(assertion,'ID'));
  const signature=one(assertion,DS_NS,'Signature');
  // Reject wrapping, external references, weak algorithms and transform programs.
  const allSignatures=Array.from(doc.getElementsByTagNameNS(DS_NS,'Signature'));
  assert(allSignatures.length<=2 && allSignatures.every(s=>s.parentNode===assertion||s.parentNode===response));
  // The verifier also recognizes some XMLDSig nodes by local name. Reject
  // namespace lookalikes and hidden algorithm/reference nodes before loading it.
  for(const sig of allSignatures){
   const expected:Record<string,number>={SignedInfo:1,CanonicalizationMethod:1,SignatureMethod:1,Reference:1,Transforms:1,Transform:2,DigestMethod:1,DigestValue:1,SignatureValue:1};
   for(const [name,count] of Object.entries(expected)){
    const descendants=Array.from(sig.getElementsByTagName('*')).filter(n=>n.localName===name);
    assert(descendants.length===count && descendants.every(n=>n.namespaceURI===DS_NS));
   }
   const info=one(sig,DS_NS,'SignedInfo'),ref=one(info,DS_NS,'Reference');
   assert(attr(one(info,DS_NS,'CanonicalizationMethod'),'Algorithm')===C14N);
   assert(signatures.has(attr(one(info,DS_NS,'SignatureMethod'),'Algorithm')));
   assert(digests.has(attr(one(ref,DS_NS,'DigestMethod'),'Algorithm')));
   const steps=children(one(ref,DS_NS,'Transforms'),DS_NS,'Transform');
   assert(steps.length===2 && attr(steps[0]!,'Algorithm')===`${DS_NS}enveloped-signature` && attr(steps[1]!,'Algorithm')===C14N);
   assert(!Array.from(one(info,DS_NS,'SignatureMethod').childNodes).some(n=>n.nodeType===1));
   assert(!sig.getElementsByTagNameNS(DS_NS,'Object').length && !sig.getElementsByTagNameNS(DS_NS,'Manifest').length);
  }
  const signedInfo=one(signature,DS_NS,'SignedInfo');
  assert(attr(one(signedInfo,DS_NS,'CanonicalizationMethod'),'Algorithm')===C14N);
  assert(signatures.has(attr(one(signedInfo,DS_NS,'SignatureMethod'),'Algorithm')));
  const reference=one(signedInfo,DS_NS,'Reference');
  assert(attr(reference,'URI')===`#${assertionId}`);
  assert(digests.has(attr(one(reference,DS_NS,'DigestMethod'),'Algorithm')));
  const transforms=children(one(reference,DS_NS,'Transforms'),DS_NS,'Transform');
  assert(transforms.length===2 && attr(transforms[0]!,'Algorithm')===`${DS_NS}enveloped-signature` && attr(transforms[1]!,'Algorithm')===C14N);
  assert(!signature.getElementsByTagNameNS(DS_NS,'Object').length && !signature.getElementsByTagNameNS(DS_NS,'Manifest').length);
  const verifier=new SignedXml({ publicCert:validateCertificate(config.certificate,now), getCertFromKeyInfo:()=>null });
  verifier.loadSignature(signature as unknown as Node);
  assert(verifier.checkSignature(xml));
  const references=verifier.getSignedReferences(); assert(references.length===1);
  const signed=parse(references[0]!).documentElement!;
  assert(signed.namespaceURI===SAML_NS && signed.localName==='Assertion' && attr(signed,'ID')===assertionId && attr(signed,'Version')==='2.0');
  assert(Math.abs(time(attr(signed,'IssueInstant'))-now)<=300_000);
  const issuer=text(one(signed,SAML_NS,'Issuer')); assert(issuer===config.idp_entity_id);
  const conditions=one(signed,SAML_NS,'Conditions');
  const notBefore=time(attr(conditions,'NotBefore')), expiresAt=time(attr(conditions,'NotOnOrAfter'));
  assert(notBefore<=now+60_000 && expiresAt>now && expiresAt>notBefore && expiresAt<=now+DAY);
  const restrictions=children(conditions,SAML_NS,'AudienceRestriction'); assert(restrictions.length>0);
  assert(Array.from(conditions.childNodes).filter(n=>n.nodeType===1).every(n=>n.namespaceURI===SAML_NS && ['AudienceRestriction','OneTimeUse'].includes(n.localName!)));
  // Each restriction is an AND; audiences within one restriction are an OR.
  for(const restriction of restrictions)assert(children(restriction,SAML_NS,'Audience').some(a=>text(a)===endpoints.entityId));
  const subjectNode=one(signed,SAML_NS,'Subject'), name=one(subjectNode,SAML_NS,'NameID'), subject=text(name);
  assert(subject.length>0 && subject.length<=1024);
  const confirmation=one(subjectNode,SAML_NS,'SubjectConfirmation'); assert(attr(confirmation,'Method')==='urn:oasis:names:tc:SAML:2.0:cm:bearer');
  const data=one(confirmation,SAML_NS,'SubjectConfirmationData');
  assert(attr(data,'Recipient')===endpoints.acsUrl);
  const confirmationExpiry=time(attr(data,'NotOnOrAfter')); assert(confirmationExpiry>now && confirmationExpiry<=expiresAt);
  if(data.hasAttribute('NotBefore'))assert(time(attr(data,'NotBefore'))<=now+60_000);
  const inResponseTo=attr(data,'InResponseTo')||null;
  assert((attr(response,'InResponseTo')||null)===inResponseTo);
  if(inResponseTo)id(inResponseTo);
  const authn=one(signed,SAML_NS,'AuthnStatement'); assert(time(attr(authn,'AuthnInstant'))<=now+60_000);
  if(authn.hasAttribute('SessionNotOnOrAfter'))assert(time(attr(authn,'SessionNotOnOrAfter'))>now);
  const emails:string[]=[];
  for(const statement of children(signed,SAML_NS,'AttributeStatement'))for(const attribute of children(statement,SAML_NS,'Attribute'))if(emailAttributes.has(attr(attribute,'Name'))){
   const values=children(attribute,SAML_NS,'AttributeValue'); assert(values.length===1); emails.push(text(values[0]!).toLowerCase());
  }
  if(attr(name,'Format')==='urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'||!emails.length&&subject.includes('@'))emails.push(subject.toLowerCase());
  assert(emails.length>0 && new Set(emails).size===1);
  const email=emails[0]!; assert(email.length<=254 && z.string().email().safeParse(email).success);
  return {id:assertionId,issuer,subject,email,expiresAt:Math.min(expiresAt,confirmationExpiry),inResponseTo};
 } catch { return fail(); }
}
