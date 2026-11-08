import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
const mod=relative=>import(pathToFileURL(path.join(root,relative)).href);
const {withWorkspace,setupWorkspace}=await mod('tests/qualification/ui-convergence/browser-support.mjs');
const {withSecondPerson}=await mod('tests/qualification/ui-convergence/two-people-support.mjs');
const name=path.join(root,'tests/qualification/ui-convergence/decision-layer-journey.mjs');
let source=process.env.SLATE_PROBE_ORIGINAL==='1'?execFileSync('git',['show','20880dc2358c4259312f7ebf1263534d95bf290f:tests/qualification/ui-convergence/decision-layer-journey.mjs'],{cwd:root,encoding:'utf8'}):await readFile(name,'utf8');
source=source.replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,relative)=>`from '${pathToFileURL(path.resolve(path.dirname(name),relative)).href}'`);
const line="    const edited=await capture('/api/decisions',()=>view.getByRole('button',{name:'Save proposed decision',exact:true}).click());";
assert.ok(source.includes(line));
source=source.replace(line,`    // Diagnostic only: delay delivery of a genuine committed refresh, not its content.
    await view.route(url=>url.pathname===\`/api/decisions/\${decisionId}\`,async route=>{
      if(route.request().method()!=='GET')return route.continue();
      const response=await route.fetch({maxRetries:0});
      const saved=await response.json();
      const matches=await view.getByRole('article').getByText('Second procedure',{exact:true}).evaluateAll(elements=>elements.map(element=>({tag:element.tagName,text:element.textContent,visible:element.checkVisibility(),details:element.closest('details')?{summary:element.closest('details').querySelector('summary')?.textContent,open:element.closest('details').open}:null})));
      await writeFile(process.env.SLATE_PROBE_REPORT??'/tmp/locator-diagnostic.json',JSON.stringify({mode:'delay genuine GET delivery 6000 ms',nativeRevision:saved.revision_id,nativeOutcome:saved.content.outcome,matches,displayedParagraphs:await view.getByRole('article').locator(':scope > p').allTextContents()},null,2));
      await new Promise(resolve=>setTimeout(resolve,6000));
      await route.fulfill({response}).catch(()=>{});
    },{times:1});
`+line);
source=source.replace("from '@playwright/test'","from '"+pathToFileURL(path.join(root,'node_modules/@playwright/test/index.mjs')).href+"'");
source+='\n//# sourceURL=/tmp/slate-diagnostic-journey.mjs\n';
const {decisionLayerJourney}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
await withWorkspace({width:1440,height:1000},'core-wiki',async state=>{
  await setupWorkspace(state);
  await withSecondPerson(state,1440,people=>decisionLayerJourney(state,people));
});
