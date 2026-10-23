import {plainContent} from '../editor/validation';
import type {BlockView} from '../../shared/api/content';
import type {EditorBlock} from '../editor/ui/types';
import {contentLimits} from '../editor/limits';
/** A soft authoring limit: callers always retain the complete body. */
export function cardLength(blocks:readonly (BlockView|EditorBlock)[]){
 const words=blocks.map(block=>plainContent('blockType' in block?block.content:block)).join(' ').trim().split(/\s+/u).filter(Boolean).length;
 return {words,limit:contentLimits.cardSoftWordLimit,overLimit:words>contentLimits.cardSoftWordLimit};
}
