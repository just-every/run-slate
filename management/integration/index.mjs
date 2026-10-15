import profile from './profile.json' with {type: 'json'};
import specification from './deployment-spec.json' with {type: 'json'};
import {fixedVariables, publicInputs, validateAddresses, generatedConfiguration, validateMailSecrets} from './configuration.mjs';
export function createIntegration(host) {
  return {
    profile, sourceEnvironmentPrefix: 'SLATE', surfaces: {app: '/signin'}, fixedVariables,
    generatedConfiguration, validateAddresses,
    async generatePlan(installationId, environment, config) {
      if (typeof installationId !== 'string' || !installationId.trim() || !['preview', 'production'].includes(environment)) throw Error('Installation and environment required');
      const {controlledProviders, APP_URL, PUBLIC_PAGE_HOST, RER_MANAGEMENT_ORIGIN, ...configuration} = config;
      const variables = publicInputs(configuration);
      const app = new URL(APP_URL), management = new URL(RER_MANAGEMENT_ORIGIN);
      for (const url of [app, management]) if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Exact HTTPS application and management origins required');
      if (app.hostname !== PUBLIC_PAGE_HOST) throw Error('Public and app hostname must match');
      Object.assign(variables, {APP_URL: app.origin, PUBLIC_PAGE_HOST, RER_MANAGEMENT_ORIGIN: management.origin, RER_INSTALLATION_ID: installationId});
      if (environment === 'preview' && (!Array.isArray(controlledProviders) || !controlledProviders.length || controlledProviders.some(value => typeof value !== 'string' || !value.trim()))) throw Error('Preview requires explicit controlled provider declarations');
      const prefix = `rer-${(await host.sha256(installationId)).slice(0, 16)}-${environment === 'production' ? 'prod' : 'preview'}`;
      const {optionalSecretNames, ...spec} = structuredClone(specification);
      const plan = {
        ...spec, workerName: `${prefix}-slate`, environment,
        resources: spec.resources.map(row => ({...row, name: `${prefix}-${row.binding.toLowerCase()}`})),
        publicVariables: {...spec.publicVariables, ...variables},
        secretNames: [...new Set([...spec.secretNames, 'MAIL_API_KEY'])],
        ...(environment === 'preview' ? {schedules: [], queueConsumers: [], previewEffects: {schedulesDisabled: true, controlledProviders: [...controlledProviders]}} : {}),
      };
      validateMailSecrets(plan.publicVariables, plan.secretNames);
      await host.validatePlan(plan);
      return plan;
    },
    async revisePlan(plan, input) {
      const allowed = new Set([...specification.secretNames, ...(specification.optionalSecretNames ?? [])]);
      if (!Array.isArray(input.secretNames) || input.secretNames.some(name => !allowed.has(name)) || specification.secretNames.some(name => !input.secretNames.includes(name))) throw Error('Core-wiki requires its declared required secrets and accepts only declared optional secrets');
      const editable = ['SETUP_OWNER_EMAIL', 'MAIL_FROM', 'MAIL_RELAY_URL', 'LINK_PREVIEWS_ENABLED'];
      for (const [name, value] of Object.entries(input.publicVariables)) if (!editable.includes(name) && value !== plan.publicVariables[name]) throw Error(`Unsupported core-wiki configuration: ${name}`);
      const changed = publicInputs({...Object.fromEntries(editable.map(name => [name, input.publicVariables[name] ?? plan.publicVariables[name]]).filter(([, value]) => value !== undefined)), MAIL_PROVIDER: plan.publicVariables.MAIL_PROVIDER});
      for (const name of fixedVariables) if (input.publicVariables[name] !== undefined && input.publicVariables[name] !== plan.publicVariables[name]) throw Error(`Fixed native configuration: ${name}`);
      const next = structuredClone(plan);
      next.publicVariables = {...plan.publicVariables, ...changed};
      next.secretNames = [...new Set(input.secretNames)];
      validateMailSecrets(next.publicVariables, next.secretNames);
      if (plan.environment === 'preview') {
        if (!input.controlledProviders?.length || input.controlledProviders.some(value => typeof value !== 'string' || !value.trim())) throw Error('Preview provider isolation must remain explicit');
        next.previewEffects = {schedulesDisabled: true, controlledProviders: [...input.controlledProviders]};
      }
      validateAddresses(next); await host.validatePlan(next); Object.assign(plan, next);
    },
  };
}
