import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID, sign, X509Certificate } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { createServer } from 'node:http';
const idpServers = new Map();

const execute = promisify(execFile);
const marker = directory => path.join(directory, 'saml-edge.json');
const requests = directory => path.join(directory, 'saml-requests.jsonl');
const ns = 'urn:oasis:names:tc:SAML:2.0:assertion';
const ds = 'http://www.w3.org/2000/09/xmldsig#';
const c14n = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const escape = value => String(value).replace(/[&<>"\r\n\t]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\r': '&#xD;', '\n': '&#xA;', '\t': '&#x9;' })[ch]);

/** Ephemeral test-only RSA material: the real verifier receives this certificate. */
export async function initializeSamlEdge(directory) {
  const key = path.join(directory, 'saml-test-key.pem'), certificate = path.join(directory, 'saml-test-certificate.pem');
  await execute('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-keyout', key, '-out', certificate,
    '-days', '2', '-subj', '/CN=synthetic-slate-601.invalid']);
  const pem = await readFile(certificate, 'utf8');
  assert.equal(new X509Certificate(pem).publicKey.asymmetricKeyType, 'rsa');
  // A real loopback HTTP edge also receives redirects; browser routing only intercepts the first request in a redirect chain.
  const server = createServer((request, response) => {
    serveSamlIdp(directory, new URL(request.url, 'http://127.0.0.1')).then(html => { response.writeHead(200, {'content-type':'text/html; charset=utf-8'}); response.end(html); }).catch(cause => { response.writeHead(500, {'content-type':'text/plain'}); response.end('The synthetic identity provider could not complete its response.'); console.error(cause); });
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  idpServers.set(directory,server);
  const fixture = { certificate: pem, idpEntityId: 'https://synthetic-slate-601.invalid/entity',
    ssoUrl: `http://127.0.0.1:${server.address().port}/synthetic-slate-601/sso`, emailDomain: 'synthetic-slate-602.invalid' };
  await writeFile(marker(directory), JSON.stringify({ fixture, dns: { published: false }, assertion: { email: 'synthetic-slate-603@synthetic-slate-602.invalid', variant: 'valid' } }));
  await writeFile(requests(directory), '');
  return fixture;
}

async function update(directory, field, value) {
  const state = JSON.parse(await readFile(marker(directory), 'utf8'));
  state[field] = { ...state[field], ...value };
  await writeFile(marker(directory), JSON.stringify(state));
}
export const setSamlDns = (directory, value) => update(directory, 'dns', value);
export const setSamlAssertion = (directory, value) => update(directory, 'assertion', value);
export async function readSamlRequests(directory) {
  return (await readFile(requests(directory), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
}

/** Standard enveloped assertion signature, with exclusive canonical XML. */
export async function samlResponse(directory, { origin, email, requestId, variant = 'valid' }) {
  const { fixture } = JSON.parse(await readFile(marker(directory), 'utf8'));
  const id = '_' + randomUUID(), responseId = '_' + randomUUID();
  const issued = new Date().toISOString(), before = new Date(Date.now() - 30000).toISOString(), after = new Date(Date.now() + 120000).toISOString();
  const acs = origin + '/auth/saml/acs', audience = variant === 'wrong-audience' ? 'https://synthetic-slate-604.invalid/metadata' : origin + '/auth/saml/metadata';
  const correlation = requestId ? ` InResponseTo="${escape(requestId)}"` : '';
  // Attribute order and expanded empty tags below are canonical, not pretty XML.
  const issuer = `<saml:Issuer>${escape(fixture.idpEntityId)}</saml:Issuer>`;
  const start = `<saml:Assertion xmlns:saml="${ns}" ID="${id}" IssueInstant="${issued}" Version="2.0">`;
  const content = `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${escape(email)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData${correlation} NotOnOrAfter="${after}" Recipient="${escape(acs)}"></saml:SubjectConfirmationData></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${after}"><saml:AudienceRestriction><saml:Audience>${escape(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${issued}" SessionIndex="${id}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>`;
  const unsigned = start + issuer + content + '</saml:Assertion>';
  const digest = createHash('sha256').update(unsigned).digest('base64');
  const signedInfo = `<ds:SignedInfo xmlns:ds="${ds}"><ds:CanonicalizationMethod Algorithm="${c14n}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod><ds:Reference URI="#${id}"><ds:Transforms><ds:Transform Algorithm="${ds}enveloped-signature"></ds:Transform><ds:Transform Algorithm="${c14n}"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${digest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
  const key = await readFile(path.join(directory, 'saml-test-key.pem'));
  const signatureBytes = sign('RSA-SHA256', Buffer.from(signedInfo), key);
  if (variant === 'wrong-signature') signatureBytes[0] ^= 1;
  const cert = fixture.certificate.replace(/-----[^-]+-----|\s/g, '');
  const signature = `<ds:Signature xmlns:ds="${ds}">${signedInfo}<ds:SignatureValue>${signatureBytes.toString('base64')}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature>`;
  const assertion = start + issuer + (variant === 'unsigned' ? '' : signature) + content + '</saml:Assertion>';
  return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" Destination="${escape(acs)}" ID="${responseId}"${correlation} IssueInstant="${issued}" Version="2.0"><saml:Issuer xmlns:saml="${ns}">${escape(fixture.idpEntityId)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"></samlp:StatusCode></samlp:Status>${assertion}</samlp:Response>`;
}

/** The browser crosses an IdP HTTP boundary and POSTs the actual signed XML to Slate. */
export async function installSamlIdp(_context, directory, origin) {
  const state = JSON.parse(await readFile(marker(directory), 'utf8'));
  assert.notEqual(new URL(state.fixture.ssoUrl).origin, origin, 'The test IdP is a different origin');
  await writeFile(marker(directory), JSON.stringify({...state,origin}));
}
export async function closeSamlIdp(directory) {
  const server=idpServers.get(directory);if(!server)return;idpServers.delete(directory);
  await new Promise((resolve,reject)=>server.close(cause=>cause?reject(cause):resolve()));
}
async function serveSamlIdp(directory,url) {
  const { assertion, origin } = JSON.parse(await readFile(marker(directory), 'utf8'));
    assert.equal(url.pathname, '/synthetic-slate-601/sso');
    let requestId;
    if (url.searchParams.has('SAMLRequest')) {
      const xml = inflateRawSync(Buffer.from(url.searchParams.get('SAMLRequest'), 'base64')).toString('utf8');
      assert.match(xml, /AuthnRequest/);
      requestId = /\bID=["']([^"']+)["']/.exec(xml)?.[1];
      assert.ok(requestId, 'The real SP AuthnRequest has an ID');
      assert.ok(xml.includes(origin + '/auth/saml/acs'), 'The SP names its real ACS');
      assert.ok(xml.includes(origin + '/auth/saml/metadata'), 'The SP names its real issuer');
    }
    const xml = await samlResponse(directory, { origin, requestId, ...assertion });
    await appendFile(requests(directory), JSON.stringify({ kind: 'idp', initiated: requestId ? 'sp' : 'idp', requestId: requestId ?? null, email: assertion.email, variant: assertion.variant }) + '\n');
    const relay = url.searchParams.get('RelayState');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic SAML identity provider</title></head><body><main><h1>Identity verified by the test IdP</h1><form method="post" action="${escape(origin + '/auth/saml/acs')}"><input type="hidden" name="SAMLResponse" value="${Buffer.from(xml).toString('base64')}">${relay ? `<input type="hidden" name="RelayState" value="${escape(relay)}">` : ''}<button type="submit">Continue to Slate</button></form></main></body></html>`;
    return html;
}

/** Only DNS-over-HTTPS is substituted; owner verification and scheduling run unchanged. */
export async function samlEdge(request, directory, ResponseClass) {
  const url = new URL(request.url);
  if (url.origin !== 'https://cloudflare-dns.com' || url.pathname !== '/dns-query') return null;
  let state;
  try { state = JSON.parse(await readFile(marker(directory), 'utf8')); }
  catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
  assert.equal(request.method, 'GET');
  assert.equal(url.searchParams.get('type'), 'TXT');
  const name = url.searchParams.get('name');
  assert.equal(name, '_slate-saml.' + state.fixture.emailDomain);
  await appendFile(requests(directory), JSON.stringify({ kind: 'dns', name, published: state.dns.published }) + '\n');
  return new ResponseClass(JSON.stringify({ Status: 0, Answer: state.dns.published ? [{ name, type: 16, TTL: 60, data: JSON.stringify(state.dns.value) }] : [] }), { headers: { 'content-type': 'application/dns-json' } });
}
