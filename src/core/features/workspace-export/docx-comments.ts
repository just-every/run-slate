import type { CommentArchive } from './comment-archive';
import { xml, run, paragraph, declaration, wordNamespace } from './docx-xml';
import { pdfText } from './rich-text';

/** Word 2013's commentsEx supplies real reply ancestry and resolved state. Every
 * comment also carries that state as readable text for older Word readers. */
export class WordComments {
  private comments: string[] = [];
  private extensions: string[] = [];
  private anchors = new Map<string, number[]>();
  add(pageId: string, archive: CommentArchive): void {
    const authors = new Map(archive.authors.map(author => [author.id, author.displayName]));
    for (const thread of archive.threads) {
      const ids = new Map(thread.comments.map((comment,index) => [comment.id, this.comments.length + index]));
      const root = thread.comments.find(comment => !comment.parentCommentId) ?? thread.comments[0];
      if (!root) continue;
      const anchor = thread.blockId ?? pageId;
      this.anchors.set(anchor, [...this.anchors.get(anchor) ?? [], ids.get(root.id)!]);
      for (const comment of thread.comments) {
        const id = ids.get(comment.id)!, paraId = this.paraId(id);
        const parentId = comment.parentCommentId ? ids.get(comment.parentCommentId) : undefined;
        const state = `${thread.state === 'resolved' ? `Resolved${thread.resolvedAt ? ` at ${thread.resolvedAt}` : ''}${thread.resolvedBy ? ` by ${authors.get(thread.resolvedBy) ?? ''}` : ''}` : 'Open'}${comment.parentCommentId ? ' · Reply' : ''}`;
        const body = comment.deletedAt ? `Deleted at ${comment.deletedAt}` : pdfText(comment.body);
        this.comments.push(`<w:comment w:id="${id}" w:author="${xml(comment.authorId ? authors.get(comment.authorId) ?? '' : '')}" w:date="${xml(comment.createdAt)}">${paragraph(run(body)+run(`\n${state}`), '', ` w14:paraId="${paraId}"`)}</w:comment>`);
        this.extensions.push(`<w15:commentEx w15:paraId="${paraId}"${parentId !== undefined ? ` w15:paraIdParent="${this.paraId(parentId)}"` : ''} w15:done="${thread.state === 'resolved' ? 1 : 0}"/>`);
      }
    }
  }
  private paraId(id: number) { return (id + 1).toString(16).toUpperCase().padStart(8, '0'); }
  mark(anchor: string, content: string): string {
    const ids = this.anchors.get(anchor) ?? [];
    return ids.map(id => `<w:commentRangeStart w:id="${id}"/>`).join('') + content + [...ids].reverse().map(id => `<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r>`).join('');
  }
  get present() { return this.comments.length > 0; }
  get xml() { return `${declaration}<w:comments xmlns:w="${wordNamespace}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">${this.comments.join('')}</w:comments>`; }
  get extendedXml() { return `${declaration}<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">${this.extensions.join('')}</w15:commentsEx>`; }
}
