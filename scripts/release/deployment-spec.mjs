import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// This intentionally accepts only the simple JSON-valued TOML used by Slate's
// checked-in template. New syntax must be reviewed, never silently discarded.
export function readTemplate(text) {
  const sections = {'': [{}]}; let current = sections[''][0];
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const section = /^(\[\[?)([a-z0-9_.]+)\]\]?$/.exec(line);
    if (section) {
      const [, brackets, name] = section;
      if (brackets === '[' && sections[name]) throw Error(`Duplicate template section: ${name}`);
      current = {}; (sections[name] ??= []).push(current); continue;
    }
    const entry = /^([a-zA-Z_]+)\s*=\s*(.+)$/.exec(line);
    if (!entry || Object.hasOwn(current, entry[1])) throw Error('Unsupported or duplicate template directive');
    current[entry[1]] = JSON.parse(entry[2]);
  }
  const supported = ['', 'vars', 'd1_databases', 'r2_buckets', 'queues.producers', 'queues.consumers', 'durable_objects.bindings', 'migrations', 'triggers'];
  if (Object.keys(sections).some(name => !supported.includes(name))) throw Error('Unsupported deployment binding; extend the artifact contract first');
  const keys = {
    '': ['name', 'main', 'compatibility_date', 'compatibility_flags'],
    d1_databases: ['binding', 'database_name', 'database_id', 'migrations_dir'],
    r2_buckets: ['binding', 'bucket_name'], 'queues.producers': ['binding', 'queue'],
    'queues.consumers': ['queue', 'max_batch_size', 'max_batch_timeout', 'max_retries'],
    'durable_objects.bindings': ['name', 'class_name'], migrations: ['tag', 'new_sqlite_classes'], triggers: ['crons'],
  };
  for (const [name, rows] of Object.entries(sections)) if (name !== 'vars') for (const row of rows) if (Object.keys(row).some(key => !keys[name].includes(key))) throw Error(`Unsupported template directive in ${name}`);
  return sections;
}

export async function deploymentSpec(root) {
  const template = readTemplate(await readFile(resolve(root, 'deploy/wrangler.template.toml'), 'utf8'));
  const main = template[''][0];
  if (main.main !== './src/server.ts') throw Error('Native Worker entry changed; review artifact mapping');
  const resources = [
    ...(template.d1_databases ?? []).map(row => ({kind: 'd1', binding: row.binding})),
    ...(template.r2_buckets ?? []).map(row => ({kind: 'r2', binding: row.binding})),
    ...(template['queues.producers'] ?? []).map(row => ({kind: 'queue', binding: row.binding})),
  ];
  const migrations = [];
  for (const database of template.d1_databases ?? []) {
    if (database.migrations_dir !== './migrations/core') throw Error('Review changed migration root');
    for (const name of (await readdir(resolve(root, database.migrations_dir))).filter(name => name.endsWith('.sql')).sort()) {
      const bytes = await readFile(resolve(root, database.migrations_dir, name));
      const sql = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      if (!Buffer.from(sql).equals(bytes)) throw Error(`Migration cannot round-trip exactly: ${name}`);
      migrations.push({binding: database.binding, name, sha256: sha256(bytes), sql});
    }
  }
  const publicVariables = Object.fromEntries(Object.entries(template.vars[0]).map(([name, value]) => [name, /__[A-Z_]+__/.test(value) ? '' : value]));
  Object.assign(publicVariables, {SLATE_PROFILE: 'core-wiki', AI_ENABLED: 'false', SSO_ENABLED: 'false', LINK_PREVIEWS_ENABLED: 'true'});
  return {
    schema: 1, resources, migrations,
    compatibilityDate: main.compatibility_date, compatibilityFlags: main.compatibility_flags,
    durableObjects: (template['durable_objects.bindings'] ?? []).map(row => ({binding: row.name, className: row.class_name})),
    durableObjectMigrations: (template.migrations ?? []).map(row => {
      if (Object.keys(row).some(key => !['tag', 'new_sqlite_classes'].includes(key))) throw Error('Review new Durable Object migration operation');
      return {tag: row.tag, newSqliteClasses: row.new_sqlite_classes};
    }),
    publicVariables, secretNames: ['SESSION_SECRET', 'MAIL_API_KEY'], optionalSecretNames: [],
    schedules: template.triggers?.[0]?.crons ?? [],
    queueConsumers: (template['queues.consumers'] ?? []).map(row => {
      const producer = template['queues.producers'].find(item => item.queue === row.queue);
      if (!producer || Object.keys(row).some(key => !['queue', 'max_batch_size', 'max_batch_timeout', 'max_retries'].includes(key))) throw Error('Review queue consumer contract');
      return {binding: producer.binding, maxBatchSize: row.max_batch_size, maxBatchTimeout: row.max_batch_timeout, maxRetries: row.max_retries};
    }),
    healthPath: '/health',
    recovery: 'Retain the prior accepted Worker artifact and its configuration. Preserve every applied D1 migration and R2 object. Never replay setup against retained data. For data recovery use an owner native export and restore into an empty separate deployment, then verify access, attachments and published exposure before changing traffic. See OPERATIONS.md; sealed prior-store upgrade remains unqualified.',
  };
}
