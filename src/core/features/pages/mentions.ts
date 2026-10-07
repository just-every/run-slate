import type { FeatureContext } from '../../app/feature-context';
import type { BlockView } from '../../shared/api/content';
import { resolveCurrentAccessMany } from '../sharing/current-access';
export interface MentionResolution {
    label:string;
    available:boolean;
    state:'live'|'draft'|'scheduled'|'archived'|'trashed'|'deleted'|'restricted'|'unavailable';
    deletedAt?:string;
}
export async function resolveMentions(ctx:FeatureContext,blocks:BlockView[]):Promise<Record<string,MentionResolution>> {
    const ids=new Set<string>();
    function collect(value:unknown) {
        if(Array.isArray(value))value.forEach(collect);
        else if(value&&typeof value==='object') {
            const record=value as Record<string,any>;
            if(record.mention?.kind==='page'&&typeof record.mention.id==='string')ids.add(record.mention.id);
            Object.values(record).forEach(collect);
        }
    }
    blocks.forEach(block=>collect(block.content));
    const access=await resolveCurrentAccessMany(ctx,[...ids],{includeTrashed:true,includeDeleted:true});
    const labels:Record<string,MentionResolution>={};
    for(const id of ids) {
        // Lifecycle does not grant disclosure: a restricted target reveals no title or state.
        const decision=access.get(id)?.decision;
        if(!decision?.allowed){labels[id]={label:'Restricted page',available:false,state:'restricted'};continue;}
        const row=await ctx.db.prepare('SELECT title,lifecycle,archived_at,trashed_at,deleted_at,working_revision_id,published_revision_id FROM pages WHERE id=? AND workspace_id=?').bind(id,ctx.actor.workspaceId).first<{title:string;lifecycle:string;archived_at:string|null;trashed_at:string|null;deleted_at:string|null;working_revision_id:string;published_revision_id:string|null}>();
        if(!row){labels[id]={label:'Unavailable page',available:false,state:'unavailable'};continue;}
        if(row.deleted_at){labels[id]={label:'Deleted page',available:false,state:'deleted',deletedAt:row.deleted_at};continue;}
        let label=row.title;
        if(!['edit','full'].includes(decision.level!)&&row.published_revision_id&&row.published_revision_id!==row.working_revision_id) {
            const revision=await ctx.db.prepare('SELECT properties_json FROM page_revisions WHERE id=? AND page_id=? AND deleted_at IS NULL').bind(row.published_revision_id,id).first<{properties_json:string}>();
            if(!revision){labels[id]={label:'Unavailable page',available:false,state:'unavailable'};continue;}
            label=JSON.parse(revision.properties_json).title;
        }
        const state:MentionResolution['state']=row.trashed_at?'trashed':row.archived_at?'archived':row.lifecycle==='draft'?'draft':row.lifecycle==='scheduled'?'scheduled':'live';
        labels[id]={label,available:!row.trashed_at,state};
    }
    return labels;
}
