// PORT-005 for `rer import`: exactly one restored member is active, and it is
// the owner this installation names. When `rer setup` ran first, that is its
// SETUP_OWNER_EMAIL, so an archive can come back under a different archived
// member; otherwise it is the archive's own setup owner. Every other member
// stays an inactive historical actor until invited again.
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { readArchive } from '@runeditrun/rer/modules/portability';
import { guard } from '@runeditrun/rer/modules/portability/storage';
import { readSettings } from '@runeditrun/rer/adapter-settings';
import { settingsFor } from './settings.mjs';

/** A refusal the person can act on; nothing has been restored or removed. */
export class RestoreRefusal extends Error {}

const allowed = { role: ['owner', 'member'], member_kind: ['member', 'guest'], status: ['active', 'historical', 'removed'], is_setup_owner: [0, 1] };
const email = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
// Native member erasure retains this value-free actor for historical references.
// It is not a sign-in address and is valid only with the complete erased state.
const erased = row => typeof row.id === 'string' && row.id.length > 0 && row.email === `erased-${row.id}@invalid`
  && row.status === 'removed' && row.is_setup_owner === 0 && row.display_name === 'Deleted person' && row.initials === '?';

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
    const bad = !email(row.email) && !erased(row) ? 'email' : Object.keys(allowed).find(field => !allowed[field].includes(row[field]));
    if (bad) throw new RestoreRefusal(`Restore refused: member record ${index + 1} in the archive has an invalid ${bad.replaceAll('_', ' ')}. Nothing was restored.`);
  }
  // An export activates only its setup owner; an archive that activates anyone else was changed.
  const active = members.filter(row => row.status === 'active');
  if (active.length !== 1 || active[0].is_setup_owner !== 1 || active[0].role !== 'owner' || active[0].member_kind !== 'member')
    throw new RestoreRefusal(`Restore refused: the archive's member records name ${active.length} active members; an export names exactly one, its setup owner. Nothing was restored.`);
  const setupOwners = members.filter(row => row.is_setup_owner === 1).length;
  if (setupOwners !== 1)
    throw new RestoreRefusal(`Restore refused: the archive's member records name ${setupOwners} setup owners; an export names exactly one. Nothing was restored.`);
  const address = configured || active[0].email;
  const owner = members.filter(row => same(row.email, address));
  if (owner.length > 1)
    throw new RestoreRefusal('Restore refused: the archive has multiple member records for the restored owner. Nothing was restored.');
  if (owner.length !== 1)
    throw new RestoreRefusal(`Restore refused: the archive has no member ${configured}, the owner this installation was set up for. Run setup with the address of an archived member, or reset and import before setup to keep the archive's owner. Nothing was restored.`);
  // A guest was only ever trusted with the pages shared to them; the restored owner administers everything.
  if (owner[0].member_kind !== 'member')
    throw new RestoreRefusal(`Restore refused: ${owner[0].email} is a guest in the archive, and only a full member can own the restored workspace. Run setup with the address of an archived member who is not a guest. Nothing was restored.`);
  if (owner[0].status === 'removed' || !email(owner[0].email))
    throw new RestoreRefusal('Restore refused: the configured owner was removed from the archived workspace. Run setup with the address of a full member who was not removed. Nothing was restored.');
  return { email: owner[0].email, archived: active[0].email };
}

/** Makes the named archived member the one active owner; the archived owner becomes historical and removed members stay removed. */
export async function activateOwner(db, owner) {
  if (!email(owner)) throw new RestoreRefusal('Restore refused: the restored owner must have a valid sign-in address. Nothing was restored.');
  const [, , count] = await db.batch([
    guard(db, "(SELECT COUNT(*) FROM members WHERE lower(email)=lower(?))=1 AND EXISTS(SELECT 1 FROM members WHERE lower(email)=lower(?) AND status IN ('active','historical') AND member_kind='member')", owner, owner),
    db.prepare(`UPDATE members SET status=CASE WHEN lower(email)=lower(?1) THEN 'active' WHEN status='removed' THEN 'removed' ELSE 'historical' END,
      is_setup_owner=CASE WHEN lower(email)=lower(?1) THEN 1 ELSE 0 END,
      role=CASE WHEN lower(email)=lower(?1) THEN 'owner' ELSE role END,
      updated_at=CASE WHEN lower(email)=lower(?1) OR status='active' THEN ?2 ELSE updated_at END`).bind(owner, new Date().toISOString()),
    db.prepare("SELECT COUNT(*) AS active FROM members WHERE status='active'"),
    db.prepare('DELETE FROM rer_portability_guard'),
  ]);
  if (count.results[0].active !== 1) throw Error('owner_activation');
}
