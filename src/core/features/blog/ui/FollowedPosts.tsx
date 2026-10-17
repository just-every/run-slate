import { useResource } from '../../../client/useResource';
import { RequestState } from '../../../app/ui/RequestState';
import { PostList, type PostItem } from './PostList';

/** Home's posts from the spaces this member watches; personal, never a workspace-wide feed. */
export function FollowedPosts() {
 const resource = useResource<{ items: PostItem[] }>('/api/blog?following=1');
 return <section aria-label="Posts" className="home-posts">
  <h2>Posts</h2><p className="muted">New posts in the spaces you watch.</p>
  <RequestState loading={resource.loading} error={resource.error} retry={resource.reload}>
   {resource.data?.items.length ? <PostList items={resource.data.items.slice(0, 5)} showSpace/> : <p>No posts yet. Watch a space to see its posts here.</p>}
  </RequestState>
 </section>;
}
