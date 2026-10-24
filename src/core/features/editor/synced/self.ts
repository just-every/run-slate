import type {FeatureContext} from '../../../app/feature-context';
import type {BlockInput} from '../../pages/types';
import type {BlockView} from '../../../shared/api/content';
import {createUlid} from '../../../shared/ulid';
import {pageRow,revisionRow} from '../../pages/repository';
/** Same-page copies belong to the caller's replacement revision, not a competing page revision. */
export async function detachOwnCopies(ctx:FeatureContext,pageId:string,blocks:BlockInput[],removed:BlockInput[]){
 const own=blocks.filter(b=>b.blockType==='synced-reference'&&!(b.content as any).staticId&&(b.content as any).sourcePageId===pageId&&removed.some(source=>source.id===(b.content as any).sourceBlockId));
 if(!own.length)return;
 const page=await pageRow(ctx,pageId),published=page.published_revision_id?await revisionRow(ctx,pageId,page.published_revision_id):null;
 const publishedBlocks:BlockView[]=published?JSON.parse(published.body_json):[];
 for(const copy of own){
  const id=(copy.content as any).sourceBlockId,source=publishedBlocks.find(b=>b.id===id&&b.blockType==='synced-source')??removed.find(b=>b.id===id)!;
  const title=publishedBlocks.some(b=>b.id===id&&b.blockType==='synced-source')?JSON.parse(published!.properties_json).title:page.title;
  Object.assign(copy,{blockType:'paragraph',content:{text:[...(source.content as {text:unknown[]}).text,{text:`\nSource: ${title}`}]},revisionId:createUlid()});
 }
}
