import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { syntheticStructuredPdf } from '../e2e/imports/fixtures/pdf-structure.ts';

const word = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const native = 'application/vnd.google-apps.document';
const folder = 'application/vnd.google-apps.folder';
const marker = directory => path.join(directory, 'folder-edge.json');
const requests = directory => path.join(directory, 'folder-requests.jsonl');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const escape = text => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);

export function folderFixture(provider) {
  assert.ok(['google-drive', 'sharepoint'].includes(provider));
  const google = provider === 'google-drive', offset = google ? 200 : 300;
  const id = n => `synthetic-slate-${offset + n}`;
  const url = itemId => google ? `https://docs.google.com/document/d/${itemId}/edit` : `https://synthetic-slate-204.sharepoint.com/Harbor/${itemId}`;
  const root = { id: id(10), name: google ? 'Harbor Drive records' : 'Harbor SharePoint records', folder: true, readable: true };
  const operations = { id: id(11), name: 'Operations', folder: true, readable: true, parent: root.id };
  const handover = { id: id(12), name: 'Handover', folder: true, readable: true, parent: operations.id };
  const denied = { id: id(13), name: 'Legal restricted', folder: true, readable: !google, parent: root.id, denied: true };
  const unsupported = { id: id(14), name: 'Budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', readable: true, parent: root.id };
  const labels = ['Incident overview', 'Recovery procedure', 'Contacts', 'Deployment checklist', 'Handover brief', 'Decision log', 'Supplier notes', 'Change review', 'On-call rota', 'Rollback plan', 'Archive index', 'Final review'];
  const documents = labels.map((label, index) => {
    const pdf = index === 2, googleDoc = google && !pdf && index % 3 === 0;
    return { id: id(21 + index), name: label + (pdf ? '.pdf' : googleDoc ? '' : '.docx'), title: label,
      mimeType: pdf ? 'application/pdf' : googleDoc ? native : word, readable: true,
      parent: index < 4 ? root.id : index < 8 ? operations.id : handover.id };
  });
  const items = [root, operations, handover, denied, unsupported, ...documents].map(item => ({ ...item,
    url: google && item.folder ? `https://drive.google.com/drive/folders/${item.id}` : url(item.id), version: 'synthetic-slate-401' }));
  return { provider, token: google ? 'synthetic-slate-201' : 'synthetic-slate-202', driveId: 'synthetic-slate-203',
    root: items[0], operations: items[1], handover: items[2], denied: items[3], unsupported: items[4], documents: items.slice(5), items };
}

