import type {FeatureContext} from '../../../app/feature-context';
import type {BlockView,SyncedResolution} from '../../../shared/api/content';
import {currentSubject} from '../../sharing/current-access';
import {labelPageMentions} from '../../pages/mention-labels';
import {labelForReader} from '../../pages/mentions';
interface Retained {text_json:string;source_title:string;reader_ids_json:string;anonymous_allowed:number}
/** An opaque retained ID grants nothing: both the page/block binding and frozen audience apply. */
export async function staticResolution(db:D1Database,block:BlockView,reader?:FeatureContext):Promise<SyncedResolution>{
 const id=(block.content as {staticId?:string}).staticId;
 const row=await db.prepare('SELECT text_json,source_title,reader_ids_json,anonymous_allowed FROM synced_static_content WHERE id=? AND page_id=? AND block_id=?').bind(id??'',block.pageId,block.id).first<Retained>();
 if(!row)return {state:'access-needed'};
 if(reader){await currentSubject(reader);if(!JSON.parse(row.reader_ids_json).includes(reader.actor.id))return {state:'access-needed'};}
 else if(!row.anonymous_allowed)return {state:'access-needed'};
 const content={text:JSON.parse(row.text_json)};
 const shown=reader?await labelForReader(reader,content):labelPageMentions(content,()=>'Restricted page');
 return {state:'ready',text:shown.text,sourceTitle:row.source_title,canEdit:false,static:true};
}
