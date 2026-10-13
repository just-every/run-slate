import { readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { privateDirectory, writePrivateFile } from '@runeditrun/rer/private-files';
import { ownerDeploy } from '@runeditrun/rer/deploy';
import { missing, invalid } from '@runeditrun/rer/errors';
// Native provider selection; execution and resource custody remain Base-owned.
export const deploy = lifecycle => async context => {
  const provider = process.env.SLATE_MAIL_PROVIDER, sender = process.env.SLATE_MAIL_FROM;
  if (!provider || !sender) throw missing('SLATE_MAIL_PROVIDER and SLATE_MAIL_FROM are required; see OPERATIONS.md.');
  if (!['resend', 'sendgrid'].includes(provider) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) throw invalid('Declare a supported native mail provider and sender.');
  const declaration = JSON.parse(await readFile(join(context.root, 'deploy.json'), 'utf8'));
  declaration.vars.MAIL_PROVIDER = provider; declaration.vars.MAIL_FROM = sender;
  const directory = await privateDirectory(context.root, ['.seed', 'installer']);
  const path = join(directory, 'owner-deploy.json');
  await writePrivateFile(path, JSON.stringify(declaration) + '\n');
  try { return await ownerDeploy(relative(context.root, path), lifecycle)(context); }
  finally { await rm(path, { force: true }); }
};
