import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseJsonc } from '@runeditrun/rer/jsonc';
import { appliedMigrations } from '@runeditrun/rer/internal/modules/portability/bridge.mjs';
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history';

// Replay only migrations recorded by the target, in its ledger's order, using
// the exact SQL files and the same effective policy as the restore handler.
export async function installationMigrations(root, { db, policy }, split) {
  const config = parseJsonc(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  const directory = join(root, config.d1_databases.find(entry => entry.binding === 'DB').migrations_dir ?? 'migrations');
  const names = await appliedMigrations(db) ?? [];
  const plan = await Promise.all(names.map(async name => ({ name, statements: split(await readFile(join(directory, name), 'utf8')) })));
  return migrationReplay(plan, policy);
}
