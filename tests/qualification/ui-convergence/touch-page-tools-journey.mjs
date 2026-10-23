import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';
import {expect} from '@playwright/test';
import {ok} from './two-people-support.mjs';
import {tap,type,checkpoint} from './touch-controls.mjs';

const more=async(page,name)=>{await tap(page.getByRole('button',{name:'More',exact:true}));await tap(page.getByRole('menuitem',{name,exact:true}));};

export async function touchPageToolsJourney(touch){
 const {page,context,origin,api,pageId}=touch;
 // A real saved layout is the starting document for the page-tool actions.
 const initial=await api(`/api/pages/${pageId}`);
 const section=randomUUID(),columns=Array.from({length:3},()=>randomUUID());
 const sourceId=initial.blocks.find(block=>block.blockType==='paragraph').id;
 await ok(context,origin,'PUT',`/api/pages/${pageId}/blocks`,{operationKey:randomUUID(),expectedRevisionId:initial.page.revisionId,blocks:[
  {id:section,blockType:'columns',content:{count:3},treePosition:'0'},
  ...columns.map((id,index)=>({id,blockType:'column',content:{},parentBlockId:section,treePosition:`1${index}`})),
  ...initial.blocks.map((block,index)=>({id:block.id,blockType:block.blockType,parentBlockId:columns[index%3],content:block.id===sourceId?{text:[{text:'Response owner confirmed by touch.'}]}:block.content,treePosition:`2${index}`})),
 ]});
 await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 const before=await api(`/api/pages/${pageId}`);
 const original=before.blocks.find(block=>block.blockType==='paragraph'&&JSON.stringify(block.content).includes('Response owner confirmed by touch.'));
 assert.ok(original);
 const entry=(await api(`/api/revisions/${pageId}`)).items.find(item=>item.id===before.workingRevisionId);
 const input=page.locator(`[data-block-id="${original.id}"]`).getByRole('textbox',{name:'Paragraph',exact:true});
 await type(page,input,'A newer draft to compare with the response plan.');
 await expect.poll(async()=>JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('A newer draft to compare');
 await more(page,'History');
 await tap(page.locator('.history-list li').filter({has:page.locator(`time[datetime="${entry.createdAt}"]`)}).getByRole('button'));
 await expect(page.locator('.revision-preview')).toContainText('Response owner confirmed by touch.');
 await expect(page.locator('.revision-preview .slate-column')).toHaveCount(3);
 await checkpoint(page,'history column snapshot');
 await tap(page.getByRole('button',{name:'Restore this revision',exact:true}));
 const restore=page.getByRole('dialog',{name:'Restore this revision?',exact:true});
 await tap(restore.getByRole('button',{name:'Restore revision',exact:true}));
 await expect(restore).toBeHidden();
 await expect.poll(async()=>JSON.stringify((await api(`/api/pages/${pageId}`)).blocks)).toContain('Response owner confirmed by touch.');
 assert.notEqual((await api(`/api/pages/${pageId}`)).workingRevisionId,before.workingRevisionId);
 await checkpoint(page,'history restored');
 const close=page.getByRole('button',{name:'Close details ×',exact:true});
 if(await close.isVisible())await tap(close);
 await more(page,'Details');
 await tap(page.getByRole('button',{name:'Edit labels',exact:true}));
 const labels=page.getByRole('dialog',{name:'Edit page labels',exact:true});
 await type(page,labels.getByRole('textbox',{name:'Labels, separated by commas',exact:true}),'response, duty');
 await tap(labels.getByRole('button',{name:'Save details',exact:true}));
 await expect(labels).toBeHidden();
 await expect.poll(async()=>(await api(`/api/pages/${pageId}`)).properties.labels).toEqual(['duty','response']);
 await checkpoint(page,'page details edited');
 if(await close.isVisible())await tap(close);
 await more(page,'Export page');
 const exporting=page.getByRole('dialog',{name:'Export readable content',exact:true});
 await tap(exporting.getByRole('combobox',{name:'Format',exact:true}));
 await exporting.getByRole('combobox',{name:'Format',exact:true}).selectOption('html');
 await checkpoint(page,'export choices');
 const downloading=page.waitForEvent('download');
 await tap(exporting.getByRole('button',{name:'Download export',exact:true}));
 const download=await downloading,bytes=new Uint8Array(await readFile(await download.path()));
 const entries=unzipSync(bytes),manifest=JSON.parse(new TextDecoder().decode(entries['slate-readable.json']));
 const exported=manifest.pages.find(item=>item.id===pageId);
 assert.ok(exported.blocks.some(block=>block.blockType==='columns'&&block.content.count===3));
 assert.ok(JSON.stringify(exported.blocks).includes('Response owner confirmed by touch.'));
 const cancel=exporting.getByRole('button',{name:'Cancel',exact:true});if(await cancel.isVisible())await tap(cancel);
 await page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 await more(page,'Present this page');
 const presentation=page.getByRole('dialog',{name:'Presenting Field response guide',exact:true});
 await expect(presentation.locator('.slate-column')).toHaveCount(3);
 await expect(presentation.locator('[contenteditable="true"]')).toHaveCount(0);
 await checkpoint(page,'presentation columns');
 await tap(presentation.getByRole('button',{name:'Exit presentation',exact:true}));
 await expect(presentation).toBeHidden();
 const slides=(await ok(context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:touch.containerId,title:'Incident briefing',blocks:[
  {id:randomUUID(),blockType:'heading',content:{text:[{text:'Prepare'}],level:1},treePosition:'0'},
  {id:randomUUID(),blockType:'paragraph',content:{text:[{text:'Confirm the duty lead.'}]},treePosition:'1'},
  {id:randomUUID(),blockType:'heading',content:{text:[{text:'Respond'}],level:1},treePosition:'2'},
  {id:randomUUID(),blockType:'paragraph',content:{text:[{text:'Follow the escalation procedure.'}]},treePosition:'3'},
 ]})).value.pageId;
 await page.goto(`${origin}/app/pages/${slides}`,{waitUntil:'networkidle'});
 const slideRevision=(await api(`/api/pages/${slides}`)).workingRevisionId;
 await more(page,'Present this page');
 const deck=page.getByRole('dialog',{name:'Presenting Incident briefing',exact:true});
 await tap(deck.getByRole('button',{name:'Next',exact:true}));
 await expect(deck.getByRole('article',{name:'Slide 2 of 2',exact:true})).toContainText('Follow the escalation procedure.');
 await tap(deck.getByRole('button',{name:'Previous',exact:true}));
 await expect(deck.getByRole('article',{name:'Slide 1 of 2',exact:true})).toContainText('Confirm the duty lead.');
 await checkpoint(page,'presentation controls');
 await tap(deck.getByRole('button',{name:'Exit presentation',exact:true}));
 assert.equal((await api(`/api/pages/${slides}`)).workingRevisionId,slideRevision);
 console.log('NAV-006 touch history, details, readable export and presentation passed');
}
