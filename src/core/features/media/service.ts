import {storeImportedSource,sanitizedImportBytes} from './import-source';
import { bodyReferencesFile, propertyReferencesFile, snapshotDisplayAllowed } from './references';
import { contentLimits } from '../editor/limits';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation,mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { requirePageLevel } from '../sharing/current-access';
import { pageRow, writable, pageGuard } from '../pages/repository';
import { readPage } from '../pages/service';
import { sanitizeSvg, fileDisposition } from './sanitize';
export interface MediaInput {
    operationKey: string;
    pageId: string;
    name: string;
    contentType: string;
    bytes: Uint8Array;
}
export async function prepareMedia(ctx: FeatureContext, input: MediaInput) {
    await requirePageLevel(ctx, input.pageId, 'edit');
    const page = await pageRow(ctx, input.pageId); writable(page);
    const media = await prepareImportedMedia(ctx, input);
    media.statements.unshift(pageGuard(ctx, page, page.revision_id));
    return media;
}
/** Import caller authorizes destination and includes the new page in the same transaction. */
export async function prepareImportedMedia(ctx: FeatureContext, input: MediaInput | (Omit<MediaInput,'bytes'> & {source:{sizeBytes:number;open:()=>ReadableStream<Uint8Array>}}),stage=true) {
    const size='bytes' in input?input.bytes.byteLength:input.source.sizeBytes;
    if (size > contentLimits.uploadBytesPerFile)
        throw new ApiProblem(413, 'FILE_TOO_LARGE', 'File exceeds the deployment upload limit.');
    if (!contentLimits.uploadTypes.includes(input.contentType))
        throw new ApiProblem(400, 'UNSUPPORTED_FILE_TYPE', 'This file type is not allowed.');
    if (!input.name || input.name.length > 255 || !/^[-\w.+]+\/[-\w.+]+$/.test(input.contentType))
        throw new ApiProblem(400, 'INVALID_FILE', 'Invalid filename or media type.');
    const used=await ctx.db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM files WHERE deleted_at IS NULL').first<{bytes:number}>();if((used?.bytes??0)+size>contentLimits.attachmentStorageBytesPerDeployment)throw new ApiProblem(429,'STORAGE_LIMIT','Attachment storage is full.');const id = createUlid(), storageKey = `pages/${ctx.actor.workspaceId}/${input.pageId}/${id}`;
    const source='bytes' in input?{sizeBytes:size,open:()=>new Blob([input.bytes as Uint8Array<ArrayBuffer>]).stream()}:input.source;
    const storedSize=input.contentType==='image/svg+xml'?(await sanitizedImportBytes(source)).length:size;
    if(stage)await storeImportedSource(ctx.files,storageKey,input.contentType,source,storedSize);
    return { id, storageKey, statements: [mutationGuard(ctx.db,'SELECT COALESCE(SUM(size_bytes),0)+?<=? FROM files WHERE deleted_at IS NULL',[storedSize,contentLimits.attachmentStorageBytesPerDeployment]),ctx.db.prepare('INSERT INTO files (id,workspace_id,page_id,storage_key,original_name,content_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, ctx.actor.workspaceId, input.pageId, storageKey, input.name, input.contentType, storedSize, ctx.now)], value: { id, pageId: input.pageId, name: input.name, contentType: input.contentType, sizeBytes: storedSize, url: `/api/media/${id}` } };
}
export async function uploadMedia(ctx: FeatureContext, input: MediaInput) {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(input.bytes))), b => b.toString(16).padStart(2, '0')).join('');
    let staged: string | undefined;
    try {
        return await commitOperation(ctx, { operationKey: input.operationKey, action: 'media.upload', request: { pageId: input.pageId, name: input.name, contentType: input.contentType, digest }, authorize: async () => { await requirePageLevel(ctx, input.pageId, 'edit'); }, prepare: async ({ revisionId }) => { const p = await prepareMedia(ctx, input); staged = p.storageKey; return { statements: p.statements, entity: { id: p.id, kind: 'file', revisionId }, value: p.value }; } });
    }
    catch (e) {
        if (staged)
            await ctx.files.delete(staged);
        throw e;
    }
}
/** Editors may open any file on a page; view and comment readers only the files the page they can see shows them. */
export async function fileVisibility(ctx: FeatureContext, pageId: string) {
    const access = await requirePageLevel(ctx, pageId, 'view');
    const visible = await readPage(ctx, pageId), limited = access.decision.level === 'view' || access.decision.level === 'comment';
    return { visible, allows: async (id: string) => !limited || visible.properties.coverFileId === id || visible.properties.icon === `file:${id}` || bodyReferencesFile(visible.blocks, id) || await propertyReferencesFile(ctx, pageId, visible.properties, id) };
}
export async function serveMedia(ctx: FeatureContext, id: string, display?: string) {
    const f = await ctx.db.prepare('SELECT * FROM files WHERE id=? AND workspace_id=? AND deleted_at IS NULL').bind(id, ctx.actor.workspaceId).first<Record<string, any>>();
    if (!f?.page_id)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    const files = await fileVisibility(ctx, f.page_id), visible = files.visible;
    if (!await files.allows(id))
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    const p = await pageRow(ctx, f.page_id);
    if (p.trashed_at)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    return mediaResponse(ctx.files, f, snapshotDisplayAllowed(visible.properties,visible.blocks,id,f.content_type,display));
}
export async function mediaResponse(files: R2Bucket, f: Record<string, any>, inline: boolean) {
    const object = await files.get(f.storage_key);
    if (!object)
        throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    const headers = { 'Content-Type': f.content_type, 'Content-Disposition': fileDisposition(f.original_name, inline), 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-store' };
    if (inline && f.content_type === 'image/svg+xml')
        return new Response(sanitizeSvg(await object.text()), { headers });
    return new Response(object.body, { headers });
}
