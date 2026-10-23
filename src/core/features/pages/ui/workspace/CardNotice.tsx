import {cardLength} from '../../cards';
import type {EditorBlock} from '../../../editor/ui/types';
export function CardNotice({blocks}:{blocks:EditorBlock[]}){
 const length=cardLength(blocks);
 return <aside className="mb-3 rounded-card border border-line p-3 text-small" aria-label="Knowledge card">
 <p>Use a question as the title and a short answer below. Verification is required; verify the exact revision through the page’s status controls.</p>
 {length.overLimit?<p role="status">This card has {length.words} words, above the suggested {length.limit}. Consider a page for a longer explanation. Nothing is truncated.</p>:null}
 </aside>;
}
