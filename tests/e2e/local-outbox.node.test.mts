import test from 'node:test';
import assert from 'node:assert/strict';
import { localMailDatabase } from './helpers/local-mail-database';
import { developmentOutbox } from '../../src/core/app/development-outbox';
import { readRuntimeConfig } from '../../src/core/platform/config/runtime';
import { createSessionService } from '../../src/core/features/session/service';
import { createSessionRoutes } from '../../src/core/features/session/routes';
import { ApiProblem } from '../../src/core/app/problems';
import { Hono } from 'hono';
import type { AppBindings } from '../../src/core/app/types';
import type { FeatureContext } from '../../src/core/app/feature-context';
import { invite, acceptInvitation, revokeInvitation } from '../../src/core/features/workspace/invitations';
import { completeFirstRun } from '../../src/core/features/workspace/bootstrap';
import { listMembers } from '../../src/core/features/workspace/members';
import { containerIndex } from '../../src/core/features/containers/queries';
import { currentSubject, requirePageLevel, requireContainerLevel } from '../../src/core/features/sharing/current-access';
import { search } from '../../src/core/features/search/service';
const settings = {LOCAL_DEVELOPMENT:'true', APP_URL:'http://127.0.0.1:4312',SETUP_OWNER_EMAIL:'owner@example.com',SESSION_SECRET:'test-only-local-secret',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',RER_DEV_KEY:'test-only-local-dev-key'.padEnd(43,'k')};
const config = () => readRuntimeConfig(settings, true);
const request = (url = `${settings.APP_URL}/__dev/outbox`, headers: Record<string,string> = {host:'127.0.0.1:4312','x-rer-dev-key':settings.RER_DEV_KEY}) => new Request(url, {headers});
const sessions = (db: D1Database) => createSessionService(db,{sessionSecret:settings.SESSION_SECRET,identityEnabled:false});
const local = {host:'127.0.0.1:4312',origin:settings.APP_URL};
/** The public session routes as the Worker mounts them, with the checked local configuration. */
function routes() {
  const app = new Hono<any>().use('*', async (context, next) => {context.set('runtimeConfig',config());await next();}).route('/',createSessionRoutes());
  app.onError((cause,context) => context.json({code:cause instanceof ApiProblem?cause.code:'INTERNAL_ERROR'},cause instanceof ApiProblem?cause.status:500));
  return app;
}
type LocalApp = ReturnType<typeof routes>;
const requestLink = (app: LocalApp, db: D1Database, email: string) => app.request(`${settings.APP_URL}/api/auth/magic`,{method:'POST',headers:{...local,'content-type':'application/json'},body:JSON.stringify({email,requestKey:crypto.randomUUID()})},{...settings,DB:db});
const confirmLink = (app: LocalApp, db: D1Database, token: string) => app.request(`${settings.APP_URL}/auth/confirm`,{method:'POST',headers:{...local,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})},{...settings,DB:db});
/** WORK-006: the invitation link shows a page and sets nothing; its form POST accepts and signs in. */
async function acceptThroughRoute(app: LocalApp, db: D1Database, token: string) {
  const url = `${settings.APP_URL}/api/auth/invitation/accept`;
  const shown = await app.request(`${url}?token=${encodeURIComponent(token)}`,{headers:local},{...settings,DB:db});
  assert.equal(shown.status,200);assert.deepEqual(shown.headers.getSetCookie(),[]);assert.match(await shown.text(),/method="post" action="\/api\/auth\/invitation\/accept"/);
  const accepted = await app.request(url,{method:'POST',headers:{...local,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})},{...settings,DB:db});
  assert.equal(accepted.status,303);assert.equal(accepted.headers.get('location'),'/app');
  return sessionCookie(accepted).slice('slate_session='.length);
}
const sessionCookie = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith('slate_session='))!.split(';')[0]!;

