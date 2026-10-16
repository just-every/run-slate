import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import type { MemberSubject } from '../../shared/knowledge/model';
import { resolveCurrentAccessMany } from '../sharing/bulk-access';

/** Titles follow currentPageTitle's publication projection, only after authorization. */
export async function navigationPageReads(ctx:FeatureContext, ids:string[], subject:MemberSubject) {
    const targets = [...new Set(ids)];
    const [accesses, rows] = await Promise.all([
        resolveCurrentAccessMany(ctx, targets, {subject}),
        ctx.db.prepare('SELECT p.id,p.title,p.working_revision_id,p.published_revision_id,r.properties_json FROM pages p LEFT JOIN page_revisions r ON r.id=p.published_revision_id AND r.deleted_at IS NULL WHERE p.id IN (SELECT value FROM json_each(?))')
            .bind(JSON.stringify(targets)).all<{id:string;title:string;working_revision_id:string;published_revision_id:string|null;properties_json:string|null}>()
    ]);
    const pages = new Map(rows.results.map(row => [row.id,row]));
    const canRead = (id:string) => accesses.get(id)?.decision.allowed === true;
    const title = (id:string):string => {
        const row = pages.get(id), access = accesses.get(id);
        if (!row || !access?.decision.allowed) throw new ApiProblem(404,'NOT_FOUND','Not found.');
        if (!['edit','full'].includes(access.decision.level!) && row.published_revision_id && row.published_revision_id !== row.working_revision_id) {
            if (!row.properties_json) throw new ApiProblem(404,'NOT_FOUND','Not found.');
            return (JSON.parse(row.properties_json) as {title:string}).title;
        }
        return row.title;
    };
    return {canRead,title};
}
