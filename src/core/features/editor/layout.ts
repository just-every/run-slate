import type {BlockView} from '../../shared/api/content';
/** Find a layout ancestor while retaining ordinary descendants as normal blocks. */
function layoutAncestor(block:BlockView,byId:Map<string,BlockView>){
 let parent=block.parentBlockId;const seen=new Set<string>();
 while(parent&&!seen.has(parent)){seen.add(parent);const p=byId.get(parent);if(!p)return undefined;if(p.blockType==='columns'||p.blockType==='column')return p;parent=p.parentBlockId;}
 return undefined;
}
export function layoutRoots(blocks:BlockView[]){const byId=new Map(blocks.map(block=>[block.id,block]));return blocks.filter(block=>!layoutAncestor(block,byId));}
export function columnBlocks(blocks:BlockView[],id:string){const byId=new Map(blocks.map(block=>[block.id,block]));return blocks.filter(block=>layoutAncestor(block,byId)?.id===id);}
/** Order structural layout children without changing ordinary block nesting. */
export function layoutOrder(blocks:BlockView[]):BlockView[]{
 const byId=new Map(blocks.map(block=>[block.id,block]));

 const children=(id:string):BlockView[]=>blocks.filter(block=>block.parentBlockId===id).flatMap(block=>[block,...children(block.id)]);
 return blocks.filter(block=>!layoutAncestor(block,byId)).flatMap(block=>block.blockType==='columns'?[block,...children(block.id)]:[block]);
}
export const layoutStyles='.slate-columns{display:grid;grid-template-columns:repeat(var(--column-count),minmax(0,1fr));gap:16px}.slate-column{min-width:0;overflow-wrap:anywhere}@media(max-width:640px){.slate-columns{grid-template-columns:minmax(0,1fr)}}';
