import { TENANT } from '../native/store';
import type { SamlConfig } from './types';
export const readSamlConfig = (db:D1Database) => db.prepare(`SELECT * FROM saml_provider_config WHERE workspace_id=${TENANT}`).first<SamlConfig>();
