import type {CSSProperties} from 'react';
import type {EditorBlock} from './types';
import {BlockView} from './blocks/BlockView';
import './columns.css';

/** Read-only snapshots use the same column ownership as the editor. */
export function ReadOnlyBlocks({blocks}:{blocks:EditorBlock[]}){
 const group=(parentId?:string):React.ReactNode=>blocks.filter(block=>block.layoutParentId===parentId).map(block=>
  block.type==='columns'?<section key={block.id} className="slate-columns" style={{'--column-count':block.count} as CSSProperties}>{blocks.filter(child=>child.type==='column'&&child.layoutParentId===block.id).map(column=><div key={column.id} className="slate-column">{group(column.id)}</div>)}</section>:
  block.type==='column'?null:<div key={block.id} style={{marginInlineStart:`${(block.indent??0)*20}px`}}><BlockView block={block} canEdit={false} onChange={()=>{}}/></div>);
 return <>{group()}</>;
}