/** Small but genuine OOXML: heading, table, embedded PNG and provider cross-links. */
function documentBytes(item, next, denied) {
  const run = text => `<w:r><w:t>${escape(text)}</w:t></w:r>`;
  const cell = text => `<w:tc><w:p>${run(text)}</w:p></w:tc>`;
  const document = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Recovery notes')}</w:p>
    <w:p>${run(`${item.title}: synthetic-slate-501 records the recovery owner and next handover.`)}</w:p>
    <w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr>${cell('Task')}${cell('Status')}</w:tr><w:tr>${cell('Verify archive')}${cell('Ready')}</w:tr></w:tbl>
    <w:p><w:hyperlink r:id="rIdNext">${run('Next recovery document')}</w:hyperlink>${run(' · ')}<w:hyperlink r:id="rIdDenied">${run('Restricted reference')}</w:hyperlink></w:p>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="Recovery marker" descr="Recovery evidence marker"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="marker.png" descr="Recovery evidence marker"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:sectPr/></w:body></w:document>`;
  const relationships = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdNext" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escape(next.url)}" TargetMode="External"/>
    <Relationship Id="rIdDenied" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escape(denied.url)}" TargetMode="External"/>
    <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/marker.png"/>
    <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(document), 'word/_rels/document.xml.rels': strToU8(relationships), 'word/media/marker.png': image,
    'word/styles.xml': strToU8('<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>'),
  });
}
const fixtures = ['google-drive', 'sharepoint'].map(folderFixture);
const payloads = new Map(fixtures.flatMap(fixture => fixture.documents.map((item, index) => [item.id,
  item.mimeType === 'application/pdf' ? syntheticStructuredPdf({ title: item.title, heading: 'Recovery checklist', link: fixture.documents[(index + 1) % 12].url })
    : documentBytes(item, fixture.documents[(index + 1) % 12], fixture.denied)])));

export async function initializeFolderEdge(directory) {
  await writeFile(marker(directory), JSON.stringify({ enabled: true }));
  await writeFile(requests(directory), '');
}
export async function readFolderRequests(directory) {
  return (await readFile(requests(directory), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
}
function providerItem(item, google) {
  if (google) return { id: item.id, name: item.name, webViewLink: item.url, mimeType: item.folder ? folder : item.mimeType,
    version: item.version, capabilities: { canDownload: item.readable, canListChildren: item.readable } };
  return { id: item.id, name: item.name, webUrl: item.url, eTag: item.version, ...(item.folder ? { folder: {} } : { file: { mimeType: item.mimeType }, size: payloads.get(item.id)?.length ?? 1 }) };
}

/** Only Google Drive and Microsoft Graph HTTP responses are recorded; Slate's APIs and importers run unchanged. */
export async function folderEdge(request, directory, ResponseClass) {
  const url = new URL(request.url), google = url.origin === 'https://www.googleapis.com';
  const graph = url.origin === 'https://graph.microsoft.com' && (url.pathname === '/v1.0/me' || url.pathname.startsWith('/v1.0/drives/synthetic-slate-203/'));
  const download = url.origin === 'https://synthetic-slate-204.sharepoint.com' && url.pathname.startsWith('/downloads/');
  if (!google && !graph && !download) return null;
  try { await readFile(marker(directory)); } catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; }
  assert.equal(request.method, 'GET', 'Folder imports must only read the provider');
  const fixture = fixtures.find(item => item.provider === (google ? 'google-drive' : 'sharepoint'));
  assert.equal(request.headers.get('authorization'), download ? null : `Bearer ${fixture.token}`, 'Delegated credentials must stay at their provider boundary');
  // No credentials, signed download URLs or headers are recorded in the receipt.
  await appendFile(requests(directory), JSON.stringify({ provider: fixture.provider, method: request.method, pathname: url.pathname,
    page: url.searchParams.get('pageToken') ?? url.searchParams.get('$skiptoken'), media: url.searchParams.get('alt') === 'media' }) + '\n');
  const json = value => new ResponseClass(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  if (google && url.pathname === '/oauth2/v3/userinfo') return json({ sub: 'synthetic-slate-205', email: 'owner@test.invalid', email_verified: true });
  if (graph && url.pathname === '/v1.0/me') return json({ id: 'synthetic-slate-206', displayName: 'Alex Owner', mail: 'owner@test.invalid', userPrincipalName: 'owner@test.invalid' });
  const itemId = download ? url.pathname.split('/').at(-1) : google ? url.pathname.match(/^\/drive\/v3\/files\/([^/]+)/)?.[1] : url.pathname.match(/\/items\/([^/]+)/)?.[1];
  const list = google ? url.pathname === '/drive/v3/files' : url.pathname.endsWith('/children');
  if (list) {
    const parentId = google ? /^'([^']+)' in parents and trashed = false$/.exec(url.searchParams.get('q') ?? '')?.[1] : itemId;
    const parent = fixture.items.find(item => item.id === parentId);
    assert.ok(parent?.folder, 'The provider may enumerate only recorded folders');
    if (parent.denied) return new ResponseClass(null, { status: 403 });
    const children = fixture.items.filter(item => item.parent === parentId), page = url.searchParams.get(google ? 'pageToken' : '$skiptoken');
    assert.ok(page === null || page === 'synthetic-slate-207');
    const paged = children.length > 4, selected = paged ? page ? children.slice(4) : children.slice(0, 4) : children;
    return google ? json({ files: selected.map(item => providerItem(item, true)), ...(paged && !page ? { nextPageToken: 'synthetic-slate-207' } : {}) })
      : json({ value: selected.map(item => providerItem(item, false)), ...(paged && !page ? { '@odata.nextLink': `${url.origin}${url.pathname}?$skiptoken=synthetic-slate-207` } : {}) });
  }
  const item = fixture.items.find(item => item.id === itemId);
  assert.ok(item, `Unexpected recorded provider item: ${url.pathname}`);
  if (item.denied && graph) return new ResponseClass(null, { status: 403 });
  if (download || url.pathname.endsWith('/export') || url.searchParams.get('alt') === 'media' || url.pathname.endsWith('/content')) {
    assert.ok(!item.folder && item.id !== fixture.unsupported.id, 'Unsupported and unreadable sources must never be downloaded');
    if (graph) return new ResponseClass(null, { status: 302, headers: { location: `https://synthetic-slate-204.sharepoint.com/downloads/${item.id}` } });
    const bytes = payloads.get(item.id);
    return new ResponseClass(bytes, { headers: { 'content-type': item.mimeType === 'application/pdf' ? 'application/pdf' : word, 'content-length': String(bytes.length) } });
  }
  return json(providerItem(item, google));
}
