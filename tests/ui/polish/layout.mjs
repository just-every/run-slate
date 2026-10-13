import assert from 'node:assert/strict';

export async function headingGap(button, name) {
  const gap = await button.evaluate(el => {
    const section = el.closest('section');
    const headings = [...section.querySelectorAll('h2,h3')].filter(h => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    const heading = headings.at(-1);
    return heading ? el.getBoundingClientRect().top - heading.getBoundingClientRect().bottom : null;
  });
  const precedingGap = await button.evaluate(el => el.previousElementSibling ? el.getBoundingClientRect().top - el.previousElementSibling.getBoundingClientRect().bottom : null);
  assert.ok(precedingGap !== null && precedingGap >= 8, `${name}: at least 8px after preceding content (${precedingGap})`);
  assert.ok(gap !== null && gap >= 8, `${name}: at least 8px below its heading (${gap})`);
}
export async function filterAlignment(spaces, width) {
  const rows = await spaces.locator(':scope > .action-row').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('button, select, label:has(input[type="checkbox"])')].map(el => { const r=el.getBoundingClientRect(); return { text:el.textContent.trim(),top:r.top,bottom:r.bottom,center:(r.top+r.bottom)/2 }; })));
  for (const row of rows) for (let i=0;i<row.length;i++) for(let j=i+1;j<row.length;j++) {
    const a=row[i],b=row[j], sameLine=Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
    if (width === 1440 || sameLine) assert.ok(Math.abs(a.center-b.center)<=2, `Space filters share centers, including checkbox-label: ${a.text}/${b.text} (${a.center}, ${b.center})`);
  }
}
export async function drawerDoesNotIntercept(page) {
  const evidence = await page.locator('.navigation-backdrop').evaluate(backdrop => {
    const b=backdrop.getBoundingClientRect(), drawer=document.querySelector('.sidebar').getBoundingClientRect();
    const controls=[...document.querySelectorAll('.sidebar button,.sidebar [role="button"]')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>61;});
    return { backdrop:b.toJSON(),drawer:drawer.toJSON(),controls:controls.map(el=> {const r=el.getBoundingClientRect(); return {name:el.getAttribute('aria-label')||el.textContent.trim(),hits:[.1,.5,.9].flatMap(x=>[.1,.5,.9].map(y=>{const hit=document.elementFromPoint(r.left+r.width*x,r.top+r.height*y);return {coveredByBackdrop:hit===backdrop};}))};}) };
  });
  const overlap=Math.min(evidence.backdrop.right,evidence.drawer.right)>Math.max(evidence.backdrop.left,evidence.drawer.left)&&Math.min(evidence.backdrop.bottom,evidence.drawer.bottom)>Math.max(evidence.backdrop.top,evidence.drawer.top);
  assert.ok(!overlap || evidence.controls.every(c=>c.hits.every(h=>!h.coveredByBackdrop)), `Shaded backdrop excludes drawer controls or cannot intercept center/edges (${JSON.stringify(evidence)})`);
  return evidence;
}
