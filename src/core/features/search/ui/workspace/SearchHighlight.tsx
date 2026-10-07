import {useEffect, useState} from 'react';
import {useLocation} from '@tanstack/react-router';

export function HighlightedText({text, terms}:{text:string;terms:string[]}) {
  const pattern=terms.filter(Boolean).map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  if(!pattern)return <>{text}</>;
  return <>{text.split(new RegExp(`(${pattern})`,'gi')).map((part,index)=>terms.some(term=>term.toLocaleLowerCase()===part.toLocaleLowerCase())?<mark key={index}>{part}</mark>:part)}</>;
}

export function highlightTerms(value:unknown):string[]{
  if(typeof value==='string'&&value.startsWith('[')){try{return highlightTerms(JSON.parse(value));}catch{return [];}}
  const values=Array.isArray(value)?value:[value];
  return [...new Set(values.filter((item):item is string=>typeof item==='string'&&item.trim().length>0).map(item=>item.trim()))];
}

/** CSS ranges highlight matches without changing the editor's stored rich text. */
export function RoutedSearchHighlight() {
  const location=useLocation();
  const [dismissed,setDismissed]=useState(false);
  const params=new URLSearchParams(location.searchStr);
  const terms=highlightTerms((location.search as Record<string,unknown>).highlight??params.getAll('highlight').flatMap(highlightTerms));
  const [matches,setMatches]=useState<number|null>(null);
  const signature=JSON.stringify(terms);
  useEffect(()=>{setDismissed(false);setMatches(null);},[signature,location.pathname]);
  useEffect(()=>{
    if(dismissed||!terms.length)return;
    const root=document.getElementById('workspace-content');
    const api=globalThis as typeof globalThis & {Highlight?:new(...ranges:Range[])=>unknown};
    const registry=(CSS as typeof CSS & {highlights?:Map<string,unknown>}).highlights;
    if(!root||!api.Highlight||!registry)return;
    let timer:ReturnType<typeof setTimeout>;
    const refresh=()=>{
      const ranges:Range[]=[];
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;
        if(node.parentElement?.closest('button,script,style,[data-search-context]'))continue;
        const text=node.textContent?.toLocaleLowerCase()??'';
        for(const term of terms){let start=0;const find=term.toLocaleLowerCase();while((start=text.indexOf(find,start))!==-1){const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+term.length);ranges.push(range);start+=term.length;}}
      }
      registry.set('search-match',new api.Highlight!(...ranges));setMatches(ranges.length);
    };
    refresh();
    const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(refresh,50);});
    observer.observe(root,{childList:true,subtree:true,characterData:true});
    return()=>{clearTimeout(timer);observer.disconnect();registry.delete('search-match');};
  },[signature,dismissed,location.pathname]);
  return !dismissed&&terms.length?<p data-search-context className="search-context" role="status">{matches===null?'Finding matches':matches?'Matches highlighted':'No text matches on this screen'} for “{terms.join(' · ')}”. <button onClick={()=>setDismissed(true)}>Clear highlights</button></p>:null;
}
