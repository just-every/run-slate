import { canonicalJson, createPortability, sha256 } from '@runeditrun/rer/modules/portability';
import {mutationGuard} from '../../app/operations';

/** Plan Base's value-free fence without initializing state before the native batch. */
export async function installationRedactionStatements(db: D1Database) {
  // Maintenance only: exclude every product table and expose no transfer service.
  const service = await createPortability({db, policy:{product:'just-every/slate',excludeTables:['%']}});
  const state:RedactionCheckpoint = await redactionCheckpoint(db) ?? {sourceIdentity:crypto.randomUUID(),epoch:0};
  const hash = await sha256(canonicalJson([state.sourceIdentity,'rer_portability_state',{id:1}]));
  // Initialization, source/epoch admission and erasure must share one transaction,
  // including the first erasure on an installation with no checkpoint row yet.
  const statements = [
    db.prepare('INSERT OR IGNORE INTO rer_portability_state(id,source_identity,epoch) VALUES(1,?,?)').bind(state.sourceIdentity,state.epoch),
    mutationGuard(db,'SELECT source_identity=? AND epoch=? FROM rer_portability_state WHERE id=1',[state.sourceIdentity,state.epoch]),
    db.prepare('INSERT OR IGNORE INTO rer_portability_journal(source,tombstone) VALUES(?,?)').bind(state.sourceIdentity,hash),
    db.prepare('UPDATE rer_portability_state SET epoch=epoch+1 WHERE id=1'),
    db.prepare('INSERT INTO rer_portability_epochs SELECT source_identity,epoch FROM rer_portability_state WHERE id=1 ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch)'),
    ...await service.invalidateTransfersStatements(),
  ];
  return {state,statements};
}

export interface RedactionCheckpoint {sourceIdentity:string; epoch:number}

/** No authority or private values enter the native ZIP's redaction checkpoint. */
export async function redactionCheckpoint(db: D1Database): Promise<RedactionCheckpoint | undefined> {
  if (!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rer_portability_state'").first()) return;
  const state = await db.prepare('SELECT source_identity,epoch FROM rer_portability_state WHERE id=1').first<{source_identity:string;epoch:number}>();
  return state ? {sourceIdentity:state.source_identity, epoch:state.epoch} : undefined;
}

/** Check during admission and repeat as a transaction guard at restore commit. */
export async function nativeRestoreCheckpoint(db:D1Database, checkpoint?:RedactionCheckpoint) {
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rer_portability_epochs'").first();
  if (!exists) return {select:'SELECT 1',values:[] as (string|number)[]};
  if (!checkpoint) return {select:'SELECT NOT EXISTS(SELECT 1 FROM rer_portability_epochs WHERE epoch>0) AND NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE epoch>0)',values:[] as (string|number)[]};
  return {select:'SELECT MAX(COALESCE((SELECT epoch FROM rer_portability_epochs WHERE source=?),0),COALESCE((SELECT epoch FROM rer_portability_state WHERE id=1 AND source_identity=?),0))<=?',values:[checkpoint.sourceIdentity,checkpoint.sourceIdentity,checkpoint.epoch]};
}

/** Carry the archived source's epoch into both formats without restoring authority. */
export async function restoreCheckpointStatements(db:D1Database, files:R2Bucket, checkpoint?:RedactionCheckpoint) {
  if (!checkpoint) return [];
  await createPortability({db,policy:{product:'just-every/slate',excludeTables:['%']}});
  const statements = [
    db.prepare('INSERT OR IGNORE INTO rer_portability_state(id,source_identity,epoch) VALUES(1,?,?)').bind(checkpoint.sourceIdentity,checkpoint.epoch),
    db.prepare('INSERT INTO rer_portability_epochs(source,epoch) VALUES(?,?) ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch)').bind(checkpoint.sourceIdentity,checkpoint.epoch),
    db.prepare('UPDATE rer_portability_state SET source_identity=?,epoch=? WHERE id=1').bind(checkpoint.sourceIdentity,checkpoint.epoch),
  ];
  if (checkpoint.epoch>0) {
    const hash = await sha256(canonicalJson([checkpoint.sourceIdentity,'rer_portability_state',{id:1}]));
    statements.push(db.prepare('INSERT OR IGNORE INTO rer_portability_journal(source,tombstone) VALUES(?,?)').bind(checkpoint.sourceIdentity,hash));
  }
  return statements;
}
