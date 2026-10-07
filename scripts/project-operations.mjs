import { stat, realpath, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;

// Descriptors can identify only files in their own checkout, including through symlinks.
async function localFile(root, path) {
  if (!text(path) || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('Invalid project input path.');
  const target = await realpath(resolve(root, path));
  const inside = relative(await realpath(root), target);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Project input escapes checkout.');
  if (!(await stat(target)).isFile()) throw new Error('Project input is not a file.');
}

export async function readProjectOperations(root, descriptor) {
  if (!text(descriptor.project) || !Array.isArray(descriptor.requiredEnvironment)
      || descriptor.requiredEnvironment.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(name))
      || !Array.isArray(descriptor.runtime?.requirements)
      || descriptor.runtime.requirements.some(item => !text(item?.name) || !text(item?.version))
      || !descriptor.commands || Array.isArray(descriptor.commands)
      || !Object.keys(descriptor.commands).length) throw new Error('Invalid project operations descriptor.');
  for (const path of [descriptor.documentation?.document, descriptor.acceptance?.document, descriptor.configuration?.module].filter(value => value !== undefined)) await localFile(root, path);
  const commands = [];
  for (const [name, command] of Object.entries(descriptor.commands)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !Array.isArray(command?.argv) || !command.argv.length
        || command.argv.some(arg => typeof arg !== 'string') || !text(command.argv[0])
        || !text(command.effects) || !Array.isArray(command.inputs)) throw new Error('Invalid project operation command.');
    let available = true;
    for (const path of command.inputs) {
      // Malformed paths are descriptor errors; missing declared files are unavailable targets.
      if (!text(path) || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('Invalid project input path.');
      try { await localFile(root, path); } catch (error) {
        if (error.code === 'ENOENT') available = false;
        else throw error;
      }
    }
    if (command.argv[0] === 'pnpm' && command.argv[1] === 'run') {
      const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
      const script = pkg.scripts?.[command.argv[2]];
      if (typeof script !== 'string' || !script.trim()) throw new Error('Missing package command.');
      for (const match of script.matchAll(/(?:^|\s)node\s+([\w./-]+\.mjs)(?=\s|$)/g)) {
        try { await localFile(root, match[1]); } catch (error) {
          if (error.code === 'ENOENT') available = false;
          else throw error;
        }
      }
    }
    commands.push({ name, available });
  }
  return { descriptor, commands };
}
