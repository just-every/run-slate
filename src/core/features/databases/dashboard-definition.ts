import { z } from 'zod';

const identity = z.string().min(1).max(160);
const date = z.string().date().optional();
export const dashboardFiltersSchema = z.object({ from: date, to: date, personId: identity.optional() }).strict()
  .refine(value => !value.from || !value.to || value.from <= value.to, 'The end date must follow the start date.');
export const dashboardTileSchema = z.object({
  id: identity, title: z.string().min(1).max(120), kind: z.enum(['chart', 'view']),
  databaseId: identity, viewId: identity, dateField: identity.optional(), personField: identity.optional(),
  group: identity.optional(), numeric: identity.optional(), calculation: z.enum(['count', 'sum', 'average', 'minimum', 'maximum']).default('count'),
}).strict().refine(tile => tile.kind !== 'chart' || !!tile.group, 'Choose a chart grouping field.');
export const dashboardDefinitionSchema = z.object({
  tiles: z.array(dashboardTileSchema).max(12), filters: dashboardFiltersSchema,
}).strict().refine(value => new Set(value.tiles.map(tile => tile.id)).size === value.tiles.length, 'Tile identities must be unique.');
export type DashboardDefinition = z.infer<typeof dashboardDefinitionSchema>;
export type DashboardTile = z.infer<typeof dashboardTileSchema>;
