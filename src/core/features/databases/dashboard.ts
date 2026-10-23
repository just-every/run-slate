import type { FeatureContext } from '../../app/feature-context';
import { ApiProblem } from '../../app/problems';
import { requirePageLevel } from '../sharing/current-access';
import { dashboardDefinitionSchema } from './dashboard-definition';
import { database, fields } from './repository';
import { chart, queryView } from './views';
import type { Filter } from './values';

/** Every tile uses the same reader-scoped evaluation as a database view. */
export async function queryDashboard(ctx: FeatureContext, pageId: string, input: unknown) {
  await requirePageLevel(ctx, pageId, 'view');
  const parsed = dashboardDefinitionSchema.safeParse(input);
  if (!parsed.success) throw new ApiProblem(400, 'INVALID_DASHBOARD', parsed.error.issues[0].message);
  const { tiles, filters } = parsed.data;
  const results: {id:string;state:'ready'|'access-needed';series?:{label:unknown;value:number|null}[];records?:{pageId:string;title:string}[]}[] = [];
  for (const tile of tiles) {
    try {
      // Authenticate the database before exposing its schema or validating fields.
      await database(ctx, tile.databaseId);
      const fs = await fields(ctx, tile.databaseId), applied: Filter[] = [];
      if (filters.from || filters.to) {
        if (!fs.some(field => field.id === tile.dateField && field.type === 'date'))
          throw new ApiProblem(400, 'DASHBOARD_FIELD', 'Choose a date field for every tile before filtering.');
        applied.push({ field: tile.dateField, op: 'not-empty' });
        if (filters.from) applied.push({ field: tile.dateField, op: 'gte', value: filters.from });
        if (filters.to) applied.push({ field: tile.dateField, op: 'lte', value: `${filters.to}T23:59:59.999Z` });
      }
      if (filters.personId) {
        if (!fs.some(field => field.id === tile.personField && field.type === 'person'))
          throw new ApiProblem(400, 'DASHBOARD_FIELD', 'Choose a person field for every tile before filtering.');
        applied.push({ field: tile.personField, op: 'contains', value: filters.personId });
      }
      const embedded = { pageId, filters: applied };
      const result = tile.kind === 'chart'
        ? await chart(ctx, tile.databaseId, tile.viewId, tile.group!, tile.numeric, tile.calculation, embedded)
        : await queryView(ctx, tile.databaseId, tile.viewId, embedded);
      results.push({ id: tile.id, state: 'ready' as const, ...(tile.kind === 'chart'
        ? { series: (result as Awaited<ReturnType<typeof chart>>).series }
        : { records: (result as Awaited<ReturnType<typeof queryView>>).records.map(record => ({ pageId: record.pageId, title: record.title })) }) });
    } catch (error) {
      if (error instanceof ApiProblem && error.status === 404) results.push({ id: tile.id, state: 'access-needed' as const });
      else throw error;
    }
  }
  return { tiles: results };
}
export type DashboardResult = Awaited<ReturnType<typeof queryDashboard>>;
