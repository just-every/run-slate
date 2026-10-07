import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typedInline,typedBlock} from '../../../src/core/features/editor/ui/typedFormatting';
import {sliceRichText} from '../../../src/core/features/editor/ui/sliceRichText';
test('BLOCK-004: a partially typed bold delimiter stays literal until complete',()=>{assert.equal(typedInline([{text:'**word*'}]),null);assert.deepEqual(typedInline([{text:'before **word**'}]),[{text:'before '},{text:'word',marks:['bold']}]);});
test('BLOCK-004: each block conversion preserves identity and leaves the original typed input available for undo',()=>{for(const [text,type] of [['# ','heading'],['- ','list'],['> ','quote'],['```','code'],['---','divider']]){const before={id:'block',type:'paragraph' as const,text:[{text}]};const converted=typedBlock(before);assert.equal(converted?.type,type);assert.equal(converted?.id,'block');assert.equal(before.text[0].text,text);}});
test('BLOCK-002 BLOCK-003 AI-017: UTF16 slicing preserves outside marks, links and anchors',()=>{const text=[{text:'Before ',marks:['bold' as const]},{text:'😀selection',commentAnchorId:'anchor',link:{href:'https://example.invalid'}},{text:' after',marks:['italic' as const]}];assert.deepEqual(sliceRichText(text,0,7),[text[0]]);assert.deepEqual(sliceRichText(text,9,18),[{...text[1],text:'selection'}]);assert.deepEqual(sliceRichText(text,18),[text[2]]);});
