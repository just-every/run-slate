import {execFileSync} from 'node:child_process';
// Used only by the credential-free project build job. This setup is dependency
// installation, not Slate's remote provider-provisioning `pnpm run setup` command.
if (process.versions.node !== '22.12.0') throw Error('Trusted build requires Node 22.12.0');
if (execFileSync('pnpm', ['--version'], {encoding: 'utf8'}).trim() !== '8.15.6') throw Error('Trusted build requires pnpm 8.15.6');
const commands = {
  setup: [['install', '--frozen-lockfile'], ['exec', 'playwright', 'install', '--with-deps', 'chromium']],
  build: [['build']],
  verify: [['verify'], ['test:release-source'], ['source:check']],
  artifact: [['artifact:delivery']],
};
const selected = commands[process.argv[2]];
if (!selected || process.argv.length !== 3) throw Error('Expected setup, build, verify or artifact');
for (const args of selected) execFileSync('pnpm', args, {stdio: 'inherit'});
