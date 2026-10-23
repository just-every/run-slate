import {HighlightedText} from './SearchHighlight';
import {formatSearchSnippet} from './formatSearchSnippet';
import {TrustBadge} from '../TrustBadge';
import type {PageTrust} from '../../trust-types';

export interface SearchResultView {
  pageKind?:string;id:string;title:string;snippet:string;kind:string;href:string;highlights:string[];updatedAt:string;
  trust?:PageTrust;
  similarPages?:{pageKind?:string;id:string;title:string;href:string;trust?:PageTrust}[];
}
const kinds:Record<string,string>={page:'Page',record:'Record',container:'Space',template:'Template','comment-thread':'Comment'};
function highlightedHref(href:string,terms:string[]) {
  return href+(href.includes('?')?'&':'?')+new URLSearchParams(terms.map(term=>['highlight',term]));
}
export function SearchResults({items}:{items:SearchResultView[]}) {
  return <ul className="search-results">{items.map(result=><li key={`${result.kind}:${result.id}`} data-card={result.pageKind==='card'||undefined}>
    <a href={highlightedHref(result.href,result.highlights)}>
      <span className="eyebrow">{result.pageKind==='card'?'Knowledge card':kinds[result.kind]??result.kind}</span>
      <h2>{result.kind==='comment-thread'?'Comment on ':''}<HighlightedText text={result.title} terms={result.highlights}/></h2>
      <p className={result.pageKind==='card'?'truncate':undefined}><HighlightedText text={formatSearchSnippet(result.snippet)} terms={result.highlights}/></p>
    </a>
    {result.trust?<TrustBadge trust={result.trust}/>:<time className="muted" dateTime={result.updatedAt}>Updated {new Date(result.updatedAt).toLocaleDateString()}</time>}
    {result.similarPages?.length?<details className="similar-pages">
      <summary>{result.similarPages.length} similar {result.similarPages.length===1?'page':'pages'}</summary>
      <ul>{result.similarPages.map(item=><li key={item.id}>
        <a href={highlightedHref(item.href,result.highlights)}>{item.title}</a>
        {item.trust?<TrustBadge trust={item.trust}/>:null}
      </li>)}</ul>
    </details>:null}
  </li>)}</ul>;
}
