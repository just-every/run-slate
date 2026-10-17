import { displayDate } from '../../../app/ui/displayDate';
import { galleries, type PageCover } from '../../pages/ui/workspace/PageAppearance';

export interface PostItem { pageId: string; title: string; containerId: string; containerName: string; postedAt: string; authorName: string; cover: PageCover | null; coverFileId: string | null; commentCount: number }

/** A cover never loads a remote link by itself; linked covers show on the post once the reader asks. */
function Cover({ post }: { post: PostItem }) {
 if (post.coverFileId) return <img className="post-cover" src={`/api/media/${encodeURIComponent(post.coverFileId)}?display=inline`} alt=""/>;
 if (post.cover?.kind === 'gallery' && galleries[post.cover.id]) return <div className="post-cover" aria-hidden="true" style={{ background: galleries[post.cover.id] }}/>;
 return null;
}

/** CONT-010: dated, attributed posts, newest first; each opens as the page it is. */
export function PostList({ items, showSpace }: { items: PostItem[]; showSpace?: boolean }) {
 return <ul className="post-list">
  {items.map(post => <li key={post.pageId}>
   <article aria-label={post.title}>
    <Cover post={post}/>
    <h3><a href={`/app/pages/${encodeURIComponent(post.pageId)}`}>{post.title}</a></h3>
    <p className="post-byline">By {post.authorName} · <time dateTime={post.postedAt}>{displayDate(post.postedAt, true)}</time>{showSpace ? <> · <a href={`/app/containers/${encodeURIComponent(post.containerId)}`}>{post.containerName}</a></> : null}</p>
    <p className="post-comments">{post.commentCount === 1 ? '1 comment' : `${post.commentCount} comments`}</p>
   </article>
  </li>)}
 </ul>;
}
