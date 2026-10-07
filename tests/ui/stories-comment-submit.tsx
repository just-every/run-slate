import { useRef } from 'react';
import type { Story } from './stories';
import { CommentComposer } from '../../src/core/features/comments/ui/CommentComposer';
function SubmissionStory() {
 const attempts=useRef(0);
 return <main className="mx-auto max-w-reading p-6"><h1 className="mb-6 text-h1 text-ink">Comment submission</h1><CommentComposer viewerAccess="comment" placeholder="Write a comment" onMention={()=>{}} onAttach={()=>{}} onSubmit={async()=>{attempts.current++; await new Promise(resolve=>setTimeout(resolve,100));if(attempts.current===1)throw new Error('Connection lost');}}/></main>;
}
export const commentSubmitStories:Story[]=[{id:'comment-submit-retry',title:'Comment · failed submission and explicit retry',clauses:['SAVE-002','COMM-001'],render:()=> <SubmissionStory/>}];
