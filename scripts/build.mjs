import { mkdir, writeFile, rm } from 'node:fs/promises';
import { sourceIdentity, outputIdentity } from './build/source-identity.mjs';
import { buildEnvironment } from '@runeditrun/rer/local/environment';
// Shared onboarding owns child execution, credential isolation and recovery.
export async function build(context) {
  const { root } = context;
  await rm(`${root}/.cache/slate/build-source.json`, { force: true });
  const before = await sourceIdentity(root);
  const env = { ...buildEnvironment(/^(?:SLATE_)?(?:SESSION_SECRET|SETUP_TOKEN|SETUP_OWNER_EMAIL|OWNER_EMAIL|AUTH_|OIDC_|APP_URL|MAIL_|LOCAL_|AI_|CONNECTOR_|GOOGLE_|SLACK_|GITHUB_|HAPPYTOHELP_|ORBIT_|ALLOW_LOOPBACK_)/), RER_LOCAL_OPERATION: context.operationToken };
  await context.run('Building Slate', 'pnpm', ['exec', 'vite', 'build'], { step: 'build', env });
  const after = await sourceIdentity(root);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Source changed during build; inspect generated changes and rebuild');
  await mkdir(`${root}/.cache/slate`, { recursive: true });
  await writeFile(`${root}/.cache/slate/build-source.json`, JSON.stringify({ schema: 1, ...after, outputSha256: await outputIdentity(root) }) + '\n');
}
