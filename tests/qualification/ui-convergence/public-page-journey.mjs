import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {accessible} from './browser-evidence.mjs';
import {ok} from './two-people-support.mjs';

/** A populated publication read by fresh visitors, independently of operator sessions. */
export async function publicPageJourney(state) {
  const {page, context, origin, api} = state;
  const width = page.viewportSize().width;
  const workspace = await api('/api/workspace');
  const mutate = (route, data, method = 'POST') => ok(context, origin, method, route, {operationKey: randomUUID(), ...data});
  const profile = async policies => {
    const current = await api('/api/workspace');
    const {name, mark, description, guestAccess, publicLinkAccess, anonymousAccess} = current;
    await mutate('/api/workspace', {expectedRevisionId: current.revisionId, name, mark, description,
      guestAccess, publicLinkAccess, anonymousAccess, policies}, 'PUT');
  };
  const paragraph = (text, treePosition = '1') => ({id: randomUUID(), blockType: 'paragraph', treePosition, content: {text}});
  try {
    await profile({...workspace.policies, 'page.lifecycle.v1': 'draft-then-publish'});
    const space = (await mutate('/api/containers', {name: 'Publication privacy'})).value.id;
    const create = async (title, blocks, parentPageId) => (await mutate('/api/pages', {containerId: space, title, blocks, parentPageId})).value;
    const publish = async (record, extra = {}) => (await mutate(`/api/pages/${record.pageId}/publish`, {expectedRevisionId: record.revisionId, ...extra})).value;
    const expose = async (record, slug, extra = {}) => mutate(`/api/publishing/${record.pageId}`, {
      expectedRevisionId: record.revisionId, host: new URL(origin).host, slug, ...extra,
    });
    const parent = await create('Public handbook', [paragraph([{text: 'Public reference body'}])]);
    const parentPublished = await publish(parent);
    await expose(parentPublished, 'public-handbook');
    await mutate(`/api/pages/${parent.pageId}`, {expectedRevisionId: parentPublished.revisionId,
      properties: {title: 'Unpublished handbook title'}}, 'PATCH');
    const neighbour = await create('Confidential neighbouring page', [paragraph([{text: 'Confidential neighbouring body'}])]);
    const body = paragraph([{text: 'Published launch instructions. '},
      {text: 'Public reference', link: {href: `/app/pages/${parent.pageId}`}},
      {text: ' Private reference', link: {href: `/app/pages/${neighbour.pageId}`}},
      {text: 'Confidential neighbouring page', mention: {kind: 'page', id: neighbour.pageId, label: 'Confidential neighbouring page'}},
      {text: 'Unpublished handbook title', marks: ['underline'], mention: {kind: 'page', id: parent.pageId, label: 'Unpublished handbook title'}}]);
    const embed = {id: randomUUID(), blockType: 'link-card', treePosition: '2', content: {
      url: 'https://www.figma.com/design/synthetic-slate-301/Guide', display: 'embed',
      previewState: 'ready', preview: {title: 'Launch diagram'},
    }};
    const created = await create('Published launch guide', [body, embed], parent.pageId);
    // The publisher checks the provider through its native door before exposing the page.
    assert.equal((await api(`/api/pages/${created.pageId}/embeds/${embed.id}/status`)).verdict, 'embeddable');
    // This native choice explicitly permits Morgan's byline, without publishing Alex's identity.
    const published = await publish(created, {publishAsMemberId: 'browser-reader'});
    await expose(published, 'launch-guide', {
      headerControls: ['search', 'breadcrumbs', 'duplicate'], duplicateAsTemplate: true,
    });
    const pageId = created.pageId;
    const snapshotPath = `/api/revisions/${pageId}/${published.revisionId}`;
    const snapshot = await api(snapshotPath);
    assert.equal(snapshot.properties.title, 'Published launch guide');
    assert.equal(snapshot.properties.byline, 'Morgan Reader');
    assert.equal(snapshot.blocks[0].content.text[0].text, 'Published launch instructions. ');
    await mutate(`/api/comments/page/${pageId}`, {body: [{text: 'Internal operator discussion'}]});
    assert.equal((await api(`/api/comments/page/${pageId}`)).threads.length, 1);
    await mutate(`/api/pages/${pageId}`, {expectedRevisionId: published.revisionId, properties: {title: 'Unpublished launch title'}}, 'PATCH');
    const current = await api(`/api/pages/${pageId}`);
    await mutate(`/api/pages/${pageId}/blocks/${body.id}`, {
      expectedRevisionId: current.blocks.find(block => block.id === body.id).revisionId,
      content: {text: [{text: 'Unpublished launch body'}]},
    }, 'PATCH');
    const working = await api(`/api/pages/${pageId}`);
    assert.equal(working.page.title, 'Unpublished launch title');
    assert.equal(working.blocks[0].content.text[0].text, 'Unpublished launch body');
    assert.equal(working.publishedRevisionId, published.revisionId);
    assert.notEqual(working.workingRevisionId, published.revisionId);
    const before = await api(`/api/analytics?pageId=${pageId}`);
    const providerReads = (await state.readEmbedRequests()).length;
    const secrets = ['Unpublished launch title', 'Unpublished launch body', 'Internal operator discussion',
      'Confidential neighbouring page', 'Confidential neighbouring body', 'Unpublished handbook title', 'Alex Owner', 'browser-owner', 'browser-reader'];
    // Keep operator background work quiet while examining only the visitor's requests.
    await page.goto('about:blank');
    let visits = 0;
    for (const freshVisit of [1, 2]) {
      const visitor = await context.browser().newContext({viewport: page.viewportSize(), locale: 'en-US'});
      const requests = [], responses = [], external = [];
      visitor.on('request', request => requests.push({url: request.url(), method: request.method(),
        body: request.postData(), headers: request.headers()}));
      visitor.on('response', response => responses.push(response));
      await visitor.route(url => url.origin !== origin, async route => {
        external.push(route.request().url());
        await route.abort();
      });
      try {
        const view = await visitor.newPage();
        const inspect = async () => {
          const response = await view.goto(`${origin}/p/launch-guide`, {waitUntil: 'networkidle'});
          assert.equal(response.status(), 200);
          visits++;
          await expect(view.getByRole('heading', {level: 1})).toHaveText('Published launch guide');
          await expect(view.locator('.page-body')).toContainText('Published launch instructions.');
          await expect(view.locator('.page-byline')).toHaveText('Morgan Reader');
          for (const secret of secrets) assert.ok(!(await view.content()).includes(secret), `Anonymous HTML excludes ${secret}.`);
          await expect(view.locator('[contenteditable], .app-navigation, .page-topbar, .comment-thread, [data-testid="member-name"], a[href^="/app/"]')).toHaveCount(0);
          assert.deepEqual(await view.locator('nav').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Published ancestors']);
          await expect(view.getByRole('navigation', {name: 'Published ancestors'}).getByRole('link', {name: 'Public handbook'})).toHaveAttribute('href', '/p/public-handbook');
          await expect(view.getByRole('searchbox', {name: 'Search published pages'})).toBeVisible();
          await expect(view.getByRole('link', {name: 'Duplicate this page'})).toHaveAttribute('href', /^\/signin\?next=/);
          await expect(view.getByRole('link', {name: 'Public reference', exact: true})).toHaveAttribute('href', '/p/public-handbook');
          await expect(view.locator('.page-body')).toContainText('Private reference');
          await expect(view.locator('.page-body')).toContainText('Restricted page');
          await expect(view.locator('.page-body').getByRole('link', {name: 'Public handbook', exact: true})).toHaveAttribute('href', '/p/public-handbook');
          await expect(view.getByRole('link', {name: 'Private reference', exact: true})).toHaveCount(0);
          await expect(view.getByRole('button', {name: 'Load Figma embed', exact: true})).toBeVisible();
          await expect(view.locator('iframe')).toHaveAttribute('hidden', '');
          assert.equal(await view.locator('iframe').getAttribute('src'), null);
          assert.deepEqual(external, [], 'No third-party resource is even requested before interaction.');
          assert.deepEqual(await visitor.cookies(), [], 'Fresh and repeat reads set no cookie.');
          for (const request of requests) {
            assert.equal(new URL(request.url).origin, origin);
            assert.ok(['/p/launch-guide', '/favicon.svg', '/slate-mark.svg'].includes(new URL(request.url).pathname), `No visitor transmission: ${request.url}`);
            assert.equal(request.method, 'GET');
            assert.equal(request.body, null);
            assert.equal(request.headers.cookie, undefined);
            assert.equal(request.headers.authorization, undefined);
          }
          for (const response of responses) assert.equal(response.headers()['set-cookie'], undefined);
          assert.equal((await state.readEmbedRequests()).length, providerReads, 'A visitor read does not trigger a server-side provider probe.');
          const after = await api(`/api/analytics?pageId=${pageId}`);
          assert.equal(after.anonymousViews, before.anonymousViews + visits);
          assert.equal(after.totalViews, before.totalViews + visits);
          assert.equal(after.uniqueViewers, before.uniqueViewers);
          assert.deepEqual(after.viewers, before.viewers);
          return view;
        };
        await inspect();
        if (freshVisit === 1) {
          await accessible(view, 'Anonymous published snapshot');
          await view.screenshot({path: `.artifacts/ui-convergence/public-page-${width}.png`, fullPage: true});
          await inspect();
        }
      } finally { await visitor.close(); }
    }
    const rows = (await state.atRest(`SELECT viewer_member_id,viewer_kind,is_own_page FROM page_views WHERE page_id='${pageId}' ORDER BY id`))[0].results;
    assert.deepEqual(rows, Array.from({length: visits}, () => ({viewer_member_id: null, viewer_kind: 'anonymous', is_own_page: 0})), 'Every counted public view has no member identity at rest.');
    const retained = await api(snapshotPath);
    assert.equal(retained.newerRevisionExists, true);
    for (const field of ['id', 'createdAt', 'properties', 'blocks'])
      assert.deepEqual(retained[field], snapshot[field], `The published revision retains its ${field}.`);
    console.log(`PROBE WEB-003 1: anonymous published route at ${width}px -> published title, body, explicit byline and public references; private working content, comments and operator identity absent`);
    console.log(`PROBE WEB-003 2: ${visits} fresh and repeat reads at ${width}px -> zero cookies, third-party requests or pre-interaction transmissions; analytics and ${rows.length} anonymous rows agree with null member identity`);
  } finally { await profile(workspace.policies); }
}
