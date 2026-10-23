import type {BlockView} from '../../shared/api/content';
/** Order structural layout children without changing ordinary block nesting. */
export function layoutOrder(blocks:BlockView[]):BlockView[]{
 const byId=new Map(blocks.map(block=>[block.id,block]));
 const insideLayout=(block:BlockView)=>{let parent=block.parentBlockId;const seen=new Set<string>();while(parent&&!seen.has(parent)){seen.add(parent);const p=byId.get(parent);if(!p)return false;if(p.blockType==='columns'||p.blockType==='column')return true;parent=p.parentBlockId;}return false;};
 const children=(id:string):BlockView[]=>blocks.filter(block=>block.parentBlockId===id).flatMap(block=>[block,...children(block.id)]);
 return blocks.filter(block=>!insideLayout(block)).flatMap(block=>block.blockType==='columns'?[block,...children(block.id)]:[block]);
}
export const layoutStyles='.slate-columns{display:grid;grid-template-columns:repeat(var(--column-count),minmax(0,1fr));gap:16px}.slate-column{min-width:0;overflow-wrap:anywhere}@media(max-width:640px){.slate-columns{grid-template-columns:minmax(0,1fr)}}';