test('local outbox refuses hosted origins, hostile Host and cross-site reads before storage or runtime configuration', async () => {
  const bindings = {...settings, DB:{prepare(){throw new Error('must not read');},batch(){throw new Error('must not read');}}} as unknown as AppBindings;
  for (const [req, env] of [
    [request(), {...bindings,LOCAL_DEVELOPMENT:undefined}],
    [request(), {...bindings,MAIL_PROVIDER:'resend'}],
    [request(), {...bindings,APP_URL:'https://hosted.example.com'}],
    [request(), {...bindings,APP_URL:settings.APP_URL+'/'}],
    [request(undefined,{host:'evil.example.com'}),bindings],
    [request(undefined,{}),bindings],
    [request('https://hosted.example.com/__dev/outbox'),bindings],
    [request(undefined,{host:'127.0.0.1:4312',origin:'https://evil.example.com'}),bindings],
    [request(undefined,{host:'127.0.0.1:4312','sec-fetch-site':'cross-site'}),bindings],
    [request(`${settings.APP_URL}/__dev/outbox/extra`),bindings],
    // The local key gate: no key binding, no presented key, or a wrong key.
    [request(),{...bindings,RER_DEV_KEY:undefined}],
    [request(undefined,{host:'127.0.0.1:4312'}),bindings],
    [request(undefined,{host:'127.0.0.1:4312','x-rer-dev-key':'x'.repeat(43)}),bindings],
  ] as const) assert.equal((await developmentOutbox(req,env as AppBindings))?.status,404);
  assert.equal(await developmentOutbox(request(`${settings.APP_URL}/signin`),bindings),null);
});

/** The newest Base sign-in link captured for a mailbox. */
function signInToken(fixture: ReturnType<typeof localMailDatabase>, email: string) {
  const rows = fixture.sql.prepare('SELECT message FROM rer_mail_development_outbox ORDER BY sequence DESC').all();
  const message = rows.map(row => JSON.parse(row.message as string) as {to:string[];text:string}).find(message => message.to.includes(email));
  assert.ok(message, 'Expected a locally captured sign-in message');
  return /\/auth\/confirm\?token=([A-Za-z0-9_-]{43})/.exec(message.text)![1]!;
}

test('native local first magic link bootstraps one owner and each new request captures a new outbox message', async () => {
  const fixture = localMailDatabase(); fixture.migrate();
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Local mail must not contact a provider'); };
  try {
    const env = {...settings,DB:fixture.db} as AppBindings, app = routes();
    assert.equal((await requestLink(app,fixture.db,'other@example.com')).status,200);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM workspaces').get()!.n,0);
    assert.equal((await requestLink(app,fixture.db,settings.SETUP_OWNER_EMAIL)).status,200);
    const first = fixture.sql.prepare('SELECT * FROM rer_mail_development_outbox').get()!;
    const token = signInToken(fixture,settings.SETUP_OWNER_EMAIL);
    const accepted = await confirmLink(app,fixture.db,token);
    assert.equal(accepted.status,303);
    const member = await sessions(fixture.db).authenticate(new Headers({cookie:sessionCookie(accepted)}));
    assert.equal(member?.email,settings.SETUP_OWNER_EMAIL);
    const page = await developmentOutbox(request(),env);
    assert.equal(page?.status,200); assert.match(await page!.text(), /sign-in link for Slate/);
    const detail = await developmentOutbox(request(`${settings.APP_URL}/__dev/outbox?message=${first.id}`),env);
    assert.equal(detail?.status,200); assert.match(await detail!.text(),/auth\/confirm/);
    assert.equal((await requestLink(app,fixture.db,settings.SETUP_OWNER_EMAIL)).status,200);
    const rows=fixture.sql.prepare('SELECT id FROM rer_mail_development_outbox ORDER BY sequence').all();
    assert.equal(rows.length,2); assert.notEqual(rows[0].id,rows[1].id);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM workspaces').get()!.n,1);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM members').get()!.n,1);
    assert.equal((await confirmLink(app,fixture.db,token)).status,400);
  } finally { globalThis.fetch=originalFetch;fixture.close(); }
});

