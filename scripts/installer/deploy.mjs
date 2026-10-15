import { readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { privateDirectory, writePrivateFile } from '@runeditrun/rer/private-files';
import { ownerDeploy } from '@runeditrun/rer/deploy';
import { identityProviderOrigin } from './settings.mjs';
import { missing, invalid } from '@runeditrun/rer/errors';
// Native provider selection; execution and resource custody remain Base-owned.
export const deploy = lifecycle => async context => {
  const provider = process.env.SLATE_MAIL_PROVIDER, sender = process.env.SLATE_MAIL_FROM;
  if (!provider || !sender) throw missing('SLATE_MAIL_PROVIDER and SLATE_MAIL_FROM are required; see OPERATIONS.md.');
  if (!['rer', 'resend', 'sendgrid'].includes(provider) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) throw invalid('Declare a supported native mail provider and sender.');
  if (!process.env.SLATE_MAIL_API_KEY?.trim()) throw missing('SLATE_MAIL_API_KEY is required for the selected hosted mail provider.');
  let relayUrl = '';
  if (provider === 'rer') {
    let relay;
    try { relay = new URL(process.env.SLATE_MAIL_RELAY_URL); } catch { throw invalid('RER mail requires a valid SLATE_MAIL_RELAY_URL.'); }
    if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash) throw invalid('SLATE_MAIL_RELAY_URL must be an HTTPS URL without credentials, query or fragment.');
    relayUrl = relay.href;
  }
  const declaration = JSON.parse(await readFile(join(context.root, 'deploy.json'), 'utf8'));
  declaration.vars.IDENTITY_PROVIDER = identityProviderOrigin(process.env.SLATE_IDENTITY_PROVIDER);
  declaration.vars.MAIL_PROVIDER = provider; declaration.vars.MAIL_FROM = sender;
  declaration.vars.MAIL_RELAY_URL = relayUrl;
  const directory = await privateDirectory(context.root, ['.seed', 'installer']);
  const path = join(directory, 'owner-deploy.json');
  await writePrivateFile(path, JSON.stringify(declaration) + '\n');
  try { return await ownerDeploy(relative(context.root, path), lifecycle)(context); }
  finally { await rm(path, { force: true }); }
};
