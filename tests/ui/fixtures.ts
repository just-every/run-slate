/** Sample props belong only to this isolated test preview. */
import type { EditorBlock } from '../../src/core/features/editor/ui/types';
export const blocks: EditorBlock[] = [
 {id:'intro',type:'paragraph',text:[{text:'Our shared knowledge ',marks:['bold']},{text:'starts with a clear record.'}]},
 {id:'heading',type:'heading',level:2,text:[{text:'Making decisions together'}]},
 {id:'detail',type:'paragraph',text:[{text:'Keep the '},{text:'reasoning',marks:['italic'],commentAnchorId:'thread-1'},{text:' close to the outcome. Review the '},{text:'source',link:{href:'https://example.org/source'}},{text:' with '},{text:'',mention:{kind:'person',label:'Alex Morgan',id:'alex'}}]},
 {id:'callout',type:'callout',tone:'neutral',icon:'💡',text:[{text:'Write for the next person who needs to understand this work.'}]},
 {id:'list',type:'list',variant:'bulleted',items:[{id:'one',text:[{text:'Describe the question and the constraints.'}]},{id:'two',text:[{text:'Record the options considered.'}]}]},
 {id:'quote',type:'quote',text:[{text:'A useful document makes the next step clear.'}],attribution:'Team working agreement'},
 {id:'code',type:'code',language:'typescript',languages:['typescript','javascript'],code:'const decision = await recordDecision(input);'},
];
export const entries = [{id:'guide',title:'Team working agreement',icon:'📄',kind:'page' as const,containerName:'Team knowledge',metaLabel:'Opened today'},{id:'decisions',title:'Decision log',icon:'📒',kind:'database' as const,containerName:'Team knowledge',metaLabel:'Opened yesterday'}];
