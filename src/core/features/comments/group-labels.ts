import type { FeatureContext } from '../../app/feature-context';
import { groupMentionIds } from './group-mentions';

/** A submitted label cannot impersonate a different group. Keep the native ID and resolve its name. */
export async function canonicalGroupLabels<T>(ctx: FeatureContext, value: T): Promise<T> {
  const ids=groupMentionIds(value);
  if(!ids.length)return value;
  const rows=(await ctx.db.prepare('SELECT id,name FROM groups WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?))')
    .bind(ctx.actor.workspaceId,JSON.stringify(ids)).all<{id:string;name:string}>()).results;
  const names=new Map(rows.map(row=>[row.id,row.name]));
  return labelGroups(value,id=>names.get(id)??'Unavailable group');
}

export function labelGroups<T>(value:T,name:(id:string)=>string):T {
  function walk(item:unknown):unknown {
    if(Array.isArray(item))return item.map(walk);
    if(item&&typeof item==='object') {
      const object=item as Record<string,any>;
      if(object.mention?.kind==='group')return {...object,mention:{...object.mention,label:name(object.mention.id)}};
      return Object.fromEntries(Object.entries(object).map(([key,value])=>[key,walk(value)]));
    }
    return item;
  }
  return walk(value) as T;
}
