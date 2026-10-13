import { readFile } from 'node:fs/promises';
import { openSqliteImportStorage } from '../../../src/index.ts';
import type {
  ImportContext,
  ImportMapping,
  Json,
  SourceRecord,
  SqlDatabase,
  TargetAdapter,
  TargetRow,
} from '../../../src/index.ts';

export interface WorkspaceManifest {
  name: string;
  provenance: 'synthetic';
  destination: string;
  namespace: string;
  mappingVersion: string;
  source: { name: string; path: string; format: 'json' | 'ndjson' };
}

export interface PriorRow {
  targetKind: string;
  targetId: string;
  revision: string;
  value: Json;
}

export interface WorkspaceMappingSpec {
  version: string;
  kinds: Record<string, { targetKind: string; fields: Record<string, string> }>;
  unsupportedKindReason: string;
  unsupportedFieldReason: string;
}

export async function loadWorkspaceFixture() {
  const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8')) as WorkspaceManifest;
  const [mapping, expected, sourceBytes] = await Promise.all([
    readFile(new URL('./mapping.json', import.meta.url), 'utf8').then(value => JSON.parse(value) as WorkspaceMappingSpec),
    readFile(new URL('./expected.json', import.meta.url), 'utf8').then(value => JSON.parse(value) as Record<string, any>),
    readFile(new URL(manifest.source.path, import.meta.url)),
  ]);
  return { manifest, mapping, expected, sourceBytes };
}

export function parseWorkspaceRecord(value: Json) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('fixture record must be an object');
  const payload = value as Record<string, Json>;
  if (typeof payload.type !== 'string' || typeof payload.id !== 'string') throw new Error('fixture record needs string type and id');
  return { kind: payload.type, sourceId: payload.id, payload };
}

const objectValue = (value: Json): Record<string, Json> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('fixture payload must be an object');
  return value as Record<string, Json>;
};

export function workspaceMapping(spec: WorkspaceMappingSpec, priorState: PriorRow[], calls: { value: number }): ImportMapping {
  return {
    version: spec.version,
    map(record: SourceRecord) {
      calls.value++;
      const payload = objectValue(record.payload);
      const route = spec.kinds[record.kind];
      if (!route) {
        return {
          effects: [],
          unmapped: [
            { field: 'type', reason: spec.unsupportedKindReason },
            ...Object.keys(payload)
              .filter(field => field !== 'type' && field !== 'id')
              .map(field => ({ field, reason: spec.unsupportedFieldReason })),
          ],
        };
      }

      const value: Record<string, Json> = {};
      const sourceFields = Object.values(route.fields);
      for (const [targetField, sourceField] of Object.entries(route.fields)) {
        const fieldValue = payload[sourceField];
        if (fieldValue === undefined) throw new Error(`fixture mapping field missing: ${sourceField}`);
        value[targetField] = fieldValue;
      }
      const unmapped = Object.keys(payload)
        .filter(field => field !== 'type' && field !== 'id' && !sourceFields.includes(field))
        .map(field => ({ field, reason: spec.unsupportedFieldReason }));
      const prior = priorState.find(row => row.targetKind === route.targetKind && row.targetId === record.sourceId);
      return {
        effects: [{
          targetKind: route.targetKind,
          targetId: record.sourceId,
          value,
          ...(prior ? { expectedRevision: prior.revision } : {}),
        }],
        unmapped,
      };
    },
  };
}

function readNativeRow(db: SqlDatabase, destination: string, kind: string, id: string): TargetRow | undefined {
  if (kind === 'card') {
    const row = db.prepare('SELECT title,body,revision FROM fixture_cards WHERE destination=? AND id=?').get(destination, id);
    if (!row) return undefined;
    return { destination, targetKind: kind, targetId: id, value: { title: row.title, body: row.body }, revision: row.revision };
  }
  if (kind === 'card-tag') {
    const row = db.prepare('SELECT card_id,label,revision FROM fixture_card_tags WHERE destination=? AND id=?').get(destination, id);
    if (!row) return undefined;
    return { destination, targetKind: kind, targetId: id, value: { cardId: row.card_id, label: row.label }, revision: row.revision };
  }
  throw new Error('unsupported fixture target kind');
}

