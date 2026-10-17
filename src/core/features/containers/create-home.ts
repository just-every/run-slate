import type { FeatureContext } from '../../app/feature-context';
import { createUlid } from '../../shared/ulid';
import { prepareCreatePage } from '../pages/service';

/** Ordinary spaces get a real page; imports keep their source pages untouched. */
export function prepareSpaceHome(ctx: FeatureContext, container: {id:string;name:string;description?:string}, pageId: string, created = false) {
  return prepareCreatePage(ctx, {
    operationKey:pageId, id:pageId, containerId:container.id, title:`${container.name} home`, lifecycle:'live',
    blocks:container.description ? [{id:createUlid(),blockType:'paragraph',content:{text:[{text:container.description}]},treePosition:'a0'}] : [],
  }, createUlid(), created ? {containers:new Set([container.id]),pages:new Set()} : undefined);
}
