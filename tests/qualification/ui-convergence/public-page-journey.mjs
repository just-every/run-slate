import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { call, ok } from './two-people-support.mjs';
import { accessible } from './browser-evidence.mjs';

/** Publish native pages; read the built anonymous documents in fresh contexts. */
export async function publicPageJourney({page, context, origin, api, readerCookie}) {
  const mutate = (route, body) => ok(context, origin, 'POST', route, {operationKey:randomUUID(), ...body});
  const space = (await mutate('/api/containers', {name:'Public reference corpus', visibility:'private'})).value.id;
  const create = async (title, parentPageId) => {
    const result = await mutate('/api/pages', {containerId:space, parentPageId, title,
      blocks:[{id:randomUUID(), blockType:'paragraph', treePosition:'a', content:{text:[{text:`${title} body`}]}}]});
    const id = result.value.pageId;
    const document = await api(`/api/pages/${id}`);
    await mutate(`/api/pages/${id}/publish`, {expectedRevisionId:document.page.revisionId});
    return id;
  };
  const parent = await create('Publication parent');
  const selected = await create('Selected child', parent), hidden = await create('Unselected child', parent);
  const grandchild = await create('Unselected grandchild', selected), independent = await create('Independent reference');
  const targets = [selected, hidden, grandchild, independent];
  const titles = new Map([[parent,'Publication parent'],[selected,'Selected child'],[hidden,'Unselected child'],[grandchild,'Unselected grandchild'],[independent,'Independent reference']]);
  const slugs = new Map([[parent,'publication-parent'],[selected,'selected-child'],[hidden,'unselected-child'],[grandchild,'unselected-grandchild'],[independent,'independent-reference']]);
  const receipts = [], inventories = [], anonymousReads = [];
  const input = async (id, children) => ({operationKey:randomUUID(), expectedRevisionId:(await api(`/api/pages/${id}`)).page.revisionId,
    host:new URL(origin).host, slug:slugs.get(id), ...(children ? {children:await Promise.all(children.map(async pageId => ({pageId, slug:slugs.get(pageId), expectedRevisionId:(await api(`/api/pages/${pageId}`)).page.revisionId})))} : {})});
  const publish = async (id, children) => {
    const body = await input(id, children);
    const receipt = await ok(context, origin, 'POST', `/api/publishing/${id}`, body);
    assert.equal(receipt.value.pageId, id);
    assert.deepEqual(await ok(context, origin, 'POST', `/api/publishing/${id}`, body), receipt, 'A replay returns the committed publication receipt.');
    receipts.push({body, receipt});
  };
  const inventory = async published => {
    const exposures = await Promise.all([parent, ...targets].map(async id => ({pageId:id, ...(await api(`/api/publishing/${id}`))})));
    assert.deepEqual(exposures.filter(item => item.exposure).map(item => ({pageId:item.pageId,host:item.exposure.host,slug:item.exposure.slug,revokedAt:item.exposure.revokedAt})),
      [parent,...targets].filter(id => published.includes(id)).map(pageId => ({pageId,host:new URL(origin).host,slug:slugs.get(pageId),revokedAt:null})),
      'All and only explicitly published pages have an exposure record.');
    inventories.push(exposures);
  };
  let blocks;
  const content = async () => {
    blocks = targets.flatMap((id, index) => [
      {id:randomUUID(),blockType:'paragraph',treePosition:`${index}a`,content:{text:[{text:`Plain ${slugs.get(id)}`,link:{href:`/app/pages/${id}`}}]}},
      {id:randomUUID(),blockType:'paragraph',treePosition:`${index}b`,content:{text:[{text:`Absolute ${slugs.get(id)}`,link:{href:`${origin}/app/pages/${id}`}}]}},
      {id:randomUUID(),blockType:'paragraph',treePosition:`${index}c`,content:{text:[{text:'Stored private label',mention:{kind:'page',id,label:'Stored private label'}}]}},
      {id:randomUUID(),blockType:'link-card',treePosition:`${index}d`,content:{url:`/app/pages/${id}`,display:'card',previewState:'ready',preview:{title:`Card ${slugs.get(id)}`}}},
      {id:randomUUID(),blockType:'link-card',treePosition:`${index}e`,content:{url:`${origin}/app/pages/${id}`,display:'card',previewState:'ready',preview:{title:`Absolute card ${slugs.get(id)}`}}},
    ]);
    await ok(context,origin,'PUT',`/api/pages/${parent}/blocks`,{operationKey:randomUUID(),expectedRevisionId:(await api(`/api/pages/${parent}`)).page.revisionId,blocks});
    await mutate(`/api/pages/${parent}/publish`,{expectedRevisionId:(await api(`/api/pages/${parent}`)).page.revisionId});
  };
  const inspect = async (published, screenshot) => {
    await inventory([parent,...published]);
    const visitor = await context.browser().newContext({viewport:page.viewportSize()});
    try {
      const view = await visitor.newPage();
      const response = await view.goto(`${origin}/p/${slugs.get(parent)}`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      await view.reload({waitUntil:'networkidle'});
      await expect(view.getByRole('heading',{name:'Publication parent',exact:true})).toBeVisible();
      await expect(view.locator('a[href*="/app/"]')).toHaveCount(0);
      await expect(view.locator('body')).not.toContainText('Stored private label');
      for (const [index,id] of targets.entries()) {
        const exposed = published.includes(id);
        for (const label of [`Plain ${slugs.get(id)}`,`Absolute ${slugs.get(id)}`,`Card ${slugs.get(id)}`,`Absolute card ${slugs.get(id)}`]) {
          await expect(view.getByText(label,{exact:true})).toBeVisible();
          const link = view.getByRole('link',{name:label,exact:true});
          if (exposed) await expect(link).toHaveAttribute('href',`/p/${slugs.get(id)}`);
          else await expect(link).toHaveCount(0);
        }
        const mention = view.locator(`[id="${blocks[index*5+2].id}"]`);
        await expect(mention).toHaveText(exposed ? titles.get(id) : 'Restricted page');
        await expect(mention.locator('a')).toHaveCount(exposed ? 1 : 0);
        if (exposed) await expect(mention.locator('a')).toHaveAttribute('href',`/p/${slugs.get(id)}`);
        const target = await visitor.request.get(`${origin}/p/${slugs.get(id)}`);
        assert.equal(target.status(),exposed ? 200 : 404);
        assert.equal(target.headers()['set-cookie'],undefined);
        const document = await target.text();
        if (exposed) assert.ok(document.includes(`${titles.get(id)} body`));
        else { assert.ok(document.includes('This link is no longer available'));assert.ok(!document.includes(titles.get(id))); }
        anonymousReads.push({pageId:id,status:target.status(),exposed});
      }
      assert.deepEqual(await visitor.cookies(),[], 'Anonymous readers acquire no member session.');
      if (screenshot) await accessible(view, screenshot);
    } finally { await visitor.close(); }
  };
  await content();
  await publish(parent);
  await inspect([], 'parent publication leaves existing children and native references private');
  const later = await create('Later child',parent);
  targets.push(later);titles.set(later,'Later child');slugs.set(later,'later-child');
  await inventory([parent]);
  // Updating a public parent after adding a child still creates no child exposure.
  await content();
  await publish(parent);
  await inspect([]);
  const unsigned = await context.browser().newContext();
  try {
    assert.equal((await call(unsigned,origin,'POST',`/api/publishing/${parent}`,await input(parent,[hidden]))).status,401);
    await inventory([parent]);
  } finally { await unsigned.close(); }
  const reader = await context.browser().newContext();
  try {
    await reader.addCookies([{name:'slate_session',value:readerCookie.split('=')[1],url:origin}]);
    assert.equal((await call(reader,origin,'POST',`/api/publishing/${parent}`,await input(parent,[hidden]))).status,404);
    await inventory([parent]);
  } finally { await reader.close(); }
  await publish(parent,[selected]);
  await inspect([selected]);
  await publish(independent);
  await inspect([selected,independent]);
  await publish(later);
  await inspect([selected,independent,later], 'explicit children and independent publications resolve while unselected descendants remain text');
  const directory = '.artifacts/ui-convergence';
  await mkdir(directory,{recursive:true});
  await writeFile(`${directory}/public-page-${page.viewportSize().width}-receipts.json`,JSON.stringify({receipts,inventories,anonymousReads},null,2));
  console.log('PROBE WEB-004 parent-only: native publication and fresh anonymous reloads -> existing and later children remain unexposed');
  console.log('PROBE WEB-004 explicit children: selected child, independent target and later child -> exact exposure inventory; unselected child and grandchild remain unavailable');
  console.log('PROBE WEB-004 references: relative and absolute links, mentions and cards -> private text or independently resolving public address');
}
