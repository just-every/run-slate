import type {FeatureContext} from '../../app/feature-context';
import {readPage} from '../pages/service';
/** Executed after the revision and its watched event in the origin's transaction. */
export function changeBlockStatement(ctx:FeatureContext,pageId:string):D1PreparedStatement{
 return ctx.db.prepare(`WITH current AS (SELECT value AS b FROM json_each((SELECT body_json FROM page_revisions WHERE page_id=? ORDER BY rowid DESC LIMIT 1))),
 prior AS (SELECT value AS b FROM json_each(COALESCE((SELECT body_json FROM page_revisions WHERE page_id=? ORDER BY rowid DESC LIMIT 1 OFFSET 1),'[]'))),
 ids AS (SELECT json_extract(b,'$.id') AS id FROM current UNION SELECT json_extract(b,'$.id') FROM prior),
 differences AS (SELECT ids.id,p.b AS before,c.b AS after FROM ids LEFT JOIN prior p ON json_extract(p.b,'$.id')=ids.id LEFT JOIN current c ON json_extract(c.b,'$.id')=ids.id
 WHERE p.b IS NULL OR c.b IS NULL OR json_extract(p.b,'$.content') IS NOT json_extract(c.b,'$.content') OR json_extract(p.b,'$.blockType') IS NOT json_extract(c.b,'$.blockType') OR json_extract(p.b,'$.parentBlockId') IS NOT json_extract(c.b,'$.parentBlockId') OR json_extract(p.b,'$.treePosition') IS NOT json_extract(c.b,'$.treePosition'))
 INSERT INTO notification_change_blocks(outbox_id,block_id,existed_before,exists_after)
 SELECT o.id,d.id,d.before IS NOT NULL,d.after IS NOT NULL FROM differences d JOIN notification_outbox o ON o.id='watch-edit:'||(SELECT session_id FROM watch_edit_sessions WHERE page_id=? AND actor_member_id=?) WHERE 1
 ON CONFLICT(outbox_id,block_id) DO UPDATE SET exists_after=excluded.exists_after`).bind(pageId,pageId,pageId,ctx.actor.id);
}
export async function changeSummary(ctx:FeatureContext,outboxId:string,pageId:string|null,event:string,sectionNames:boolean){
 if(event==='comment'||event==='reply')return '1 comment added';
 if(event!=='page-edited'||!pageId)return '';
 const changes=(await ctx.db.prepare('SELECT block_id,existed_before,exists_after FROM notification_change_blocks WHERE outbox_id=?').bind(outboxId).all<{block_id:string;existed_before:number;exists_after:number}>()).results;
 const phrases=([[changes.filter(b=>!b.existed_before&&b.exists_after).length,'added'],[changes.filter(b=>b.existed_before&&b.exists_after).length,'changed'],[changes.filter(b=>b.existed_before&&!b.exists_after).length,'removed']] as const).filter(([n])=>n).map(([n,verb])=>`${n} ${n===1?'block':'blocks'} ${verb}`);
 if(!phrases.length)return '';
 const headings=new Set<string>();
 if(sectionNames){
  const blocks=(await readPage(ctx,pageId)).blocks;
  let heading='';
  for(const block of blocks){if(block.blockType==='heading'){const content=block.content as {text?:string|{text?:string}[]};heading=typeof content.text==='string'?content.text:(content.text??[]).map(r=>r.text??'').join('');}if(heading&&changes.some(b=>b.block_id===block.id))headings.add(heading);}
 }
 return phrases.join(', ')+(headings.size?` in ${[...headings].join(', ')}`:'');
}