test('existing local member signs in through outbox after additive migration without changing stored workspace data', async () => {
  const fixture = localMailDatabase();
  try {
    fixture.sql.exec("INSERT INTO workspaces(id,name,mark,created_at,updated_at,revision_id) VALUES ('prior','My edited workspace','P','before','before','r'); INSERT INTO members(id,workspace_id,email,display_name,initials,role,is_setup_owner,created_at,updated_at) VALUES ('member','prior','existing@example.com','My name','ME','owner',1,'before','before'); INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES ('container','prior','My documents','open','before','before','r');");
    const snapshot = () => ['workspaces','members','containers'].map(table=>fixture.sql.prepare(`SELECT * FROM ${table}`).all());
    const before = snapshot(); fixture.migrate();
    const app = routes();
    assert.equal((await requestLink(app,fixture.db,'existing@example.com')).status,200);
    assert.equal((await confirmLink(app,fixture.db,signInToken(fixture,'existing@example.com'))).status,303);
    assert.deepEqual(snapshot(),before);
    assert.equal(fixture.sql.prepare('SELECT member_id FROM sessions').get()!.member_id,'member');
    assert.deepEqual(fixture.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { fixture.close(); }
});

test('native local sign-in retains strict JSON magic links and exposes no sample-owner bypass', async () => {
  const fixture = localMailDatabase(); fixture.migrate();
  try {
    const app = routes();
    const env = {...settings,DB:fixture.db};
    for (const body of ['email=owner%40example.com',JSON.stringify({email:settings.SETUP_OWNER_EMAIL,next:'/app'})]) {
      const response=await app.request('/api/auth/magic',{method:'POST',headers:{'content-type':'application/json'},body},env);
      assert.equal(response.status,400);
    }
    assert.equal((await app.request('/api/auth/local-sign-in',{method:'POST'},env)).status,404);
    const capabilities=await (await app.request('/api/auth/capabilities',{},env)).json() as {localOutbox:boolean;mailDelivery:boolean};
    assert.equal(capabilities.localOutbox,true); assert.equal(capabilities.mailDelivery,true); assert.equal(Object.hasOwn(capabilities,'localSession'),false);
    const response=await requestLink(app,fixture.db,settings.SETUP_OWNER_EMAIL);
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{accepted:true});
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM rer_mail_development_outbox').get()!.n,1);
  } finally {fixture.close();}
});

// These are native SQLite/outbox regressions, not hosted-provider or full clause acceptance.
type LocalMailFixture = ReturnType<typeof localMailDatabase>;
function outboxToken(fixture: LocalMailFixture, email: string) {
  const rows = fixture.sql.prepare('SELECT message FROM rer_mail_development_outbox ORDER BY sequence').all();
  const messages = rows.map(row => JSON.parse(row.message as string) as {to:string[];text:string});
  const message = messages.reverse().find(message => message.to.includes(email));
  assert.ok(message, 'Expected a locally captured message for the recipient');
  const token = new URL(message.text.split('\n')[0].split(': ').slice(1).join(': ')).searchParams.get('token');
  assert.ok(token, 'Expected a native acceptance token');
  return token;
}
async function authenticatedContext(fixture: LocalMailFixture, token: string): Promise<FeatureContext> {
  const actor = await sessions(fixture.db).authenticate(new Headers({cookie:`slate_session=${token}`}));
  assert.ok(actor, 'Expected an authenticated native session');
  const unused = new Proxy({}, {get(){throw new Error('Invitation regression must not use files or jobs');}});
  return {db:fixture.db,files:unused as R2Bucket,jobs:unused as Queue<unknown>,actor,now:new Date().toISOString()};
}
async function withLocalOwner(run: (fixture: LocalMailFixture, owner: FeatureContext) => Promise<void>, guestSql = false) {
  // Native guest access uses D1's existing double-quoted SQL literals. Opt in
  // only for these new guest cases; earlier fixtures retain Node's strict default.
  const fixture = localMailDatabase(guestSql ? {enableDoubleQuotedStringLiterals:true} : {}); fixture.migrate();
  const originalFetch = globalThis.fetch; let fetchCalls = 0;
  globalThis.fetch = async () => {fetchCalls++;throw new Error('Local invitations must not contact a provider');};
  try {
    assert.equal(config().mailApiKey,undefined);
    const app = routes();
    assert.equal((await requestLink(app,fixture.db,settings.SETUP_OWNER_EMAIL)).status,200);
    const accepted = await confirmLink(app,fixture.db,signInToken(fixture,settings.SETUP_OWNER_EMAIL));
    await run(fixture,await authenticatedContext(fixture,sessionCookie(accepted).slice('slate_session='.length)));
    assert.deepEqual(fixture.sql.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {globalThis.fetch=originalFetch;fixture.close();assert.equal(fetchCalls,0);}
}
function invitationCounts(fixture: LocalMailFixture) {
  return ['invitations','mail_deliveries','rer_mail_development_outbox','operation_receipts','page_grants','container_grants']
    .map(table => fixture.sql.prepare(`SELECT count(*) n FROM ${table}`).get()!.n);
}

test('native local member invitation delivers once, accepts into a native session and preserves member authority', async () => {
  await withLocalOwner(async (fixture,owner) => {
    const input = {operationKey:crypto.randomUUID(),email:'member@example.com',kind:'member' as const};
    const first = await invite(owner,config(),input);
    assert.deepEqual(first.value,{accepted:true});
    assert.deepEqual(await invite(owner,config(),input),first);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM invitations').get()!.n,1);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM rer_mail_development_outbox').get()!.n,2);
    const delivery = fixture.sql.prepare("SELECT state,delivery_phase,provider,attempt_count,payload_ciphertext FROM mail_deliveries WHERE kind='invitation'").get()!;
    assert.deepEqual({...delivery},{state:'sent',delivery_phase:'sent',provider:'development',attempt_count:1,payload_ciphertext:null});
    const token = outboxToken(fixture,input.email);
    const member = await authenticatedContext(fixture,await acceptThroughRoute(routes(),fixture.db,token));
    assert.equal(member.actor.role,'member');assert.equal(member.actor.email,input.email);
    assert.equal((await currentSubject(member)).isGuest,false);
    assert.equal(fixture.sql.prepare("SELECT count(*) n FROM containers c JOIN container_owners o ON o.container_id=c.id WHERE c.visibility='personal' AND o.member_id=?").get(member.actor.id)!.n,1);
    await assert.rejects(acceptInvitation(fixture.db,config(),token),{code:'LINK_INVALID'});
    await invite(member,config(),{operationKey:crypto.randomUUID(),email:'colleague@example.com',kind:'member'});
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM rer_mail_development_outbox').get()!.n,3);
    const before = invitationCounts(fixture);
    assert.deepEqual((await invite(owner,config(),{operationKey:crypto.randomUUID(),email:input.email,kind:'member'})).value,first.value);
    assert.deepEqual(invitationCounts(fixture).slice(0,3),before.slice(0,3));
  });
});

for (const target of ['page','container'] as const) test(`native local ${target} guest invitation accepts only its named scope and retains guest restrictions`, async () => {
  await withLocalOwner(async (fixture,owner) => {
    const setup = (await completeFirstRun(owner,{operationKey:crypto.randomUUID(),workspaceName:'Local workspace',containerName:'Named container',pageTitle:'Named page'})).value;
    // A second resource with a workspace grant is visible to members, never to scoped guests.
    fixture.sql.prepare("INSERT INTO containers(id,workspace_id,name,visibility,created_at,updated_at,revision_id) VALUES ('unrelated-container',?,'Unrelated container','open',?,?,'unrelated-revision')").run(owner.actor.workspaceId,owner.now,owner.now);
    fixture.sql.prepare("INSERT INTO pages(id,workspace_id,container_id,title,author_member_id,working_revision_id,created_at,updated_at,revision_id) VALUES ('unrelated-page',?,'unrelated-container','Unrelated page',?,'unrelated-revision',?,?,'unrelated-revision')").run(owner.actor.workspaceId,owner.actor.id,owner.now,owner.now);
    fixture.sql.prepare("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES ('unrelated-grant','unrelated-page','workspace',?,'view',?,?)").run(owner.actor.workspaceId,owner.now,owner.now);
    const email = `${target}-guest@example.com`, grantExpiry = new Date(Date.now()+3600000).toISOString();
    const input = {operationKey:crypto.randomUUID(),email,kind:'guest' as const,level:'view' as const,expiresAt:grantExpiry,...(target==='page'?{pageId:setup.pageId}:{containerId:setup.containerId})};
    const result = await invite(owner,config(),input);
    assert.deepEqual(await invite(owner,config(),input),result);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM rer_mail_development_outbox').get()!.n,2);
    const invitation = fixture.sql.prepare('SELECT id,page_grant_id,container_grant_id,accepted_by_member_id FROM invitations').get()!;
    assert.equal(invitation.accepted_by_member_id,null);
    const table = target==='page'?'page_grants':'container_grants';
    const grantId = invitation[target==='page'?'page_grant_id':'container_grant_id'];
    const pending = fixture.sql.prepare(`SELECT principal_id,level,expires_at FROM ${table} WHERE id=?`).get(grantId)!;
    assert.equal(pending.principal_id,`invitation:${invitation.id}`);assert.equal(pending.level,'view');assert.equal(pending.expires_at,grantExpiry);
    const token = outboxToken(fixture,email);
    const guest = await authenticatedContext(fixture,await acceptThroughRoute(routes(),fixture.db,token));
    assert.equal((await currentSubject(guest)).isGuest,true);
    assert.equal(fixture.sql.prepare(`SELECT principal_id FROM ${table} WHERE id=?`).get(grantId)!.principal_id,guest.actor.id);
    assert.equal((await requirePageLevel(guest,setup.pageId,'view')).decision.level,'view');
    await assert.rejects(requirePageLevel(guest,setup.pageId,'edit'),{code:'NOT_FOUND'});
    await assert.rejects(requirePageLevel(guest,'unrelated-page','view'),{code:'NOT_FOUND'});
    if(target==='container')await requireContainerLevel(guest,setup.containerId,'view');
    else await assert.rejects(requireContainerLevel(guest,setup.containerId,'view'),{code:'NOT_FOUND'});
    await assert.rejects(containerIndex(guest),{code:'FORBIDDEN'});
    await assert.rejects(listMembers(guest,'member'),{code:'FORBIDDEN'});
    assert.equal((await listMembers(owner,'member')).items.length,1);
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM container_owners WHERE member_id=?').get(guest.actor.id)!.n,0);
    assert.deepEqual((await search(guest,{query:'page',kind:'page'})).items.map(item=>item.id),[setup.pageId]);
    const before = invitationCounts(fixture);
    await assert.rejects(invite(guest,config(),{operationKey:crypto.randomUUID(),email:'guest-cannot-invite@example.com',kind:'member'}),{code:'FORBIDDEN'});
    assert.deepEqual(invitationCounts(fixture),before);
    await assert.rejects(acceptInvitation(fixture.db,config(),token,owner),{code:'LINK_INVALID'});
  },true);
});

test('native local invitations preserve scope validation, guest veto and revocation before acceptance', async () => {
  await withLocalOwner(async (fixture,owner) => {
    const setup = (await completeFirstRun(owner,{operationKey:crypto.randomUUID(),workspaceName:'Local workspace',containerName:'Named container',pageTitle:'Named page'})).value;
    const before = invitationCounts(fixture);
    for (const [scope,code] of [
      [{kind:'guest'},'TARGET_REQUIRED'],
      [{kind:'guest',pageId:setup.pageId,containerId:setup.containerId},'INVALID_INVITATION_SCOPE'],
      [{kind:'member',pageId:setup.pageId},'INVALID_INVITATION_SCOPE'],
      [{kind:'member',level:'full'},'INVALID_INVITATION_SCOPE'],
      [{kind:'guest',pageId:setup.pageId,expiresAt:'2000-01-01T00:00:00.000Z'},'INVALID_GRANT_EXPIRY'],
    ] as const) await assert.rejects(invite(owner,config(),{operationKey:crypto.randomUUID(),email:'invalid@example.com',...scope}),{code});
    fixture.sql.prepare("UPDATE containers SET guest_access='forbidden' WHERE id=?").run(setup.containerId);
    await assert.rejects(invite(owner,config(),{operationKey:crypto.randomUUID(),email:'veto@example.com',kind:'guest',pageId:setup.pageId}),{code:'GUESTS_FORBIDDEN'});
    assert.deepEqual(invitationCounts(fixture),before);
    fixture.sql.prepare("UPDATE containers SET guest_access='allowed' WHERE id=?").run(setup.containerId);
    await invite(owner,config(),{operationKey:crypto.randomUUID(),email:'revoked@example.com',kind:'guest',pageId:setup.pageId});
    const token=outboxToken(fixture,'revoked@example.com'), invitation=fixture.sql.prepare('SELECT id,page_grant_id FROM invitations').get()!;
    await revokeInvitation(owner,{operationKey:crypto.randomUUID(),id:invitation.id as string});
    assert.ok(fixture.sql.prepare('SELECT revoked_at FROM page_grants WHERE id=?').get(invitation.page_grant_id)!.revoked_at);
    await assert.rejects(acceptInvitation(fixture.db,config(),token,owner),{code:'LINK_INVALID'});
    assert.equal(fixture.sql.prepare('SELECT count(*) n FROM members').get()!.n,1);
  },true);
});

test('native invitation readiness still refuses hosted providers without credentials before admission', async () => {
  await withLocalOwner(async (fixture,owner) => {
    const before = invitationCounts(fixture);
    for (const provider of ['resend','sendgrid'] as const) {
      assert.throws(()=>readRuntimeConfig({...settings,LOCAL_DEVELOPMENT:'false',APP_URL:'https://slate.example.com',MAIL_PROVIDER:provider},false),/MAIL_API_KEY/);
      for(const kind of ['member','guest'] as const) await assert.rejects(invite(owner,{...config(),localDevelopment:false,appUrl:'https://slate.example.com',mailProvider:provider},{operationKey:crypto.randomUUID(),email:'hosted@example.com',kind}),{status:503,code:'MAIL_UNAVAILABLE'});
    }
    assert.deepEqual(invitationCounts(fixture),before);
  });
});
