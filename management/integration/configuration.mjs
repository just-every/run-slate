export const requiredPublicInputs = ['SETUP_OWNER_EMAIL', 'MAIL_FROM', 'MAIL_PROVIDER'];
export const fixedVariables = ['APP_URL', 'PUBLIC_PAGE_HOST', 'SLATE_PROFILE', 'AI_ENABLED', 'SSO_ENABLED', 'AI_PROVIDER', 'ALLOW_LOOPBACK_DELEGATION', 'RER_INSTALLATION_ID', 'RER_MANAGEMENT_ORIGIN'];
const editable = new Set([...requiredPublicInputs, 'MAIL_RELAY_URL', 'LINK_PREVIEWS_ENABLED']);
export function publicInputs(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Public configuration is required');
  const result = {};
  for (const [name, value] of Object.entries(config)) {
    if (!editable.has(name)) throw Error(`Unsupported core-wiki configuration: ${name}`);
    if (typeof value !== 'string' || (!value.trim() && name !== 'MAIL_RELAY_URL') || value.length > 1024) throw Error(`Invalid configuration: ${name}`);
    result[name] = value.trim();
  }
  if (requiredPublicInputs.some(name => !result[name])) throw Error('Setup owner email and sender are required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.SETUP_OWNER_EMAIL) || /[\r\n]/.test(result.MAIL_FROM)) throw Error('Invalid owner or sender');
  if (result.LINK_PREVIEWS_ENABLED !== undefined && !['true', 'false'].includes(result.LINK_PREVIEWS_ENABLED)) throw Error('Invalid link preview setting');
  if (!['rer', 'resend', 'sendgrid'].includes(result.MAIL_PROVIDER)) throw Error('Hosted mail requires RER, Resend or SendGrid.');
  if (result.MAIL_PROVIDER === 'rer' || result.MAIL_RELAY_URL) {
    let relay;
    try { relay = new URL(result.MAIL_RELAY_URL); } catch { throw Error('RER mail requires a valid MAIL_RELAY_URL.'); }
    if (relay.protocol !== 'https:' || relay.username || relay.password || relay.search || relay.hash) throw Error('MAIL_RELAY_URL must be an HTTPS URL without credentials, query or fragment.');
  }
  return result;
}
export function validateMailSecrets(publicVariables, secretNames) {
  if (['rer', 'resend', 'sendgrid'].includes(publicVariables.MAIL_PROVIDER) && !secretNames.includes('MAIL_API_KEY')) throw Error('The selected hosted mail provider requires MAIL_API_KEY.');
}
export function validateAddresses(plan) {
  const a = plan.addresses, v = plan.publicVariables;
  if (!a || a.page || a.websitePreview || a.app.path !== '/signin' || v.APP_URL !== `https://${a.app.hostname}` || v.PUBLIC_PAGE_HOST !== a.app.hostname) throw Error('Slate requires one native app/public-page host');
}
export function generatedConfiguration(addresses) {
  if (addresses.page || addresses.websitePreview || addresses.app.path !== '/signin') throw Error('Slate requires one native app/public-page host');
  return {APP_URL: `https://${addresses.app.hostname}`, PUBLIC_PAGE_HOST: addresses.app.hostname};
}
