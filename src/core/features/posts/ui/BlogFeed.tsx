import {useState} from 'react';
import {useResource} from '../../../client/useResource';
import {mutate,operationKey,errorMessage} from '../../../client/transport';
import {RequestState} from '../../../app/ui/RequestState';
import {PostCover} from './PostCover';
import type {PostFeed} from '../types';

interface Props {containerId?:string;following?:boolean;heading?:string}
export function BlogFeed(props:Props) {
 return <Feed key={`${props.containerId??'workspace'}:${!!props.following}`} {...props}/>;
}

function Feed({containerId,following=false,heading='Blog'}:Props) {
 const [cursors,setCursors]=useState<Array<string|null>>([null]);
 const [page,setPage]=useState(0);
 const [creating,setCreating]=useState(false);
 const [title,setTitle]=useState('');
 const [pending,setPending]=useState(false);
 const [error,setError]=useState<unknown>();
 const params=new URLSearchParams({limit:'12'});
 if(containerId)params.set('containerId',containerId);
 if(following)params.set('following','true');
 if(cursors[page])params.set('cursor',cursors[page]!);
 const resource=useResource<PostFeed>(`/api/posts?${params}`);
 return <section aria-label={heading}>
  <div className="section-heading"><h2>{heading}</h2>{resource.data?.canCreate?<button type="button" onClick={()=>setCreating(true)}>Create post</button>:null}</div>
  {creating&&containerId?<form onSubmit={async event=>{
   event.preventDefault();setPending(true);setError(undefined);
   try {
    const result=await mutate<{value:{pageId:string}}>('/api/posts',{operationKey:operationKey(),containerId,title});
    window.location.assign(`/app/pages/${encodeURIComponent(result.value.pageId)}`);
   } catch(cause) {setError(cause);setPending(false);}
  }}>
   <label>Post title<input autoFocus required maxLength={1000} value={title} onChange={event=>setTitle(event.target.value)} disabled={pending}/></label>
   <p className="muted">Write and publish your post in the page editor.</p>
   <button type="submit" disabled={pending||!title.trim()}>{pending?'Creating…':'Write post'}</button>
   <button type="button" disabled={pending} onClick={()=>{setCreating(false);setError(undefined);}}>Cancel</button>
   {error?<p role="alert">{errorMessage(error)}</p>:null}
  </form>:null}
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
   <ul className="outcome-list">{resource.data?.items.map(post=><li key={post.id}><article>
    <PostCover post={post}/>
    <h3><a href={`/app/pages/${encodeURIComponent(post.id)}`}>{post.title||'Untitled post'}</a></h3>
    <p className="muted">{post.author.displayName} · <time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}</time></p>
    <a href={`/app/pages/${encodeURIComponent(post.id)}#comments`}>{post.commentCount} {post.commentCount===1?'comment':'comments'}</a>
   </article></li>)}</ul>
   {resource.data?.items.length===0?<p>{following?'No published posts from the pages and spaces you watch.':'No published posts yet.'}</p>:null}
   {page>0||resource.data?.nextCursor?<nav aria-label={`${heading} pagination`}>
    <button type="button" disabled={page===0||resource.loading} onClick={()=>setPage(value=>value-1)}>Newer posts</button>
    <button type="button" disabled={!resource.data?.nextCursor||resource.loading} onClick={()=>{
     if(!resource.data?.nextCursor)return;
     setCursors(previous=>[...previous.slice(0,page+1),resource.data!.nextCursor]);setPage(value=>value+1);
    }}>Older posts</button>
   </nav>:null}
  </RequestState>
 </section>;
}
