import { useState } from 'react';
import { useResource } from '../../../client/useResource';
import { mutate, operationKey } from '../../../client/transport';
import { ActionDialog } from '../../../app/ui/ActionDialog';
import { RequestState } from '../../../app/ui/RequestState';
import { galleries } from '../../pages/ui/workspace/PageAppearance';
import { PostList, type PostItem } from './PostList';

/** The space's blog: its posts, newest first, and a composer for members who can create pages here. */
export function ContainerBlog({ containerId }: { containerId: string }) {
 const [cursors, setCursors] = useState<string[]>([]), cursor = cursors.at(-1);
 const resource = useResource<{ items: PostItem[]; nextCursor?: string; canPost: boolean }>(`/api/blog?containerId=${encodeURIComponent(containerId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
 const [writing, setWriting] = useState(false);
 return <section aria-label="Blog" className="space-blog">
  <h4>Blog</h4>
  <p className="muted">Dated posts and announcements. People who watch this space are told of each new post.</p>
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
   {resource.data?.canPost ? <button type="button" onClick={() => setWriting(true)}>Write a post</button> : null}
   {resource.data?.items.length ? <PostList items={resource.data.items}/> : <p>No posts in this space yet.</p>}
   <div className="editor-actions">
    {cursors.length ? <button type="button" className="secondary-button" onClick={() => setCursors([])}>Newest posts</button> : null}
    {resource.data?.nextCursor ? <button type="button" className="secondary-button" onClick={() => setCursors([...cursors, resource.data!.nextCursor!])}>Older posts</button> : null}
   </div>
  </RequestState>
  {writing ? <ActionDialog title="Write a post" action="Publish post" onClose={() => setWriting(false)} onSubmit={async data => {
   const cover = String(data.get('cover') ?? '');
   await mutate(`/api/blog/containers/${encodeURIComponent(containerId)}/posts`, { operationKey: operationKey(), title: String(data.get('title') ?? ''), body: String(data.get('body') ?? ''), cover: cover ? { kind: 'gallery', id: cover } : null });
   setCursors([]);
   await resource.reload();
  }}>
   <label>Title<input name="title" required maxLength={1000}/></label>
   <label>Cover<select name="cover" defaultValue=""><option value="">No cover</option>{Object.keys(galleries).map(id => <option key={id} value={id}>{id[0]!.toUpperCase() + id.slice(1)}</option>)}</select></label>
   <label>Post<textarea name="body" rows={8} maxLength={100000}/></label>
   <p className="muted">The post is a page in this space, dated now and signed by you. Leave a blank line between paragraphs.</p>
  </ActionDialog> : null}
 </section>;
}
