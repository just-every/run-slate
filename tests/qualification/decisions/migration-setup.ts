import {applyD1Migrations,env} from 'cloudflare:test';
await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.filter(m=>!m.name.startsWith('0013')));
