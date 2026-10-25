import {providerFolderJourney} from './provider-folder-journey';
import {contract} from '../contract';
import {beforeEach} from 'vitest';
import {env} from 'cloudflare:test';
import {resetDatabase} from '../setup/reset-database';

beforeEach(async()=>{await resetDatabase(env.DB);await env.DB.exec('DROP TABLE IF EXISTS _rer_deploy_migrations');});

contract('IMP-009','Member folder imports preserve a nested twelve-document tree, resolving links and actor-only access with a per-file omission report',providerFolderJourney);
