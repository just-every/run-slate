import type {FeatureContext} from '../../app/feature-context';
import type {RuntimeBindings} from '../../platform/config/runtime';
import {commitOperation, mutationGuard} from '../../app/operations';
import {ApiProblem} from '../../app/problems';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {prepareAiEnableStatements} from '../workspace/settings';
import {identityRevision} from '../workspace/revisions';
import {switchStates} from './state';
import type {SwitchKey} from './catalog';

export async function readSwitches(ctx: FeatureContext, config: RuntimeBindings) {
  await requireWorkspaceOwner(ctx);
  return {items: await switchStates(ctx.db, ctx.actor.workspaceId, config)};
}

export async function setSwitch(ctx: FeatureContext, input: {operationKey: string; key: SwitchKey; enabled: boolean}, config: RuntimeBindings) {
  return commitOperation(ctx, {
    operationKey: input.operationKey, action: 'workspace.feature-switch', request: input,
    authorize: () => requireWorkspaceOwner(ctx),
    prepare: async ({revisionId}) => {
      const state = (await switchStates(ctx.db, ctx.actor.workspaceId, config)).find(state => state.key === input.key)!;
      if (input.enabled && !state.available) throw new ApiProblem(403, 'FEATURE_DISABLED', state.prerequisites.join(' '));
      const statements = [
        mutationGuard(ctx.db, "SELECT role='owner' AND member_kind='member' AND status='active' FROM members WHERE id=? AND workspace_id=?", [ctx.actor.id, ctx.actor.workspaceId]),
        ctx.db.prepare('INSERT INTO workspace_feature_switches (workspace_id,switch_key,enabled,changed_by_member_id,changed_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,switch_key) DO UPDATE SET enabled=excluded.enabled,changed_by_member_id=excluded.changed_by_member_id,changed_at=excluded.changed_at').bind(ctx.actor.workspaceId, input.key, +input.enabled, ctx.actor.id, ctx.now),
        await identityRevision(ctx, revisionId, 'workspace-feature', `${ctx.actor.workspaceId}:${input.key}`, {key: input.key, enabled: input.enabled}),
      ];
      if (input.key === 'ai') statements.push(...await prepareAiEnableStatements(ctx, input.enabled));
      return {entity: {kind: 'workspace', id: ctx.actor.workspaceId, revisionId}, value: {key: input.key, enabled: input.enabled}, detail: {switchKey: input.key, enabled: input.enabled}, statements};
    },
  });
}
