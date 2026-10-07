import {HighlightedText} from "./SearchHighlight";
import {RetainedSearchAnswer} from "./RetainedSearchAnswer";
import {CreatePageDialog} from "../../../../app/ui/CreatePageDialog";
import {SearchRefinements,emptyRefinements} from "./SearchRefinements";
import {SavedSearches} from "./SavedSearches";
import { useEffect, useRef, useState } from "react";
import {searchLocation,submittedSearch} from "./searchLocation";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
interface Result {
  id: string;
  title: string;
  snippet: string;
  kind: string;
  href: string;
  highlights:string[];
  updatedAt: string;
}
interface Results {
  items: Result[];
  total: number;
  nextCursor?: string;
  facets: { kind: Record<string, number> };
}
export function WorkspaceSearch() {
  const [initial]=useState(()=>searchLocation(""));
  const [ready,setReady]=useState(false);
  const queryInput=useRef<HTMLInputElement>(null);
  const [refinements,setRefinements]=useState(initial.refinements);
  const [savedVersion,setSavedVersion]=useState(0);
  const extra=new URLSearchParams(Object.entries(refinements).filter(([,value])=>value!==""&&value!==false).map(([key,value])=>[key,String(value)])).toString();
  const [create,setCreate]=useState(false);
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
  return (
    <>
      <header className="topbar">
        <span>Search</span>
      </header>
      <section className="main">
        <p className="eyebrow">FIND SOMETHING WORTH KEEPING</p>
        <h1 className="title">A thought away.</h1>
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
          <input
            ref={queryInput}
            disabled={!ready}
            id="workspace-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, records and conversations…"
          />
          <button className="primary-button" type="submit" disabled={!ready}>
            Search
          </button>
        </form>
        <div className="search-filters">
          <label>
            Look in
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
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
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
        <SearchRefinements disabled={!ready} value={refinements} activeCount={Number(Boolean(kind))+Number(archived)} onChange={value=>{setRefinements(value);setCursor(undefined);}} />
        <SavedSearches version={savedVersion} onChoose={value=>{setQuery(value.query??"");setSubmitted(value.query??"");setKind(value.kind??"");setArchived(value.includeArchived??false);setRefinements({...emptyRefinements,...value});setCursor(undefined);}}/>
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
              {resource.data.items.length === 0 ? (
                <section><p>No matches for “{submitted}”.</p><p>Filters: {[kind,archived?"Including archive":"",...Object.entries(refinements).filter(([,value])=>value!==""&&value!==false).map(([key,value])=>`${key}: ${value}`)].filter(Boolean).join(" · ") || "None"}</p><button onClick={()=>{setKind("");setArchived(false);setRefinements(emptyRefinements);setCursor(undefined);}}>Clear all filters</button><button onClick={()=>setCreate(true)}>Create a page titled “{submitted}”</button></section>
              ) : (
                <ul className="search-results">
                  {resource.data.items.map((result) => (
                    <li key={`${result.kind}:${result.id}`}>
                      <a href={`${result.href}${result.href.includes("?")?"&":"?"}${new URLSearchParams(result.highlights.map(term=>["highlight",term])).toString()}`}>
                        <span className="eyebrow">
                          {result.kind.replaceAll("-", " ")}
                        </span>
                        <h2><HighlightedText text={result.title} terms={result.highlights}/></h2>
                        <p><HighlightedText text={result.snippet} terms={result.highlights}/></p>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {resource.data.nextCursor ? (
                <button
                  type="button"
                  onClick={() => setCursor(resource.data!.nextCursor)}
                >
                  Next results →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void mutate("/api/search/saved", {
                    operationKey: operationKey(),
                    name: submitted || "All accessible content",
                    query: {
                      ...Object.fromEntries(Object.entries(refinements).filter(([,value])=>value!=="")),
                      query: submitted,
                      ...(kind ? { kind } : {}),
                      includeArchived: archived,
                    },
                  }).then(()=>setSavedVersion(value=>value+1)).catch(setError);
                }}
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
        {create ? <CreatePageDialog defaultTitle={submitted} onClose={()=>setCreate(false)} onCreated={id=>window.location.assign(`/app/pages/${id}`)}/>:null}
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </section>
    </>
  );
}
