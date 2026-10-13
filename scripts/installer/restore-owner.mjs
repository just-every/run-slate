// PORT-005 for `rer import`: exactly one restored member is active, and it is
// the owner this installation names. When `rer setup` ran first, that is its
// SETUP_OWNER_EMAIL, so an archive can come back under a different archived
// member; otherwise it is the archive's own setup owner. Every other member
// stays an inactive historical actor until invited again.
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { readArchive } from '@runeditrun/rer/modules/portability';
import { readSettings } from '@runeditrun/rer/adapter-settings';
import { settingsFor } from './settings.mjs';
import { emptyTargetSelects, bootstrapCustodyTables } from '../../src/core/features/portability/restore-plan.ts';

/** A refusal the person can act on; nothing has been restored or removed. */
export class RestoreRefusal extends Error {}

const allowed = { role: ['owner', 'member'], member_kind: ['member', 'guest'], status: ['active', 'historical', 'removed'], is_setup_owner: [0, 1] };
const email = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** The owner this checkout's settings name, or null when setup has not run. */
export async function configuredOwner(root) {
  const { values, text } = await readSettings(root, settingsFor());
  return text === undefined ? null : values.SETUP_OWNER_EMAIL ?? null;
}

/** Reads the archive's member rows and decides who will be the one active member. */
export async function restoreOwner(path, configured) {
  const members = [];
  for await (const record of readArchive(Readable.toWeb(createReadStream(path))))
    for (const item of record.items ?? []) if (item.kind === 'row' && item.table === 'members') members.push(item.row);
  for (const [index, row] of members.entries()) {
    const bad = !email(row.email) ? 'email' : Object.keys(allowed).find(field => !allowed[field].includes(row[field]));
    if (bad) throw new RestoreRefusal(`Restore refused: member record ${index + 1} in the archive has an invalid ${bad.replaceAll('_', ' ')}. Nothing was restored.`);
  }
  // An export activates only its setup owner; an archive that activates anyone else was changed.
  const active = members.filter(row => row.status === 'active');
  if (active.length !== 1 || active[0].is_setup_owner !== 1 || active[0].role !== 'owner')
    throw new RestoreRefusal(`Restore refused: the archive's member records name ${active.length} active members; an export names exactly one, its setup owner. Nothing was restored.`);
  const setupOwners = members.filter(row => row.is_setup_owner === 1).length;
  if (setupOwners !== 1)
    throw new RestoreRefusal(`Restore refused: the archive's member records name ${setupOwners} setup owners; an export names exactly one. Nothing was restored.`);
  const owner = configured ? members.filter(row => same(row.email, configured)) : active;
  if (owner.length !== 1)
    throw new RestoreRefusal(`Restore refused: the archive has no member ${configured}, the owner this installation was set up for. Run setup with the address of an archived member, or reset and import before setup to keep the archive's owner. Nothing was restored.`);
  // A guest was only ever trusted with the pages shared to them; the restored owner administers everything.
  if (owner[0].member_kind !== 'member')
    throw new RestoreRefusal(`Restore refused: ${owner[0].email} is a guest in the archive, and only a full member can own the restored workspace. Run setup with the address of an archived member who is not a guest. Nothing was restored.`);
  return { email: owner[0].email, archived: active[0].email };
}

/** Setup's own sign-in bootstrap is disposable; any other data blocks the import. */
export async function clearSetupBootstrap(db, owner) {
  const [members, ...empty] = await db.batch([db.prepare('SELECT email FROM members'), ...emptyTargetSelects.map(sql => db.prepare(sql))]);
  if (!members.results.length) return false;
  if (members.results.length !== 1 || !same(members.results[0].email, owner) || empty.some(result => !result.results[0]?.empty))
    throw new RestoreRefusal('Restore refused: this installation already holds workspace data. Import needs an empty installation; export what you need, then run rer reset --yes. Nothing was restored.');
  await db.batch(bootstrapCustodyTables.map(name => db.prepare(`DELETE FROM "${name}"`)));
  return true;
}

/** Makes the named archived member the one active owner; the archived owner becomes historical and removed members stay removed. */
export async function activateOwner(db, owner) {
  const [, count] = await db.batch([
    db.prepare(`UPDATE members SET status=CASE WHEN lower(email)=lower(?1) THEN 'active' WHEN status='removed' THEN 'removed' ELSE 'historical' END,
      is_setup_owner=CASE WHEN lower(email)=lower(?1) THEN 1 ELSE 0 END,
      role=CASE WHEN lower(email)=lower(?1) THEN 'owner' ELSE role END,
      updated_at=CASE WHEN lower(email)=lower(?1) OR status='active' THEN ?2 ELSE updated_at END`).bind(owner, new Date().toISOString()),
    db.prepare("SELECT COUNT(*) AS active FROM members WHERE status='active'"),
  ]);
  if (count.results[0].active !== 1) throw Error('owner_activation');
}
