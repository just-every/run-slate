import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageMovePicker } from '../../src/core/features/pages/ui/PageMovePicker';
import { Button } from '../../src/core/ui/button';
import type { SurfaceState } from '../../src/core/ui';

function confirmButton(node: ReactNode): ReactNode {
 for (const child of Children.toArray(node)) {
  if (!isValidElement<{children?: ReactNode}>(child)) continue;
  if (child.type === Button && child.props.children === 'Move page') return child;
  const found = confirmButton(child.props.children);
  if (found) return found;
 }
 return null;
}

test('PAGE-004: stale move selection cannot confirm while destinations are unavailable', () => {
 for (const state of ['loading','error','denied','empty','ready'] as SurfaceState[]) {
  const result = PageMovePicker({open:true,onOpenChange:()=>{},pageTitle:'Guide',currentPath:'Team',childCount:0,destinations:[{id:'target',label:'Handbook',path:'Operations',kind:'page'}],state,query:'',onQueryChange:()=>{},selectedDestinationId:'target',onSelectDestination:()=>{},onConfirm:()=>{}});
  const button = confirmButton(result);
  assert.ok(button, 'confirmation action exists');
  const html = renderToStaticMarkup(button);
  assert.equal(html.includes('disabled=""'), state !== 'ready', `${state} must match confirmation availability`);
 }
});
