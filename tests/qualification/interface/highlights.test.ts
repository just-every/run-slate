import assert from 'node:assert/strict';
import test from 'node:test';
import {highlightTerms} from '../../../src/core/features/search/ui/workspace/SearchHighlight';
test('SEARCH-002: router arrays and encoded repeated query terms retain only actual strings',()=>{
 assert.deepEqual(highlightTerms(['phrase','second','phrase']),['phrase','second']);
 assert.deepEqual(highlightTerms('["phrase","second"]'),['phrase','second']);
 assert.deepEqual(highlightTerms('["phrase",2,null,{}]'),['phrase']);
 assert.deepEqual(highlightTerms('[broken'),[]);
 assert.deepEqual(highlightTerms('phrase'),['phrase']);
});
