// The native archive moves retained attachments and source import originals.
// Derived ZIP exports, deleted files and abandoned staging objects do not move.
import { PortabilityError } from '@runeditrun/rer/modules/portability';
export async function exportFiles(db, binding) {
  const keys = new Set((await db.prepare("SELECT storage_key AS key FROM files WHERE deleted_at IS NULL UNION SELECT archive_key AS key FROM federation_imports WHERE state!='deleted' UNION SELECT o.storage_key AS key FROM import_objects o JOIN federation_imports j ON j.id=o.import_id WHERE j.state!='deleted' AND o.available=1").all()).results.map(row => row.key));
  if ([...keys].some(key => typeof key !== 'string' || !key)) throw new PortabilityError('missing_file_original', 409);
  const seen = new Set();
  return {
    get: (...args) => binding.get(...args),
    async list(options) {
      const page = await binding.list(options);
      const objects = page.objects.filter(object => keys.has(object.key));
      for (const object of objects) seen.add(object.key);
      if (!page.truncated && [...keys].some(key => !seen.has(key))) throw new PortabilityError('missing_file_original', 409);
      return { ...page, objects };
    },
  };
}
