export const SAML_PATHS = ['/auth/saml/metadata', '/auth/saml/start', '/auth/saml/acs'] as const;
export const SAML_NS = 'urn:oasis:names:tc:SAML:2.0:assertion';
export const PROTOCOL_NS = 'urn:oasis:names:tc:SAML:2.0:protocol';
export const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
export const POST_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';
export const FLOW_COOKIE = 'slate_saml_flow';
export const DAY = 86_400_000;
export interface SamlConfig {
 workspace_id: string; enabled: number; generation: number; idp_entity_id: string; sso_url: string; certificate: string;
 email_domain: string; dns_challenge: string; domain_status: 'pending'|'verified'|'failed';
 domain_verified_at: number|null; domain_checked_at: number|null; domain_failed_at: number|null; domain_failure: string|null;
 allowed_emails_json: string; enforced: number; break_glass_owner_id: string|null; updated_by_member_id: string|null; updated_at: number;
}
export interface SamlAssertion { id: string; issuer: string; subject: string; email: string; expiresAt: number; inResponseTo: string|null }
export const samlEndpoints = (origin: string) => ({ entityId: `${origin}/auth/saml/metadata`, acsUrl: `${origin}/auth/saml/acs`, metadataUrl: `${origin}/auth/saml/metadata` });
