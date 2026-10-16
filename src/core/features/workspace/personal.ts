import {mutationGuard} from '../../app/operations';
import type {FeatureContext} from '../../app/feature-context';
import type {MemberSubject} from '../../shared/knowledge/model';
import {currentSubject} from '../sharing/current-access';
import {createUlid} from '../../shared/ulid';
export function personalContainerStatements(db:D1Database,input:{workspaceId:string;memberId:string;now:string}) {
  const id=createUlid();return [db.prepare("INSERT INTO containers (id,workspace_id,key,name,visibility,guest_access,public_link_access,anonymous_access,created_at,updated_at,revision_id) VALUES (?,?,?,'Personal','personal','forbidden','forbidden','forbidden',?,?,?)").bind(id,input.workspaceId,`personal:${input.memberId}`,input.now,input.now,createUlid()),db.prepare('INSERT INTO container_owners VALUES (?,?,?)').bind(id,input.memberId,input.now),db.prepare('INSERT INTO container_members VALUES (?,?,?)').bind(id,input.memberId,input.now),db.prepare("INSERT INTO container_grants (id,container_id,principal_kind,principal_id,level,created_at,updated_at) VALUES (?,?,'member',?,'full',?,?)").bind(createUlid(),id,input.memberId,input.now,input.now)];
}
export async function ensurePersonalContainer(ctx:FeatureContext, freshSubject?:MemberSubject) {
  const subject=freshSubject??await currentSubject(ctx);
  if(subject.isGuest)return;
  const key=`personal:${ctx.actor.id}`;
  const state=await ctx.db.prepare('SELECT EXISTS(SELECT 1 FROM containers WHERE workspace_id=?) AS hasContainers,EXISTS(SELECT 1 FROM containers WHERE workspace_id=? AND key=?) AS hasPersonal')
    .bind(ctx.actor.workspaceId,ctx.actor.workspaceId,key).first<{hasContainers:number;hasPersonal:number}>();
  if(!state!.hasContainers||state!.hasPersonal)return;
  try {
    await ctx.db.batch([
      mutationGuard(ctx.db,"SELECT status='active' AND member_kind='member' FROM members WHERE id=? AND workspace_id=?",[ctx.actor.id,ctx.actor.workspaceId]),
      ...personalContainerStatements(ctx.db,{workspaceId:ctx.actor.workspaceId,memberId:ctx.actor.id,now:ctx.now})
    ]);
  } catch(cause) {
    if(!await ctx.db.prepare('SELECT id FROM containers WHERE workspace_id=? AND key=?').bind(ctx.actor.workspaceId,key).first())throw cause;
  }
}
