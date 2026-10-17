import { useEffect, useState } from 'react';
import { request, errorMessage } from '../../../../client/transport';

export function useMentionPreview(pageId: string, content: unknown, previous: unknown = []) {
  const signature=JSON.stringify({content,previous});
  const hasGroups=signature.includes('"kind":"group"');
  const [state,setState]=useState<{signature:string;count?:number;excludedCount?:number;error?:unknown}>();
  useEffect(()=>{
    if(!hasGroups)return;
    const controller=new AbortController();
    request<{count:number;excludedCount:number}>(`/api/pages/${encodeURIComponent(pageId)}/mention-preview`,{method:'POST',body:signature,signal:controller.signal})
      .then(result=>setState({signature,...result}),error=>{if(!controller.signal.aborted)setState({signature,error});});
    return ()=>controller.abort();
  },[pageId,signature,hasGroups]);
  return {hasGroups,loading:hasGroups&&state?.signature!==signature,...(state?.signature===signature?state:{})};
}
export function MentionPreview({preview}:{preview:ReturnType<typeof useMentionPreview>}) {
  if(!preview.hasGroups)return null;
  if(preview.loading)return <p role="status">Checking recipients…</p>;
  if(preview.error)return <p role="alert">{errorMessage(preview.error)}</p>;
  return <div><p role="status">{preview.count} {preview.count===1?'person':'people'} will be notified</p>
    {preview.excludedCount?<p className="muted">{preview.excludedCount} {preview.excludedCount===1?'person cannot':'people cannot'} read this page. Share this page to include them, or cancel the mention.</p>:null}</div>;
}
