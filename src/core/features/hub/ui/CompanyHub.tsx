import { DateStamp } from "../../../app/ui/displayDate";
import { useState } from 'react';
import { useResource } from '../../../client/useResource';
import { RequestState } from '../../../app/ui/RequestState';
import type { HubPage, HubView } from '../types';
import { HubEditor } from './HubEditor';

const href=(id:string)=>`/app/pages/${encodeURIComponent(id)}`;
function PageIcon({page}:{page:HubPage}) {return <span className="hub-page-icon" aria-hidden="true">{page.icon&&!page.icon.startsWith('file:')?page.icon:'↗'}</span>;}

/** Shared first Home for new members; every row is already filtered by live server authority. */
export function CompanyHub() {
  const resource=useResource<HubView|null>('/api/hub');
  const [editing,setEditing]=useState(false);
  const hub=resource.data;
  const populated=!!(hub?.links.length||hub?.keyPages.length||hub?.announcements.length);
  return <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
    {hub && (populated || hub.canManage) ? <section className="company-hub" aria-label="Company hub">
      <header className="hub-welcome">
        <div>{populated?<><p className="hub-eyebrow">Company hub</p><h2>{hub.title}</h2>{hub.description?<p className="hub-description">{hub.description}</p>:null}</>:<span className="muted">Your company hub is empty.</span>}</div>
        {hub.canManage?<button type="button" className="secondary-button" onClick={()=>setEditing(true)}>Edit company hub</button>:null}
      </header>
      {populated?<div className="hub-columns">
        <div className="hub-resources">
          {hub.links.length?<section aria-labelledby="hub-quick-links"><h3 id="hub-quick-links">Quick links</h3>
            {hub.links.length?<ul className="hub-link-grid">{hub.links.map(page=><li key={page.id}><a href={href(page.id)}><PageIcon page={page}/><span><strong>{page.title||'Untitled'}</strong><small>{page.containerName}</small></span><span aria-hidden="true">→</span></a></li>)}</ul>:null}
          </section>:null}
          {hub.keyPages.length?<section aria-labelledby="hub-key-pages"><h3 id="hub-key-pages">Key pages</h3>
            {hub.keyPages.length?<ul className="hub-key-pages">{hub.keyPages.map(page=><li key={page.id}><a href={href(page.id)}><PageIcon page={page}/><span>{page.title||'Untitled'}</span><span className="hub-verified">✓ Verified</span><span aria-hidden="true">→</span></a></li>)}</ul>:null}
          </section>:null}
        </div>
        {hub.announcements.length?<section className="hub-announcements" aria-labelledby="hub-announcements"><h3 id="hub-announcements">Announcements</h3>
          {hub.announcements.length?<ul>{hub.announcements.map(post=><li key={post.pageId}><article>
            <h4><a href={href(post.pageId)}>{post.title||'Untitled'}</a></h4>
            <p className="muted"><DateStamp value={post.postedAt} /> · {post.authorName}</p>
            <a className="hub-post-space" href={`/app/containers/${encodeURIComponent(post.containerId)}`}>{post.containerName}</a>
          </article></li>)}</ul>:null}
        </section>:null}
      </div>:null}
      {editing?<HubEditor onClose={()=>setEditing(false)} onSaved={async()=>{await resource.reload();}}/>:null}
    </section> : null}
  </RequestState>;
}
