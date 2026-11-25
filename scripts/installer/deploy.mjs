import { readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { privateDirectory, writePrivateFile } from '@runeditrun/rer/private-files';
import { ownerDeploy } from '@runeditrun/rer/deploy';
import { identityProviderOrigin } from './settings.mjs';
import { missing, invalid } from '@runeditrun/rer/errors';
// Native provider selection; execution and resource custody remain Base-owned.
// Mail is off only when the deployment says so in words: SLATE_MAIL_PROVIDER or MAIL_PROVIDER set to `none`
// (rer's mail-off deploy). Nothing is sent then; the owner signs in with `rer signin`.
const mailOffRefusal = 'MAIL_PROVIDER=none turns outbound email off; do not combine it with SLATE_MAIL_FROM, SLATE_MAIL_API_KEY or SLATE_MAIL_RELAY_URL.';
export const deploy = lifecycle => async context => {
  const named = process.env.SLATE_MAIL_PROVIDER?.trim() || undefined, generic = process.env.MAIL_PROVIDER?.trim() || undefined;
  if (named && generic === 'none' && named !== 'none') throw invalid('SLATE_MAIL_PROVIDER and MAIL_PROVIDER=none disagree. Set one provider consistently.');
  const provider = named ?? (generic === 'none' ? 'none' : undefined), off = provider === 'none';
  const sender = off ? undefined : process.env.SLATE_MAIL_FROM;
  if (off) {
    if (['SLATE_MAIL_FROM', 'SLATE_MAIL_API_KEY', 'SLATE_MAIL_RELAY_URL'].some(name => process.env[name]?.trim())) throw invalid(mailOffRefusal);
  } else {
    if (!provider || !sender) throw missing('SLATE_MAIL_PROVIDER and SLATE_MAIL_FROM are required; see OPERATIONS.md.');
    if (!['rer', 'resend', 'sendgrid'].includes(provider) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) throw invalid('Declare a supported native mail provider and sender.');
    if (!process.env.SLATE_MAIL_API_KEY?.trim()) throw missing('SLATE_MAIL_API_KEY is required for the selected hosted mail provider.');
  }
  let relayUrl = '';
  if (provider === 'rer') {
    let relay;
    try { relay = new URL(process.env.SLATE_MAIL_RELAY_URL); } catch { throw invalid('RER mail requires a valid SLATE_MAIL_RELAY_URL.'); }
    if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash) throw invalid('SLATE_MAIL_RELAY_URL must be an HTTPS URL without credentials, query or fragment.');
    relayUrl = relay.href;
  }
  const declaration = JSON.parse(await readFile(join(context.root, 'deploy.json'), 'utf8'));
  declaration.vars.IDENTITY_PROVIDER = identityProviderOrigin(process.env.SLATE_IDENTITY_PROVIDER);
  // The provider is a public variable of this deployment (wrangler.jsonc declares it); it is not a secret binding.
  declaration.vars.MAIL_PROVIDER = provider;
  declaration.vars.MAIL_RELAY_URL = relayUrl;
  // The app's name in mail (sender name and subject); blank keeps Slate.
  declaration.vars.APP_NAME = process.env.SLATE_APP_NAME?.trim() ?? '';
  const directory = await privateDirectory(context.root, ['.seed', 'installer']);
  const path = join(directory, 'owner-deploy.json');
  await writePrivateFile(path, JSON.stringify(declaration) + '\n');
  try { return await ownerDeploy(relative(context.root, path), lifecycle)(context); }
  finally { await rm(path, { force: true }); }
};
