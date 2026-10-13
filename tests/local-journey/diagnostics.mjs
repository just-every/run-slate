import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createRedaction, credentialValues } from '@runeditrun/rer/redaction';
import { repo } from './runtime.mjs';

// Keep failed command captures after scratch cleanup, with native secrets and
// sign-in query values removed. Never publish private settings or captured mail.
export async function saveFailure(copy, child, name, failure) {
  const redaction = createRedaction();
  try { redaction.addSecrets(credentialValues(parseEnv(await readFile(join(copy.root, '.dev.vars'), 'utf8')))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const captures = [child?.output ?? ''];
  if (failure?.capture) captures.unshift(`FAILED ${failure.capture.command} (in ${failure.capture.cwd ?? copy.root})`, failure.capture.output);
  async function logs(directory) {
    let files; try { files = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const file of files) {
      const path = join(directory, file.name);
      if (file.isDirectory()) await logs(path);
      else if (file.isFile() && file.name.endsWith('.log')) captures.push((await readFile(path, 'utf8')).slice(-1024 * 1024));
    }
  }
  // Every checkout in the scratch directory, including a restored target.
  for (const entry of await readdir(copy.directory, { withFileTypes: true })) if (entry.isDirectory()) {
    try { redaction.addSecrets(credentialValues(parseEnv(await readFile(join(copy.directory, entry.name, '.dev.vars'), 'utf8')))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await logs(join(copy.directory, entry.name, '.seed/installer'));
  }
  const directory = join(repo, '.artifacts/local-journey');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}-failure.log`), redaction.redact(captures.join('\n')).replace(/([?&#](?:token|signature|key|rer-dev)=)[^\s"'<>&]+/gi, '$1[REDACTED]'), { mode: 0o600 });
}
