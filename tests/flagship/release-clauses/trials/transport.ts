import {vi} from 'vitest';
import {nativeHash} from '../../../../src/core/features/connectors/native-effects';

/** Test-only owning-system transport. No request can reach an actual provider. */
export function transport() {
  const sends: Array<Record<string, any>> = [], requests: string[] = [], revisions = new Map<string, string>();
  const hooks = {send: undefined as undefined | ((body: Record<string, any>, index: number) => Promise<void>), audience: undefined as undefined | (() => Promise<void>)};
  const identity = {protocol:'rer-delegation/1',provider:'orbit',installationId:'u6-installation',accountId:'account',principalId:'source-owner',label:'Controlled owner',grantId:'source-grant',expiresAt:'2099-01-01T00:00:00Z',scopes:['crm.evidence.read','crm.handoff.write'],targets:['opportunities/o'],capabilities:{readKinds:['crm.opportunity','crm.handoff'],operations:['orbit.handoff.upsert'],conditionalWrite:true,providerIdempotency:true,readBack:true,reconciliationAttribution:true}};
  vi.stubGlobal('fetch', async (raw: string|URL|Request, init?: RequestInit) => {
    const url = new URL(typeof raw === 'string' ? raw : raw instanceof URL ? raw : raw.url);
    if (url.origin !== 'https://u6-native.test') throw Error('Unmatched provider origin: '+url.origin);
    const method = init?.method ?? 'GET', path = url.pathname;
    requests.push(method+' '+path);
    if (method === 'GET' && path === '/api/delegation/v1/identity') return Response.json(identity);
    const target = url.searchParams.get('target');
    if (method === 'GET' && path === '/api/delegation/v1/audience' && target?.startsWith('opportunities/o/handoffs/') && url.searchParams.get('operation') === 'orbit.handoff.upsert') {
      await hooks.audience?.();
      return Response.json({kind:'source-principals',principalIds:['source-owner'],audienceRevision:'audience'});
    }
    if (method === 'GET' && path === '/api/delegation/v1/check' && target?.startsWith('opportunities/o/handoffs/')) return Response.json({provider:'orbit',installationId:identity.installationId,accountId:'account',principalId:'source-owner',target,revision:revisions.get(target)??'before',observedAt:new Date().toISOString(),audience:{kind:'source-principals',principalIds:['source-owner']}});
    if (method === 'POST' && path === '/api/delegation/v1/effects') {
      const body=JSON.parse(String(init?.body)), {operationKey,...request}=body;
      if (request.operation !== 'orbit.handoff.upsert' || !request.target.startsWith('opportunities/o/handoffs/')) throw Error('Unmatched effect');
      sends.push(body); await hooks.send?.(body,sends.length-1);
      const stamp=new Date().toISOString(); revisions.set(request.target,'after');
      return Response.json({state:'confirmed',receipt:{id:'u6-receipt-'+sends.length,operationKey,requestHash:await nativeHash(request),provider:'orbit',installationId:identity.installationId,accountId:'account',principalId:'source-owner',operation:request.operation,target:request.target,beforeRevision:'before',afterRevision:'after',committedAt:stamp},observed:{target:request.target,revision:'after',content:request.content,observedAt:stamp}});
    }
    throw Error('Unmatched provider request: '+method+' '+url.href);
  });
  return {sends,requests,hooks};
}
