import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseJsonc } from '@runeditrun/rer/jsonc';
import { appliedMigrations } from '@runeditrun/rer/internal/modules/portability/bridge.mjs';
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history';

// Replay only migrations recorded by the target, in its ledger's order, using
// the exact SQL files and the same effective policy as the restore handler.
// Each entry carries its file's SHA-256 so an archive's own migration ledger is
// checked against these bytes when the target's ledger records no digest.
export async function installationMigrations(root, { db, policy }, split) {
  const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  const directory = join(root, config.d1_databases.find(entry => entry.binding === 'DB').migrations_dir ?? 'migrations');
  const names = await appliedMigrations(db) ?? [];
  const plan = await Promise.all(names.map(async name => {
    const bytes = await readFile(join(directory, name));
    return { name, sha256: createHash('sha256').update(bytes).digest('hex'), statements: split(bytes.toString('utf8')) };
  }));
  return migrationReplay(plan, policy);
}
