import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Checks package commands without executing them or inspecting provider inputs. */
export function checkOperationCommands(root, descriptor = JSON.parse(fs.readFileSync(path.join(root, 'OPERATIONS.json'), 'utf8'))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const command of Object.values(descriptor.commands ?? {})) {
    const argv = command.argv;
    if (argv?.[0] !== 'pnpm') continue;
    const name = argv[1] === 'run' ? argv[2] : argv[1];
    if (typeof name !== 'string' || typeof manifest.scripts?.[name] !== 'string' || !manifest.scripts[name].trim()) {
      throw new Error('Missing package command.');
    }
  }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkOperationCommands(process.cwd());
  console.log('Declared operation package commands are available.');
}
