import type { FeatureContext } from '../../app/feature-context';
import type { PageProperties } from '../pages/types';
import type { BlockView } from '../../shared/api/content';
export function bodyReferencesFile(blocks: BlockView[], id: string) {
    return blocks.some(b => b.blockType === 'media' && referencesSource((b.content as any).source, id));
}
export function referencesSource(source: {fileId?:string;url?:string} | null | undefined, id:string) {
    return source?.fileId === id || source?.url === `/api/media/${id}`;
}
/** Only typed file properties authorize a file; arbitrary text containing an ID does not. */
export async function propertyReferencesFile(ctx: FeatureContext, pageId: string, properties: PageProperties, id: string) {
    if (!properties.databaseFields) return false;
    const record = await ctx.db.prepare('SELECT database_id FROM database_records WHERE page_id=?').bind(pageId).first<{database_id:string}>();
    let keys: string[];
    if (record) keys = (await ctx.db.prepare("SELECT id FROM database_fields WHERE database_id=? AND field_type='file'").bind(record.database_id).all<{id:string}>()).results.map(f=>f.id);
    else {
        const retained = await ctx.db.prepare('SELECT fields_json FROM structured_page_fields WHERE page_id=?').bind(pageId).first<{fields_json:string}>();
        keys = retained ? (JSON.parse(retained.fields_json) as {id:string;type:string}[]).filter(f=>f.type==='file').map(f=>f.id) : [];
    }
    return keys.some(key => { const value=properties.databaseFields![key]; return Array.isArray(value) && value.includes(id); });
}
export function snapshotDisplayAllowed(properties: PageProperties, blocks: BlockView[], id: string, contentType: string, display?: string) {
    if (!display || !['image/','video/','audio/'].some(type=>contentType.startsWith(type))) return false;
    if (display === 'icon') return properties.icon === `file:${id}`;
    if (display === 'cover') return properties.coverFileId === id;
    return blocks.some(b=>b.id===display && b.blockType==='media' && (b.content as any).kind!=='file' && referencesSource((b.content as any).source,id));
}