export const workspaceTargets: TargetAdapter = {
  read: readNativeRow,
  write(db, row) {
    if (row.targetKind === 'card') {
      const value = objectValue(row.value);
      if (typeof value.title !== 'string' || typeof value.body !== 'string') throw new Error('invalid fixture card value');
      db.prepare(`INSERT INTO fixture_cards(destination,id,title,body,revision) VALUES(?,?,?,?,?)
        ON CONFLICT(destination,id) DO UPDATE SET title=excluded.title,body=excluded.body,revision=excluded.revision`)
        .run(row.destination, row.targetId, value.title, value.body, row.revision);
      return;
    }
    if (row.targetKind === 'card-tag') {
      const value = objectValue(row.value);
      if (typeof value.cardId !== 'string' || typeof value.label !== 'string') throw new Error('invalid fixture relation value');
      db.prepare(`INSERT INTO fixture_card_tags(destination,id,card_id,label,revision) VALUES(?,?,?,?,?)
        ON CONFLICT(destination,id) DO UPDATE SET card_id=excluded.card_id,label=excluded.label,revision=excluded.revision`)
        .run(row.destination, row.targetId, value.cardId, value.label, row.revision);
      return;
    }
    throw new Error('unsupported fixture target kind');
  },
  remove(db, destination, kind, id) {
    if (kind === 'card-tag') db.prepare('DELETE FROM fixture_card_tags WHERE destination=? AND id=?').run(destination, id);
    else if (kind === 'card') db.prepare('DELETE FROM fixture_cards WHERE destination=? AND id=?').run(destination, id);
    else throw new Error('unsupported fixture target kind');
  },
  list(db, destination) {
    const cards = db.prepare('SELECT id FROM fixture_cards WHERE destination=? ORDER BY id').all(destination)
      .map((row: { id: string }) => readNativeRow(db, destination, 'card', row.id)!);
    const links = db.prepare('SELECT id FROM fixture_card_tags WHERE destination=? ORDER BY id').all(destination)
      .map((row: { id: string }) => readNativeRow(db, destination, 'card-tag', row.id)!);
    return [...cards, ...links];
  },
};

export function openWorkspaceContext(path: string, manifest: WorkspaceManifest): ImportContext {
  const storage = openSqliteImportStorage(path, { targets: workspaceTargets });
  storage.database.exec(`
    CREATE TABLE IF NOT EXISTS fixture_cards (
      destination TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      revision TEXT NOT NULL,
      PRIMARY KEY(destination,id)
    );
    CREATE TABLE IF NOT EXISTS fixture_card_tags (
      destination TEXT NOT NULL,
      id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      label TEXT NOT NULL,
      revision TEXT NOT NULL,
      PRIMARY KEY(destination,id),
      FOREIGN KEY(destination,card_id) REFERENCES fixture_cards(destination,id)
    );
    CREATE TABLE IF NOT EXISTS fixture_authority (
      principal_id TEXT PRIMARY KEY,
      allowed INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO fixture_authority(principal_id,allowed) VALUES('fixture-owner',1);
  `);
  return {
    storage,
    destination: manifest.destination,
    namespace: manifest.namespace,
    mappingVersion: manifest.mappingVersion,
    batchSize: 1,
    authorization: {
      principalId: 'fixture-owner',
      assertAuthorized(_action, _destination, db) {
        if (db.prepare('SELECT allowed FROM fixture_authority WHERE principal_id=?').get('fixture-owner')?.allowed !== 1) {
          throw new Error('FIXTURE_NOT_AUTHORIZED');
        }
      },
    },
  };
}

export function seedPriorState(context: ImportContext, rows: PriorRow[]): void {
  context.storage.transaction(() => {
    for (const row of rows) context.storage.targets.write(context.storage.database, { ...row, destination: context.destination });
  });
}
