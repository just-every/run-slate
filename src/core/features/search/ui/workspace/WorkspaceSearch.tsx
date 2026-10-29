import {SearchResults,type SearchResultView} from "./SearchResults";
import {TopBar} from "../../../../app/ui/header/TopBar";
import {PageTitle} from "../../../../app/ui/header/PageTitle";
import {RetainedSearchAnswer} from "./RetainedSearchAnswer";
import {useCreatePage} from "../../../../app/ui/useCreatePage";
import {useInferredSpace} from "../../../../app/ui/useInferredSpace";
import {DEFAULT_PAGE_TITLE,type SpaceChoice} from "../../../../app/ui/pageDestination";
import {SearchRefinements,SearchFilterSummary,useSearchOptions,emptyRefinements} from "./SearchRefinements";
import {SavedSearches} from "./SavedSearches";
import {SaveSearchDialog} from "./SaveSearchDialog";
import { useEffect, useRef, useState } from "react";
import {searchLocation,submittedSearch} from "./searchLocation";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import {
  errorMessage,
} from "../../../../client/transport";
interface Results {
  items: SearchResultView[];
  total: number;
  nextCursor?: string;
  facets: { kind: Record<string, number> };
}
export function WorkspaceSearch() {
  const [initial]=useState(()=>searchLocation(""));
  const [ready,setReady]=useState(false);
  const queryInput=useRef<HTMLInputElement>(null);
  const [refinements,setRefinements]=useState(initial.refinements);
  const searchOptions=useSearchOptions();
  const [savedVersion,setSavedVersion]=useState(0);
  const [saving,setSaving]=useState(false);
  const extra=new URLSearchParams(Object.entries(refinements).filter(([,value])=>value!==""&&value!==false).map(([key,value])=>[key,String(value)])).toString();
  const creation=useCreatePage();
  const spaces=useResource<{items:SpaceChoice[]}>("/api/containers");
  const destination=useInferredSpace(refinements.containerId||null,spaces);
  const [query, setQuery] = useState(initial.query);
  const [kind, setKind] = useState(initial.kind);
  const [archived, setArchived] = useState(initial.archived);
  const [cursor, setCursor] = useState<string>();
  const [submitted, setSubmitted] = useState<string|undefined>(initial.submitted);
  useEffect(()=>{
    const value=searchLocation(window.location.search);
    setQuery(value.query);setSubmitted(value.submitted);setKind(value.kind);
    setArchived(value.archived);setRefinements(value.refinements);
    // SSR controls must not accept edits before their handlers and URL state exist.
    setReady(true);
  },[]);
  useEffect(()=>{if(ready)queryInput.current?.focus();},[ready]);
  useEffect(()=>{if(submitted===undefined)return;const url=new URL(window.location.href);url.search=submittedSearch(submitted,kind,archived,refinements);window.history.replaceState(window.history.state,"",url);},[submitted,kind,archived,refinements]);
  const [error, setError] = useState<unknown>();
  const resource = useResource<Results>(
    submitted === undefined
      ? null
      : `/api/search?q=${encodeURIComponent(submitted)}&kind=${encodeURIComponent(kind)}&includeArchived=${archived}&${extra}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  const filterDescription = [kind,archived?"Including archive":"",...Object.entries(refinements).filter(([,value])=>value!==""&&value!==false).map(([key,value])=>`${key}: ${value}`)].filter(Boolean).join(" · ") || "None";
  return (
    <>
      <TopBar trail={[{ label: "Search" }]} />
      <section className="main search-workspace">
        <PageTitle>Search your workspace</PageTitle>
        <form
          className="search-form"
          aria-busy={!ready}
          onSubmit={(event) => {
            event.preventDefault();
            setCursor(undefined);
            setSubmitted(query);
          }}
        >
          <label className="sr-only" htmlFor="workspace-query">
            Search your workspace
          </label>
          <div className="search-input-wrap"><input
            ref={queryInput}
            disabled={!ready}
            id="workspace-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, records and conversations…"
          />
          {query ? <button type="button" className="search-clear" aria-label="Clear search" data-tooltip="Clear search" data-tooltip-align="end" onClick={() => {setQuery("");queryInput.current?.focus();}}>×</button> : null}</div>
          <button className="primary-button" type="submit" disabled={!ready}>
            Search
          </button>
        </form>
        <details className="search-language-help"><summary>Search tips</summary><p>Use a quoted phrase or combine terms with AND, OR and a minus sign to exclude a term.</p><p><code>label:launch AND verified:current</code></p><p>Fields: title, label, in (space), by (contributor), owner, status, verified, before, after and type. Use a colon after the field, such as <code>title:"release checklist"</code>.</p></details>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {resource.data ? (
            <>
              {resource.data.total>0 && submitted ? <RetainedSearchAnswer query={submitted}/>:null}
              <p className="muted">
                {resource.data.total} result
                {resource.data.total === 1 ? "" : "s"} within your access.
              </p>
              {resource.data.items.length>0?<SearchFilterSummary kind={kind} archived={archived} value={refinements} options={searchOptions}/>:null}
              {resource.data.items.length === 0 ? (
                <section className="search-empty"><p>No matches for “{submitted}”.</p><p>Filters: {filterDescription}</p>{kind || archived || Object.values(refinements).some(value => value !== "" && value !== false) ? <button className="secondary-button" onClick={()=>{setKind("");setArchived(false);setRefinements(emptyRefinements);setCursor(undefined);}}>Clear all filters</button> : null}<button className="primary-button" aria-busy={creation.pending||undefined} onClick={()=>{const title=submitted||DEFAULT_PAGE_TITLE;void creation.create(async()=>({containerId:(await destination.resolve())?.id??null,title}));}}>Create a page titled “{submitted}”</button></section>
              ) : (
                <SearchResults items={resource.data.items}/>
              )}
              {resource.data.nextCursor ? (
                <button
                  className="search-next-results"
                  type="button"
                  onClick={() => setCursor(resource.data!.nextCursor)}
                >
                  Next results →
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSaving(true)}
              >
                Save this search
              </button>
            </>
          ) : (
            <p className="muted">
              Search only includes content you can currently read.
            </p>
          )}
        </RequestState>
        <details className="search-options"><summary>Search options & saved searches</summary>
        <div className="search-filters">
          <label><span>Look in</span>
            <select
              disabled={!ready}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setCursor(undefined);
              }}
            >
              <option value="">Everything you can read</option>
              {[
                "page",
                "record",
                "container",
                "template",
                "comment-thread",
              ].map((value) => (
                <option key={value} value={value}>{({page:"Pages",record:"Records",container:"Spaces",template:"Templates","comment-thread":"Comments"} as Record<string,string>)[value]}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              disabled={!ready}
              checked={archived}
              onChange={(event) => {
                setArchived(event.target.checked);
                setCursor(undefined);
              }}
            />
            Include archive
          </label>
        </div>
        <SearchRefinements disabled={!ready} value={refinements} options={searchOptions} activeCount={Number(Boolean(kind))+Number(archived)} onChange={value=>{setRefinements(value);setCursor(undefined);}} />
        <SavedSearches version={savedVersion} onChoose={value=>{setQuery(value.query??"");setSubmitted(value.query??"");setKind(value.kind??"");setArchived(value.includeArchived??false);setRefinements({...emptyRefinements,...value});setCursor(undefined);}}/>
        </details>
        {saving?<SaveSearchDialog query={{...Object.fromEntries(Object.entries(refinements).filter(([,value])=>value!=="")),query:submitted??"",...(kind?{kind}:{}),includeArchived:archived}} onClose={()=>setSaving(false)} onSaved={()=>setSavedVersion(value=>value+1)}/>:null}
        {creation.prompt}
        {creation.error ? <p role="alert">{errorMessage(creation.error)}</p> : null}
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </section>
    </>
  );
}
