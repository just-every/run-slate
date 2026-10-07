import {ApiError} from './transport';
import {editorBlocks,type DocumentView} from './content';

/** Page payloads must be usable before they can authorize a mounted editor. */
export function validatePageRead(value:DocumentView,pageId:string):void {
 if (!value || !value.page || value.page.id !== pageId ||
     typeof value.page.title !== 'string' || typeof value.page.revisionId !== 'string' ||
     typeof value.workingRevisionId !== 'string' || !Array.isArray(value.blocks) ||
     !value.permissions || typeof value.permissions.canEdit !== 'boolean' ||
     typeof value.permissions.canShare !== 'boolean' || !value.policyProfile ||
     !['view','comment','edit','full'].includes(value.permissions.level))
   throw new ApiError(200,'invalid_response','The server returned an invalid page. Current server state is unconfirmed.');
 for (const block of value.blocks) {
   if (!block || typeof block.id !== 'string' || block.pageId !== pageId ||
       typeof block.revisionId !== 'string' || typeof block.blockType !== 'string')
     throw new ApiError(200,'invalid_response','The server returned an invalid page block.');
 }
 editorBlocks(value.blocks);
}
