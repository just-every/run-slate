import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const root=process.cwd(),output=process.env.QUAL_EVIDENCE??path.join(os.tmpdir(),'slate-data-proof');
const walk=async directory=>(await Promise.all((await readdir(directory,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(directory,e.name)):[path.join(directory,e.name)]))).flat();
const files=(await walk(path.join(root,'src'))).filter(f=>/\.(ts|tsx)$/.test(f)),flows=[];
for(const file of files){const text=await readFile(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);const visit=node=>{if(ts.isCallExpression(node)&&(/(^|\.)fetch$/.test(node.expression.getText(ast))||node.expression.getText(ast)==='request'&&file.endsWith('/mail/resend.ts')||node.expression.getText(ast)==='fetcher'&&file.endsWith('/notifications/slack.ts'))){const position=ast.getLineAndCharacterOfPosition(node.getStart());flows.push({file:path.relative(root,file),line:position.line+1,expression:node.expression.getText(ast),target:node.arguments[0]?.getText(ast),sha256:createHash('sha256').update(text).digest('hex')});}ts.forEachChild(node,visit);};visit(ast);}
const categories={
 'src/core/platform/mail/resend.ts':'resend-transactional-email',
 'src/core/features/session/oidc.ts':'identity-provider',
 'src/core/features/notifications/slack.ts':'chat-notification-destination',
 'src/core/features/ai/provider.ts':'ai-inference-provider',
 'src/core/features/ai/allowance.ts':'ai-inference-provider',
 'src/core/features/editor/link-preview.ts':'pasted-url-origin + link-preview-dns',
 'src/core/features/connectors/effects.ts':'connected-source-providers',
 'src/core/features/connectors/http.ts':'connected-source-providers',
 'src/core/features/connectors/native.ts':'connected-source-providers',
 'src/core/features/connectors/oauth-provider.ts':'connected-source-providers',
 'src/core/features/collaboration/invalidation.ts':'internal Durable Object binding',
 'src/core/features/collaboration/routes.ts':'internal Durable Object binding',
 'src/server.ts':'internal API/Start request dispatch',
 'src/core/client/transport.ts':'same-origin browser API',
 'src/core/api/request.ts':'same-origin browser API',
};
for(const flow of flows){flow.classification=categories[flow.file];if(!flow.classification)throw Error('Unreviewed outbound call site: '+flow.file+':'+flow.line);}
const tablesSource=await readFile('src/core/features/portability/tables.ts','utf8');
const canonical=JSON.parse(/portableTables = (\[[^;]*\]) as const/.exec(tablesSource)[1]);
const excluded=JSON.parse(/excludedTables = (\[[^;]*\]) as const/.exec(tablesSource)[1]);
const sqlite=new DatabaseSync(':memory:');
for(const file of (await readdir('migrations/core')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(await readFile(path.join('migrations/core',file),'utf8'));
const stores=[...canonical,...excluded].map(table=>({table,columns:sqlite.prepare(`PRAGMA table_info("${table}")`).all().map(c=>({name:c.name,type:c.type,nullable:!c.notnull,primaryKey:!!c.pk})),references:sqlite.prepare(`PRAGMA foreign_key_list("${table}")`).all().map(k=>({column:k.from,table:k.table,target:k.to})),custody:canonical.includes(table)?'canonical-portable':'explicit-excluded',classification:table==='activity_entries'?'retained audit with anonymised references':['sessions','request_limits','content_presence','identity_states','magic_links','federation_oauth_states'].includes(table)?'authentication/session/rate-limit state':table.startsWith('search_')||['page_access_index','discovery_snapshots'].includes(table)?'derived search/access cache':table.startsWith('core_')||table.endsWith('_cursors')?'runtime metadata; inspect content-bearing revisions separately':'potential personal record or dependent metadata; purposeful canary coverage listed separately'}));
await mkdir(output,{recursive:true});await writeFile(path.join(output,'inventory.json'),JSON.stringify({date:new Date().toISOString(),canonicalCount:canonical.length,excludedCount:excluded.length,stores,flows,limits:'Source inventory is not execution proof. Disposable result snapshots are rebuildable; durable saved searches are separate records. No count claims every table populated. Captured HTTP tests prove named boundaries only.'},null,2));
console.log(JSON.stringify({canonical:canonical.length,excluded:excluded.length,fetchCallsites:flows.length,output}));
