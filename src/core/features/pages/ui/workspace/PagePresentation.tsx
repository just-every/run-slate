import {ReadOnlyBlocks} from '../../../editor/ui/ReadOnlyBlocks';
import { useEffect, useRef, useState } from "react";
import type { EditorBlock } from "../../../editor/ui/types";
export function PagePresentation({
  title,
  blocks,
  onClose,
}: {
  title: string;
  blocks: EditorBlock[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const article = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const slides: EditorBlock[][] = [[]];
  for (const block of blocks) {
    if (
      block.type === "heading" &&
      block.level === 1 &&
      !block.indent && !block.layoutParentId &&
      slides.at(-1)!.length
    )
      slides.push([]);
    slides.at(-1)!.push(block);
  }
  useEffect(() => {
    const previous = document.querySelector<HTMLElement>('[data-page-more]');
    const scroll={x:window.scrollX,y:window.scrollY};
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => {
      document.documentElement.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus({preventScroll:true});
      window.scrollTo({left:scroll.x,top:scroll.y,behavior:"instant"});
    };
  }, []);
  useEffect(() => {
    article.current?.scrollTo({ top: 0, left: 0 });
    article.current?.focus({ preventScroll: true });
  }, [index]);
  return (
    <dialog
      ref={dialog}
      className="page-presentation"
      aria-label={`Presenting ${title}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "PageDown") {
          event.preventDefault();
          setIndex((value) => Math.min(slides.length - 1, value + 1));
        }
        if (event.key === "ArrowLeft" || event.key === "PageUp") {
          event.preventDefault();
          setIndex((value) => Math.max(0, value - 1));
        }
      }}
    >
      <button className="presentation-close" onClick={onClose}>
        Exit presentation
      </button>
      <article ref={article} tabIndex={0} aria-label={`Slide ${index + 1} of ${slides.length}`}>
        <p className="eyebrow">{title}</p>
        <ReadOnlyBlocks blocks={slides[index]}/>
      </article>
      <footer>
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Previous
        </button>
        <span role="status" aria-live="polite" aria-atomic="true">
          {index + 1} / {slides.length}
        </span>
        <button
          disabled={index === slides.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next
        </button>
      </footer>
    </dialog>
  );
}
