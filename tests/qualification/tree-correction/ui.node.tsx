import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PageTree,type TreePage} from '../../../src/core/app/ui/PageTree';
import {TreeMoveDialog} from '../../../src/core/app/ui/TreeMoveDialog';
const base:TreePage={id:'source',title:'Source',containerId:'space',revisionId:'revision',lifecycle:'live',permissions:{level:'edit',canEdit:true}};
for(const level of ['view','comment','edit','full',undefined])test(`SHARE-002: rendered tree move/drag authority for ${level??'unknown'}`,()=>{
 const canEdit=level==='edit'||level==='full';const page={...base,permissions:level?{level,canEdit}:undefined};
 const html=renderToStaticMarkup(<PageTree pages={[page]}/>);
 assert.match(html,new RegExp(`draggable="${canEdit}"`));
 const move=html.match(/<button[^>]*aria-label="Move Source in tree"[^>]*>/)?.[0];assert.ok(move);assert.equal(move.includes('disabled'),!canEdit);
});
test('TREE-002: tree and accessible picker share BINARY ordering across supplementary characters',()=>{
 const pages=[{...base,id:'supplementary',title:'Supplementary',treePosition:'\u{10000}'},{...base,id:'bmp',title:'BMP',treePosition:'\uE000'}];
 const tree=renderToStaticMarkup(<PageTree pages={pages}/>);assert.ok(tree.indexOf('>BMP<')<tree.indexOf('>Supplementary<'));
 const picker=renderToStaticMarkup(<TreeMoveDialog page={base} pages={[base,...pages]} onClose={()=>{}}/>);
 assert.ok(picker.indexOf('label="BMP"')<picker.indexOf('label="Supplementary"'));
 assert.match(picker,/Before BMP/);assert.match(picker,/After BMP/);assert.match(picker,/After the last page/);
});
