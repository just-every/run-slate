import { fileURLToPath } from 'node:url';
import { checkOperationCommands } from './check-operation-commands.mjs';

// Local configuration only (rer doctor runs this on a developer's computer): every declared operation names a package
// command that exists. Deployment inputs are rer deploy's to check; a local checkout has none of them.
export function validateConfiguration() {
  checkOperationCommands(fileURLToPath(new URL('../', import.meta.url)));
}
