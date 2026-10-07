import { useEffect, useRef, useState } from "react";
import { BlockView } from "../../../editor/ui/blocks/BlockView";
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
  const [index, setIndex] = useState(0);
  const slides: EditorBlock[][] = [[]];
  for (const block of blocks) {
    if (
      block.type === "heading" &&
      block.level === 1 &&
      !block.indent &&
      slides.at(-1)!.length
    )
      slides.push([]);
    slides.at(-1)!.push(block);
  }
  useEffect(() => {
    const previous = document.activeElement;
    const scroll={x:window.scrollX,y:window.scrollY};
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus({preventScroll:true});
      window.scrollTo({left:scroll.x,top:scroll.y,behavior:"instant"});
    };
  }, []);
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
      <article>
        <p className="eyebrow">{title}</p>
        {slides[index].map((block) => (
          <BlockView
            key={block.id}
            block={block}
            canEdit={false}
            onChange={() => {}}
          />
        ))}
      </article>
      <footer>
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Previous
        </button>
        <span>
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
