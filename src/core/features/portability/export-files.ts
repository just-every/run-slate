import { PortabilityError } from '@runeditrun/rer/modules/portability';
import { retainedImportObjectKeys } from '../imports/storage-inventory';

/** Expose retained originals; transient exports and abandoned staging never move. */
export async function retainedFiles(db: D1Database, binding: R2Bucket): Promise<R2Bucket> {
  const tables = Object.fromEntries(await Promise.all(['federation_imports', 'import_objects'].map(async name =>
    [name, (await db.prepare(`SELECT * FROM "${name}"`).all()).results])));
  const keys = retainedImportObjectKeys(tables);
  for (const row of tables.federation_imports ?? []) if (row.state !== 'deleted') keys.add(String(row.archive_key));
  for (const row of (await db.prepare('SELECT storage_key FROM files WHERE deleted_at IS NULL').all<{storage_key:string}>()).results) keys.add(row.storage_key);
  if ([...keys].some(key => typeof key !== 'string' || !key)) throw new PortabilityError('missing_file_original', 409);
  const seen = new Set<string>();
  return new Proxy(binding, {
    get(target, property) {
      if (property === 'list') return async (options?: R2ListOptions) => {
        const page = await target.list(options);
        const objects = page.objects.filter(object => keys.has(object.key));
        for (const object of objects) seen.add(object.key);
        if (!page.truncated && [...keys].some(key => !seen.has(key))) throw new PortabilityError('missing_file_original', 409);
        return {...page, objects};
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
