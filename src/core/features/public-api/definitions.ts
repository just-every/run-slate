import { z } from 'zod';
import limits from '../../../../seed.json';
import { createPageSchema, updatePageSchema, updateBlockSchema, replaceBlocksSchema } from '../pages/input';

export const taskPatch = updateBlockSchema;
const object = { type: 'object' }, string = { type: 'string' };
const item = { type: 'object', required: ['id'], properties: { id: string } };
const list = { type: 'object', required: ['items', 'nextCursor'], properties: { items: { type: 'array', items: item }, nextCursor: { type: ['string', 'null'] } } };
const mutation = { type: 'object', required: ['value', 'receipt'], properties: { value: object, receipt: { type: 'object', required: ['operationKey', 'committedAt'], properties: { operationKey: string, committedAt: string } } } };
const document = { type: 'object', required: ['page', 'blocks', 'permissions'], properties: { page: item, blocks: { type: 'array', items: item }, permissions: object } };
export const operations = [
  { id: 'listPages', method: 'get', path: '/pages', summary: 'List pages in a space', response: list },
  { id: 'createPage', method: 'post', path: '/pages', summary: 'Create a page', input: createPageSchema, response: mutation },
  { id: 'getPage', method: 'get', path: '/pages/{pageId}', summary: 'Read a page', response: document },
  { id: 'updatePage', method: 'patch', path: '/pages/{pageId}', summary: 'Update page properties', input: updatePageSchema, response: mutation },
  { id: 'listBlocks', method: 'get', path: '/pages/{pageId}/blocks', summary: 'Read page blocks', response: list },
  { id: 'replaceBlocks', method: 'put', path: '/pages/{pageId}/blocks', summary: 'Replace page blocks', input: replaceBlocksSchema, response: mutation },
  { id: 'updateBlock', method: 'patch', path: '/pages/{pageId}/blocks/{blockId}', summary: 'Update a block', input: updateBlockSchema, response: mutation },
  { id: 'listTasks', method: 'get', path: '/pages/{pageId}/tasks', summary: 'Read tasks on a page', response: list },
  { id: 'updateTask', method: 'patch', path: '/pages/{pageId}/tasks/{blockId}', summary: 'Assign, date, reassign or complete a task', input: taskPatch, response: mutation },
] as const;
export type OperationId = typeof operations[number]['id'];
export const errorSchema = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message', 'requestId'], additionalProperties: false, properties: { code: string, message: string, requestId: string } } } };

export function openApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const parameters: unknown[] = [...operation.path.matchAll(/\{(\w+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: string }));
    if (operation.method === 'get' && operation.id !== 'getPage') parameters.push(...['cursor', 'limit', ...(operation.id === 'listPages' ? ['containerId'] : [])].map(name => ({ name, in: 'query', required: name === 'containerId', schema: name === 'limit' ? { type: 'integer', minimum: 1, maximum: limits.limits.publicApiPageSize } : string })));
    (paths[operation.path] ??= {})[operation.method] = { operationId: operation.id, summary: operation.summary, security: [{ bearerToken: [] }], parameters,
      ...('input' in operation ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(operation.input) } } } } : {}),
      responses: { '200': { description: 'Success', content: { 'application/json': { schema: operation.response } } }, ...Object.fromEntries(['400', '401', '403', '404', '409', '429', '500'].map(status => [status, { description: 'Request refused', content: { 'application/json': { schema: errorSchema } }, ...(status === '429' ? { headers: { 'Retry-After': { schema: string, description: 'Seconds until the next request window.' } } } : {}) }])) } };
  }
  return { openapi: '3.1.0', info: { title: 'Slate API', version: '1.0.0', description: `Personal tokens act as their member with container read or write scopes. Cookies are ignored. Supply an operationKey on every write; retries return the first result for 24 hours. Lists use opaque cursors and accept up to ${limits.limits.publicApiPageSize} items. Each token permits ${limits.limits.publicApiRequestsPerTokenPerMinute} requests per minute. Token administration, export, publication and erasure use signed-in settings. Other resources and application authorization are not available here.` }, servers: [{ url: '/api/v1' }], paths, components: { securitySchemes: { bearerToken: { type: 'http', scheme: 'bearer' } } } };
}
