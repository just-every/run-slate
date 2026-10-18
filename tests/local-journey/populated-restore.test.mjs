import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { scratch, waitFor, resources, repo } from './runtime.mjs';
import { saveFailure } from './diagnostics.mjs';
import { http, populate, snapshotQueries } from './populated.mjs';
import { corrupt, resealWithRow } from './archive-edit.mjs';
import { archiveFacts, equalArchiveFacts } from './archive-facts.mjs';
import {startEmittedWorker, stop as stopWorker} from '../e2e/runtime-harness.mjs';

const cli = (verb, flags = []) => ['node_modules/@runeditrun/rer/bin/rer.mjs', verb, ...flags, '--json', '--non-interactive'];
const last = output => JSON.parse(output.trim().split('\n').filter(line => line.startsWith('{')).at(-1));

/**
 * PORT-002 and PORT-005 through the real commands: a populated installation is
 * exported, reset, and imported into an empty installation set up for a
 * different archived member, then checked record by record.
 */
test('a populated installation comes back on fresh authority under a different owner', { timeout: 40 * 60_000 }, async () => {
  const copy = await scratch(); let dev;
  const credentialId = 'synthetic-journey-credential';
  const run = (verb, flags) => copy.run('node', cli(verb, flags));
  const refused = async (verb, flags) => { const child = copy.start('node', cli(verb, flags)); const code = await child.done; await copy.stop(child); return { code, result: last(child.output), error: child.output.split('\n').filter(line => line.includes('"event":"error"')).map(line => JSON.parse(line)).at(-1) }; };
  const sql = async command => JSON.parse(await copy.run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.jsonc', '--command', command, '--json']))[0].results;
  // One wrangler process at a time owns the local SQLite file.
  const snapshot = async () => { const result = {}; for (const [name, query] of Object.entries(snapshotQueries)) result[name] = await sql(query); return result; };
  const counts = async () => (await sql('SELECT (SELECT COUNT(*) FROM workspaces) AS workspaces,(SELECT COUNT(*) FROM members) AS members,(SELECT COUNT(*) FROM pages) AS pages,(SELECT COUNT(*) FROM files) AS files'))[0];
  const start = async (env = {}) => {
    await resources();
    const vars = parseEnv(await readFile(join(copy.root, '.dev.vars'), 'utf8'));
    const runtime = await startEmittedWorker(join(copy.root, '.wrangler/state'), {...vars, ...env}, Number(new URL(vars.APP_URL).port));
    dev = runtime.child;
  };
  const stopDev = async () => { await stopWorker(dev); dev = undefined; };
  const local = async () => { const vars = parseEnv(await readFile(join(copy.root, '.dev.vars'), 'utf8')); return { vars, api: http(vars.APP_URL, parseEnv(await readFile(join(copy.root, '.rer/local/dev-key.env'), 'utf8')).RER_DEV_KEY) }; };
  const evidence = join(repo, '.artifacts/local-journey'); await mkdir(evidence, { recursive: true });
  try {
    await copy.run('rer', ['install']);
    await run('setup', ['--owner-email', 'alice@example.test']);
    await start();
    let { vars, api } = await local();
    const alice = await api.signIn('alice@example.test');
    const made = await populate(api, alice.cookie);
    assert.ok(made.pages.length >= 300, 'a few hundred pages in nested trees');
    // What Bob's live session can open before export: exactly this must come back.
    const bobOpens = async cookie => Object.fromEntries(await Promise.all(made.restricted.map(async id => [id, (await api.call(cookie, 'GET', `/api/pages/${id}`)).status])));
    const bobBefore = await bobOpens(made.bob.cookie);
    assert.ok(Object.values(bobBefore).includes(200) && Object.values(bobBefore).some(status => status !== 200), 'Bob opens some restricted pages and not others');
    const publicPath = `/p/${made.slug}`;
    assert.equal((await api.call(null, 'GET', publicPath)).status, 200, 'the published page is public before export');
    // Dave held a grant on a restricted page and was removed; removal took his access with him.
    const aliceId = (await api.ok(alice.cookie, 'GET', '/api/session')).member.id;
    const dave = await api.invite(alice.cookie, { email: 'dave@example.test' });
    await api.ok(alice.cookie, 'POST', '/api/sharing', { operationKey: crypto.randomUUID(), targetKind: 'page', targetId: made.restricted[0], principalKind: 'member', principalId: dave.member.id, level: 'view' });
    await api.ok(alice.cookie, 'POST', '/api/members/remove', { operationKey: crypto.randomUUID(), memberId: dave.member.id });
    await stopDev();
    // An agent credential, which export always erases.
    await sql(`INSERT INTO intelligence_agent_credentials(id,workspace_id,owner_id,subject_id,token_hash,scope_json,expires_at,revoked_at,created_at,dev_minted) SELECT '${credentialId}',workspace_id,id,id,'digest-'||hex(randomblob(16)),'{}','2099-01-01T00:00:00.000Z',NULL,'2026-10-01T00:00:00.000Z',0 FROM members WHERE id='${aliceId}'`);
    const before = await snapshot();
    assert.ok(before.sessions[0].n >= 3, 'live sessions for the owner and two members');
    await mkdir(join(copy.root, 'exports'), { recursive: true });
    const exported = last(await run('export', ['--output', 'exports/populated.rer']));
    const archive = join(copy.root, 'exports/populated.rer');
    const text = await readFile(archive, 'utf8');
    for (const secret of [vars.SESSION_SECRET, made.bob.cookie.split('=')[1], made.carol.cookie.split('=')[1], new URL(made.pending.link).searchParams.get('token'), new URL(alice.link).searchParams.get('token')]) assert.ok(!text.includes(secret), 'the archive holds no secret, session or sign-in link');

    // Failure path: damaged and doctored archives leave an empty installation empty.
    await run('reset', ['--yes']);
    await corrupt(archive, join(copy.root, 'exports/corrupted.rer'));
    await resealWithRow(archive, join(copy.root, 'exports/bad-member.rer'), 'members', row => row.email === 'bob@example.test' ? { ...row, role: 'admin' } : null);
    await resealWithRow(archive, join(copy.root, 'exports/two-owners.rer'), 'members', row => row.email === 'bob@example.test' ? { ...row, role: 'owner', status: 'active' } : null);
    // A historical member marked as a second setup owner could never be removed once invited back.
    await resealWithRow(archive, join(copy.root, 'exports/second-setup.rer'), 'members', row => row.email === 'bob@example.test' ? { ...row, is_setup_owner: 1 } : null);
    const refusals = {};
    for (const name of ['corrupted', 'bad-member', 'two-owners', 'second-setup']) {
      const attempt = await refused('import', ['--input', `exports/${name}.rer`, '--yes']);
      assert.notEqual(attempt.code, 0, `${name} archive is refused`);
      assert.match(attempt.error.message, /^Restore refused.*Nothing was restored/, `${name}: a plain refusal`);
      assert.deepEqual(await counts(), { workspaces: 0, members: 0, pages: 0, files: 0 }, `${name}: the installation stays empty`);
      refusals[name] = { exitCode: attempt.code, message: attempt.error.message };
    }

    // A guest's address cannot own the restore: a guest was trusted only with what was shared to them.
    await run('setup', ['--owner-email', 'guest@example.test']);
    const asGuest = await refused('import', ['--input', 'exports/populated.rer', '--yes']);
    assert.notEqual(asGuest.code, 0, 'a guest as the new owner is refused');
    assert.match(asGuest.error.message, /^Restore refused: guest@example\.test is a guest.*Nothing was restored/);
    assert.equal((await counts()).pages, 0, 'nothing was restored for a guest owner');
    refusals.guestOwner = { exitCode: asGuest.code, message: asGuest.error.message };
    await run('reset', ['--yes']);

    // PORT-005 for any archive: one changed after export to carry a live public link, a live
    // agent credential, and a grant for a removed member restores none of them.
    const token = `slate_${crypto.randomUUID().replaceAll('-', '')}`;
    await resealWithRow(archive, join(copy.root, 'exports/doctored-1.rer'), 'public_exposures', row => ({ ...row, revoked_at: null }));
    await resealWithRow(join(copy.root, 'exports/doctored-1.rer'), join(copy.root, 'exports/doctored-2.rer'), 'intelligence_agent_credentials', row => ({ ...row, token_hash: createHash('sha256').update(JSON.stringify(token)).digest('hex'), scope_json: JSON.stringify({ tools: ['read_evidence'], sourceIds: [made.restricted[1]], audience: [aliceId], grantIds: [] }), expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null }));
    await resealWithRow(join(copy.root, 'exports/doctored-2.rer'), join(copy.root, 'exports/doctored.rer'), 'page_grants', row => row.page_id === made.restricted[1] && row.principal_id === aliceId ? { ...row, principal_id: dave.member.id, level: 'full' } : null);
    await run('setup', ['--owner-email', 'alice@example.test']);
    const doctored = last(await run('import', ['--input', 'exports/doctored.rer', '--yes']));
    assert.ok((await sql('SELECT revoked_at FROM public_exposures')).every(row => row.revoked_at), 'the doctored public link is revoked on import');
    assert.deepEqual(await sql("SELECT token_hash,scope_json,revoked_at IS NOT NULL AS revoked FROM intelligence_agent_credentials"), [{ token_hash: 'erased:' + credentialId, scope_json: '{}', revoked: 1 }], 'the doctored credential is erased as export erases it');
    assert.deepEqual(await sql(`SELECT status FROM members WHERE id='${dave.member.id}'`), [{ status: 'removed' }], 'a removed member stays removed');
    assert.deepEqual(await sql(`SELECT id FROM page_grants WHERE principal_id='${dave.member.id}'`), [], "the removed member's doctored grant is left out");
    assert.equal(doctored.warnings?.length, 1, 'and the import says so');
    // Agent credentials work only in the flagship profile, so prove the credential there.
    await start({ SLATE_PROFILE: 'flagship' });
    ({ vars, api } = await local());
    assert.equal((await api.call(null, 'GET', publicPath)).status, 404, 'a doctored archive does not publish anything');
    assert.equal((await api.call(null, 'GET', '/api/agent/tools', undefined, { authorization: `Bearer ${token}` })).status, 401, 'the doctored credential authenticates nothing');
    // Re-inviting the removed member opens nothing the doctored archive gave him.
    const restoredAlice = await api.signIn('alice@example.test');
    const daveBack = await api.invite(restoredAlice.cookie, { email: 'dave@example.test' });
    assert.equal(daveBack.member.id, dave.member.id, 'Dave returns as the same member');
    for (const id of made.restricted.slice(0, 2)) assert.equal((await api.call(daveBack.cookie, 'GET', `/api/pages/${id}`)).status, 404, 'and opens neither page he lost nor the doctored one');
    await stopDev();
    await run('reset', ['--yes']);

    // Restore into an installation set up for Carol, an archived member.
    await run('setup', ['--owner-email', 'carol@example.test']);
    const imported = last(await run('import', ['--input', 'exports/populated.rer', '--yes']));
    assert.equal(imported.contentHash, exported.contentHash);
    const after = await snapshot();
    for (const name of ['pages', 'revisions', 'blocks', 'threads', 'comments', 'pageGrants', 'containerGrants', 'groups', 'files'])
      assert.deepEqual(after[name], before[name], `${name}: every identifier, order and relationship is unchanged`);
    assert.deepEqual(after.exposures.map(({ revoked_at, ...rest }) => rest), before.exposures.map(({ revoked_at, ...rest }) => rest), 'the public-link slug is unchanged');
    assert.ok(after.exposures.every(row => row.revoked_at), 'and not public until the owner publishes again');
    assert.deepEqual(after.members.filter(member => member.status === 'active').map(member => [member.email, member.role, member.is_setup_owner]), [['carol@example.test', 'owner', 1]], 'only the named owner is active');
    assert.deepEqual(after.members.map(member => member.id), before.members.map(member => member.id), 'every member keeps its identifier as a historical actor');
    assert.equal(after.sessions[0].n, 0); assert.deepEqual(after.invitations, [], 'no session or invitation crosses');

    await start();
    ({ vars, api } = await local());
    assert.equal(vars.SETUP_OWNER_EMAIL, 'carol@example.test');
    assert.equal((await api.call(made.bob.cookie, 'GET', '/api/session')).status, 401, "Bob's old session does nothing");
    const pending = new URL(made.pending.link), oldSignIn = new URL(alice.link);
    assert.notEqual((await api.call(null, 'POST', pending.pathname, new URLSearchParams({ token: pending.searchParams.get('token') }))).status, 303, 'the pending invitation does nothing');
    assert.notEqual((await api.call(null, 'POST', oldSignIn.pathname, new URLSearchParams({ token: oldSignIn.searchParams.get('token') }))).status, 303, 'an old sign-in link does nothing');
    const outbox = await api.outbox();
    assert.equal((await api.call(null, 'POST', '/api/auth/magic', { email: 'alice@example.test', requestKey: crypto.randomUUID() })).status, 200);
    assert.deepEqual(await api.outbox(), outbox, 'the former owner, now historical, gets no sign-in mail');
    assert.equal((await api.call(null, 'GET', publicPath)).status, 404, 'the published page is not public after restore');
    const carol = await api.signIn('carol@example.test');
    // WORK-008: the owner role administers spaces it is not in but reads through grants,
    // so the new owner grants herself each space (CONT-009). Restricted pages stay with
    // their own grants: the former owner's alone open only when she is invited back.
    for (const space of (await api.ok(carol.cookie, 'GET', '/api/containers')).items.filter(item => made.spaces.includes(item.id)))
      await api.ok(carol.cookie, 'POST', '/api/sharing', { operationKey: crypto.randomUUID(), targetKind: 'container', targetId: space.id, principalKind: 'member', principalId: (await api.ok(carol.cookie, 'GET', '/api/session')).member.id, level: 'full' });
    // Search finds restored content at once; links and mentions resolve to the same records.
    const sample = made.pages[made.pages.length - 2];
    assert.ok(JSON.stringify(await api.ok(carol.cookie, 'GET', `/api/search?q=${encodeURIComponent(sample.title)}`)).includes(sample.id), 'search finds restored content right away');
    for (const { from, to } of made.links) {
      const page = await api.ok(carol.cookie, 'GET', `/api/pages/${from}`);
      const content = JSON.stringify(page.blocks[0].content);
      assert.ok(content.includes(`"id":"${to}"`) && content.includes(`/app/pages/${to}`), 'mention and link keep their target');
      assert.equal((await api.ok(carol.cookie, 'GET', `/api/pages/${to}`)).page.id, to);
    }
    for (const file of made.files) assert.equal((await api.call(carol.cookie, 'GET', `/api/media/${file.id}`)).status, 200, 'files come back under their identifiers');
    // Publishing again is the owner's act.
    const published = await api.ok(carol.cookie, 'GET', `/api/pages/${made.published}`);
    await api.ok(carol.cookie, 'POST', `/api/publishing/${made.published}`, { operationKey: crypto.randomUUID(), expectedRevisionId: published.page.revisionId, host: new URL(vars.APP_URL).host, slug: made.slug, indexable: false, theme: 'default', headerControls: [], duplicateAsTemplate: false, socialPreview: {}, revoke: false });
    assert.equal((await api.call(null, 'GET', publicPath)).status, 200, 'public again once the new owner publishes it');
    // A member re-invited by the new owner regains exactly the old grants.
    const bob = await api.invite(carol.cookie, { email: 'bob@example.test' });
    assert.equal(bob.member.id, made.bob.member.id, 'Bob returns as the same member');
    assert.deepEqual(await bobOpens(bob.cookie), bobBefore, 'and opens exactly what he could before, no more');
    await stopDev();

    // The archive's own owner, imported without setup, re-exports the same content.
    await run('reset', ['--yes']);
    await run('import', ['--input', 'exports/populated.rer', '--yes']);
    const again = last(await run('export', ['--output', 'exports/again.rer']));
    assert.equal(again.contentHash, exported.contentHash, 're-export has the same content hash');
    const originalFacts = await archiveFacts(archive);
    equalArchiveFacts(originalFacts, await archiveFacts(join(copy.root, 'exports/again.rer')));

    // An additive migration exists only in this disposable installation. A
    // same-schema replay alone cannot satisfy this actual changed-schema case.
    await run('reset', ['--yes']);
    const migrations = join(copy.root, 'migrations/core');
    const nextMigration = Math.max(...(await readdir(migrations)).filter(name => /^\d+_.*\.sql$/.test(name)).map(name => Number(name.split('_')[0]))) + 1;
    const additive = join(migrations, `${String(nextMigration).padStart(4, '0')}_journey_archive_default.sql`);
    await writeFile(additive, "ALTER TABLE pages ADD COLUMN journey_restore_label TEXT NOT NULL DEFAULT 'preserved';\n");
    await run('import', ['--input', 'exports/populated.rer', '--yes']);
    await run('export', ['--output', 'exports/after-additive.rer']);
    const upgraded = await archiveFacts(join(copy.root, 'exports/after-additive.rer'));
    assert.notEqual(upgraded.manifest.schema, originalFacts.manifest.schema, 'the portable schema actually changed');
    equalArchiveFacts(originalFacts, upgraded, { pages: { journey_restore_label: 'preserved' } });
    assert.deepEqual(await sql('SELECT DISTINCT journey_restore_label FROM pages'), [{ journey_restore_label: 'preserved' }], 'stored rows take the new column default');

    const summary = { pages: made.pages.length, restricted: made.restricted.length, files: made.files.length, threads: made.threads.length, links: made.links.length, sessionsBeforeExport: before.sessions[0].n, contentHash: exported.contentHash, additiveSchema: upgraded.manifest.schema, refusals, bobOpensBeforeAndAfter: bobBefore };
    await writeFile(join(evidence, 'populated-restore.json'), JSON.stringify(summary, null, 2));
    console.log('Populated restore: ' + JSON.stringify(summary));
  } catch (error) { try { await saveFailure(copy, dev, 'populated-restore', error); } finally { throw error; } }
  finally { try { await stopWorker(dev); } finally { await copy.close(); } }
});
