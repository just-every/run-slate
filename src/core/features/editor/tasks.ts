import type { FeatureContext } from '../../app/feature-context';
import type { BlockInput } from '../pages/types';
/** Completion and creation attribution are server owned. Prior task identity survives edits. */
export async function normalizeTask(ctx: FeatureContext, block: Pick<BlockInput, 'blockType' | 'content'> & {id?:string}, prior?: Pick<BlockInput, 'blockType' | 'content'>) {
 if(block.blockType!=='task')return block.content;
 const {completedBy:_display,completedAtLabel:_label,completedByAgent:_agent,createdByAgent:_creatorAgent,...content}=block.content as Record<string,any>;
 const old=prior?.blockType==='task'?prior.content as Record<string,any>:undefined;
 const origin=block.id?await ctx.db.prepare('SELECT member_id FROM task_origins WHERE block_id=?').bind(block.id).first<{member_id:string|null}>():null;
 return {...content,...(old?.createdByAgent?{createdByAgent:old.createdByAgent}:!old&&ctx.agent?{createdByAgent:ctx.agent.label}:{}),...(content.done&&(old?.done?old.completedByAgent:ctx.agent?.label)?{completedByAgent:old?.done?old.completedByAgent:ctx.agent!.label}:{}),assigneeMemberId:content.assigneeMemberId??null,dueDate:content.dueDate??null,creatorMemberId:origin?origin.member_id:old?old.creatorMemberId??null:ctx.actor.id,completedByMemberId:content.done?(old?.done?old.completedByMemberId??ctx.actor.id:ctx.actor.id):null,completedAt:content.done?(old?.done?old.completedAt??ctx.now:ctx.now):null};
}
