import {z} from 'zod';
import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {readPage} from '../pages/service';
export const selectionSchema=z.object({pageId:z.string(),revisionId:z.string(),blockId:z.string(),start:z.number().int().nonnegative(),end:z.number().int().positive(),text:z.string().min(1),action:z.enum(['improve','proofread','explain','shorten','expand','tone','translate','custom'])}).strict();
export type WritingSelection=z.infer<typeof selectionSchema>;
type Span={text:string;[key:string]:unknown};
export function selectedSpans(value:unknown):Span[]{if(!Array.isArray(value)||value.some(s=>!s||typeof s!=='object'||typeof s.text!=='string'))throw new ApiProblem(409,'UNSUPPORTED_SELECTION','Writing actions require a text-span block.');return value as Span[];}
export async function requireWritingSelection(ctx:FeatureContext,selection:WritingSelection){
 const document=await readPage(ctx,selection.pageId),block=document.blocks.find(b=>b.id===selection.blockId);
 if(document.workingRevisionId!==selection.revisionId||!block||selection.end<=selection.start)throw new ApiProblem(409,'STALE_SELECTION','The selected revision or block changed.');
 const spans=selectedSpans(textContent(block.content).text),text=spans.map(s=>s.text).join('');
 if(text.slice(selection.start,selection.end)!==selection.text||selection.end>text.length)throw new ApiProblem(409,'STALE_SELECTION','The exact selected text or range changed.');
 return {block,spans};
}
export function replaceSelectedSpans(spans:Span[],selection:WritingSelection,replacement:string){
 const before:Span[]=[],after:Span[]=[];let offset=0;
 for(const span of spans){const end=offset+span.text.length;if(offset<selection.start)before.push({...span,text:span.text.slice(0,Math.min(span.text.length,selection.start-offset))});if(end>selection.end)after.push({...span,text:span.text.slice(Math.max(0,selection.end-offset))});offset=end;}
 return [...before,{text:replacement},...after].filter(s=>s.text.length);
}

export function textContent(value:unknown):Record<string,import('../../shared/api/common').JsonValue>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiProblem(409,'UNSUPPORTED_SELECTION','A text object is required.');return value as Record<string,import('../../shared/api/common').JsonValue>;}
