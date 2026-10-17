import {z} from 'zod';
export const embeddedSearchSchema=z.object({
  query:z.string().max(1000),kind:z.string().optional(),containerId:z.string().optional(),
  contributorId:z.string().optional(),status:z.string().optional(),label:z.string().max(80).optional(),
  sort:z.enum(['relevance','updated','views']).optional(),updatedFrom:z.string().optional(),updatedTo:z.string().optional(),
  includeArchived:z.boolean().optional(),includeTrashed:z.boolean().optional(),
});
export const contentQueryDefinitionSchema=z.object({
  search:embeddedSearchSchema.optional(),searchName:z.string().max(120).optional(),label:z.string().max(80).optional(),
  container:z.string().optional(),ancestor:z.string().optional(),pageType:z.string().optional(),status:z.string().optional(),
  contributor:z.string().optional(),dateRange:z.string().optional(),orderBy:z.string().optional(),
  limit:z.number().int().min(1).max(100).optional(),
});
