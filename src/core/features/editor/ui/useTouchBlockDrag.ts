import {useRef, useState, type PointerEvent} from 'react';

/** Native HTML dragging does not carry touch input; capture only the block handle. */
export function useTouchBlockDrag(onDrop: ((targetId: string) => void) | undefined, onTap: () => void) {
  const gesture=useRef<{pointerId:number;x:number;y:number;moved:boolean}|null>(null);
  const [dragging,setDragging]=useState(false);
  const clear=(event:PointerEvent<HTMLButtonElement>)=>{
    gesture.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    dragging,
    onPointerDown(event:PointerEvent<HTMLButtonElement>) {
      if(event.pointerType!=='touch'||event.button!==0||!onDrop)return;
      // Prevent the menu's pointer-down activation while deciding between a tap and a drag.
      event.preventDefault();
      gesture.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event:PointerEvent<HTMLButtonElement>) {
      const current=gesture.current;
      if(!current||current.pointerId!==event.pointerId)return;
      if(!current.moved&&Math.hypot(event.clientX-current.x,event.clientY-current.y)>6){
        current.moved=true;setDragging(true);
      }
    },
    onPointerUp(event:PointerEvent<HTMLButtonElement>) {
      const current=gesture.current;
      if(!current||current.pointerId!==event.pointerId)return;
      event.preventDefault();
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-block-id]');
      clear(event);
      if(current.moved){if(target?.dataset.blockId)onDrop?.(target.dataset.blockId);}
      else onTap();
    },
    onPointerCancel:clear,
    onLostPointerCapture:clear,
  };
}
