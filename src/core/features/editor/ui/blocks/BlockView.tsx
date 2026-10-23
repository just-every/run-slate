import {SyncedBlock} from './SyncedBlock';
import {FileCardBlock} from './FileCardBlock';
import {TableOfContentsBlock} from './TableOfContentsBlock';
import {TaskReportBlock} from './TaskReportBlock';
import type { BlockActions, EditorBlock } from "../types";
import { CalloutBlock } from "./CalloutBlock";
import { CodeBlock } from "./CodeBlock";
import { ContentQueryBlock } from "./ContentQueryBlock";
import { DividerBlock } from "./DividerBlock";
import { ExpandableBlock } from "./ExpandableBlock";
import { HeadingBlock } from "./HeadingBlock";
import { LinkCardBlock } from "./LinkCardBlock";
import { ListBlock } from "./ListBlock";
import { MediaBlock } from "./MediaBlock";
import { ParagraphBlock } from "./ParagraphBlock";
import { QuoteBlock } from "./QuoteBlock";
import { TableBlock } from "./TableBlock";
import { TaskBlock } from "./TaskBlock";

export interface BlockViewProps {
  block: EditorBlock;
  textLabel?: string;
  canEdit: boolean;
  onChange: (next: EditorBlock) => void;
  actions?: BlockActions;
  /** Shown by an empty paragraph; every other block carries its own. */
  placeholder?: string;
}

/** One block, rendered by its type. Every renderer is props-in, callbacks-out. */
export function BlockView({ block, canEdit, onChange, actions, placeholder, textLabel }: BlockViewProps) {
  switch (block.type) {
    case "synced-source": case "synced-reference": return <SyncedBlock block={block} canEdit={canEdit} onChange={onChange} actions={actions}/>;
    case "columns": return canEdit ? <label className="text-ui text-ink-muted">Columns <select aria-label="Number of columns" value={block.count} onChange={event=>onChange({...block,count:Number(event.target.value)})}>{[2,3,4,5].map(count=><option key={count} value={count}>{count}</option>)}</select></label> : null;
    case "column": return null;
    case "file-card": return <FileCardBlock block={block}/>;
    case "table-of-contents": return <TableOfContentsBlock block={block} canEdit={canEdit} onChange={onChange}/>;
    case "task-report": return <TaskReportBlock block={block} canEdit={canEdit} onChange={onChange}/>;
    case "paragraph":
      return (
        <ParagraphBlock block={block} canEdit={canEdit} onChange={onChange} placeholder={placeholder} label={textLabel} />
      );
    case "heading":
      return <HeadingBlock block={block} canEdit={canEdit} onChange={onChange} />;
    case "list":
      return <ListBlock block={block} canEdit={canEdit} onChange={onChange} />;
    case "quote":
      return <QuoteBlock block={block} canEdit={canEdit} onChange={onChange} />;
    case "divider":
      return <DividerBlock />;
    case "callout":
      return <CalloutBlock block={block} canEdit={canEdit} onChange={onChange} />;
    case "expandable":
      return <ExpandableBlock block={block} canEdit={canEdit} onChange={onChange} />;
    case "table":
      return <TableBlock block={block} canEdit={canEdit} onChange={onChange} actions={actions} />;
    case "code":
      return <CodeBlock actions={actions} block={block} canEdit={canEdit} onChange={onChange} />;
    case "task":
      return <TaskBlock block={block} canEdit={canEdit} onChange={onChange} />;
    case "media":
      return <MediaBlock actions={actions} block={block} canEdit={canEdit} onChange={onChange} />;
    case "link-card":
      return <LinkCardBlock actions={actions} block={block} canEdit={canEdit} onChange={onChange} />;
    case "content-query":
      return <ContentQueryBlock actions={actions} block={block} canEdit={canEdit} onChange={onChange} />;
  }
}
