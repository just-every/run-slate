import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Inspect the original capture geometry without scrolling the document or any
 * internal pane. Native paint visibility excludes closed disclosures. Hit tests
 * cover the original viewport; full-page document fragments retain their original
 * clipping and coordinates rather than being moved beneath fixed surfaces.
 */
export async function sweepControls(page, { fullPage }) {
  const result = await page.evaluate(({ fullPage }) => {
    const transparent = c => c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || /\/\s*0\)$/.test(c);
    const initial = { x: scrollX, y: scrollY };
    const scrolls = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth).map(e => [e, e.scrollTop, e.scrollLeft]);
    const controls = [...document.querySelectorAll('button, [role="button"], summary')];
    const documentBox = r => ({ x: r.left + initial.x, y: r.top + initial.y, width: r.right-r.left, height: r.bottom-r.top });
    const records = controls.map((el, index) => {
      const s = getComputedStyle(el), original = el.getBoundingClientRect();
      const clone = el.cloneNode(true); clone.querySelectorAll('[aria-hidden="true"],svg').forEach(e => e.remove());
      const text = clone.textContent.trim();
      const labelled = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      const name = el.getAttribute('aria-label')?.trim() || labelled || text || el.getAttribute('title')?.trim() || '';
      const paintVisible = el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true });
      const record = { index, tag: el.tagName, name, text, disabled: el.matches(':disabled,[aria-disabled="true"]'), paintVisible, box: documentBox(original), padding: [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)], background: s.backgroundColor, borders: ['Top','Right','Bottom','Left'].map(side => ({ width: parseFloat(s[`border${side}Width`]), color: s[`border${side}Color`], style: s[`border${side}Style`] })), hits: [], documentFragments: [], gapBoxes: [], excluded: null };
      if (!paintVisible || !original.width || !original.height) { record.excluded = 'not painted'; return record; }
      if (!fullPage && (original.bottom <= 0 || original.top >= innerHeight || original.right <= 0 || original.left >= innerWidth)) { record.excluded = 'outside viewport capture'; return record; }
      const captured = { left: Math.max(-initial.x,original.left), right: Math.min(document.documentElement.scrollWidth-initial.x,original.right), top: fullPage ? Math.max(-initial.y,original.top) : Math.max(0,original.top), bottom: fullPage ? Math.min(document.documentElement.scrollHeight-initial.y,original.bottom) : Math.min(innerHeight,original.bottom) };
      if (!fullPage) { captured.left=Math.max(0,captured.left); captured.right=Math.min(innerWidth,captured.right); }
      for (let parent = el.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
        const ps=getComputedStyle(parent),pr=parent.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(ps.overflowX)) {captured.left=Math.max(captured.left,pr.left);captured.right=Math.min(captured.right,pr.right);}
        if (/(hidden|clip|scroll|auto)/.test(ps.overflowY)) {captured.top=Math.max(captured.top,pr.top);captured.bottom=Math.min(captured.bottom,pr.bottom);}
      }
      record.capturedBox = captured;
      if (captured.right <= captured.left || captured.bottom <= captured.top) { record.excluded='clipped in capture'; return record; }
      // Full-page screenshots paint document content beyond the original viewport.
      // These pieces cannot be tested with elementFromPoint (it returns null there).
      // Keep them in the sweep, without scrolling or enlarging an internal pane.
      if (fullPage && captured.top < 0) record.documentFragments.push({ ...captured, bottom: Math.min(0,captured.bottom) });
      if (fullPage && captured.bottom > innerHeight) record.documentFragments.push({ ...captured, top: Math.max(innerHeight,captured.top) });
      record.gapBoxes.push(...record.documentFragments.map(documentBox));
      const visible = { left: Math.max(0,captured.left), right: Math.min(innerWidth,captured.right), top: Math.max(0,captured.top), bottom: Math.min(innerHeight,captured.bottom) };
      record.visibleBox = visible;
      if (visible.right > visible.left && visible.bottom > visible.top) {
        // Disabled pointer-events:none controls still paint. Probe their original
        // surface with pointer events enabled, preserving the complete inline value.
        const pe = el.style.getPropertyValue('pointer-events'), priority = el.style.getPropertyPriority('pointer-events');
        if (record.disabled) el.style.setProperty('pointer-events','auto','important');
        const owns = (x,y) => {const hit=document.elementFromPoint(x,y);return !!hit && (hit===el || el.contains(hit));};
        for (const x of [.1,.5,.9]) for (const y of [.1,.5,.9]) {
          const px = visible.left + (visible.right-visible.left)*x, py = visible.top + (visible.bottom-visible.top)*y;
          const hit = document.elementFromPoint(px,py);
          record.hits.push({ x:px, y:py, own: !!hit && (hit === el || el.contains(hit)), hit: hit ? `${hit.tagName}${hit.id ? '#'+hit.id : ''}${hit.className && typeof hit.className === 'string' ? '.'+hit.className.trim().split(/\s+/).join('.') : ''}` : null });
        }
        if (record.hits.every(h => h.own)) record.gapBoxes.push(documentBox(visible));
        else {
          // A sticky/fixed surface can cover only a control's edge. Compare the
          // painted fragment, retaining any document pieces below that surface.
          const ys=[];
          for(let y=visible.top+.5;y<visible.bottom;y++) if ([.1,.5,.9].some(x=>owns(visible.left+(visible.right-visible.left)*x,y))) ys.push(y);
          if (ys.length) {
            const top=ys[0]-.5,bottom=ys.at(-1)+.5,xs=[];
            for(let x=visible.left+.5;x<visible.right;x++) if ([.1,.5,.9].some(y=>owns(x,top+(bottom-top)*y))) xs.push(x);
            if (xs.length) {
              record.paintedBox={left:xs[0]-.5,right:xs.at(-1)+.5,top,bottom};
              record.gapBoxes.push(documentBox(record.paintedBox));
            }
          }
        }
        if (record.disabled) { if (pe) el.style.setProperty('pointer-events',pe,priority); else el.style.removeProperty('pointer-events'); }
      }
      if (!record.gapBoxes.length) { record.excluded='occluded in original capture'; return record; }
      record.gapBox = documentBox(captured);
      record.icon = !/[\p{L}\p{N}]/u.test(text);
      record.surface = !transparent(record.background) || record.borders.some(b => b.width > 0 && !['none','hidden'].includes(b.style) && !transparent(b.color) && b.color !== record.background);
      return record;
    });
    const unchangedScroll = scrollX === initial.x && scrollY === initial.y && scrolls.every(([el,top,left]) => el.scrollTop === top && el.scrollLeft === left);
    const visible = records.filter(r => !r.excluded);
    const findings = visible.flatMap(r => {
      if (r.icon) return /[\p{L}\p{N}]/u.test(r.name) && r.box.width >= 32 && r.box.height >= 32 ? [] : [`${r.index} ${r.name}: icon needs accessible name and 32px width/height (${r.box.width}×${r.box.height})`];
      return r.padding.every(p => p >= 8) && r.surface ? [] : [`${r.index} ${r.name}: text needs surface/border and 8px horizontal padding (${r.padding}; surface=${r.surface})`];
    });
    for (let i=0; i<visible.length; i++) for (let j=i+1; j<visible.length; j++) {
      const a=visible[i],b=visible[j];
      // A role button can own a child button; nested controls are not neighbors.
      if (controls[a.index].contains(controls[b.index]) || controls[b.index].contains(controls[a.index])) continue;
      const gap = Math.min(...a.gapBoxes.flatMap(ar => b.gapBoxes.map(br => Math.max(Math.max(br.x-ar.x-ar.width,ar.x-br.x-br.width),Math.max(br.y-ar.y-ar.height,ar.y-br.y-br.height)))));
      if (gap < 4) findings.push(`${a.index} ${a.name} / ${b.index} ${b.name}: gap ${gap.toFixed(2)}px`);
    }
    return { fullPage, initialScroll: initial, unchangedScroll, candidates: records.length, checked: visible.length, records, findings };
  }, { fullPage });
  for (const record of result.records.filter(r => !r.excluded && r.icon)) record.accessibility = await page.locator('button, [role="button"], summary').nth(record.index).ariaSnapshot();
  return result;
}
export async function assertControlSweep(page, sweep, name) {
  assert.equal(sweep.unchangedScroll, true, `${name}: sweeping retains every original scroll position`);
  for (const record of sweep.records.filter(r => !r.excluded && r.icon)) await expect(page.locator('button, [role="button"], summary').nth(record.index), `${name}: icon has a real accessible name`).toHaveAccessibleName(/[\p{L}\p{N}]/u);
  assert.deepEqual(sweep.findings, [], `${name}: every captured control has treatment and >=4px neighbor gap`);
}
