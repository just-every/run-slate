import {env} from 'cloudflare:test';
import {test,expect,beforeEach,afterEach,vi} from 'vitest';
import {fixture,reset} from './fixture';
import {startImport,runImport} from '../../../src/core/features/imports/jobs';
import {search} from '../../../src/core/features/search/service';
beforeEach(reset);afterEach(()=>vi.unstubAllGlobals());
test('IMP-004 — persistent HTML import never fetches missing remote attachments and sanitizes executable markup',async()=>{
 const f=await fixture(),network=vi.fn(()=>{throw Error('Imports must never issue network requests');});vi.stubGlobal('fetch',network);
 const job=await startImport(f.context(),{operationKey:'hostile-import',format:'html',source:{name:'unsafe.html',bytes:new TextEncoder().encode('<html><head><title>Safe imported title</title></head><body><h1>Safe imported title</h1><script>alert("bad")</script><p onclick="alert(1)">Retained safe words <a href="javascript:alert(1)">label</a></p><img src="https://outside.test/private.png" onerror="alert(1)"></body></html>')}}),result=await runImport(f.context(),job.id);
 expect(result.state).toBe('completed');expect(network).not.toHaveBeenCalled();const blocks=(await env.DB.prepare('SELECT content_json FROM page_blocks').all()).results;expect(JSON.stringify(blocks)).not.toContain('onclick');expect(JSON.stringify(blocks)).not.toContain('javascript:');expect(JSON.stringify(blocks)).not.toContain('alert(');expect(result.report_json).toContain('outside.test/private.png');
 expect((await search(f.context(),{query:'Retained safe words'})).items.length).toBeGreaterThan(0);
});
