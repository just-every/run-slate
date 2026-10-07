import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {evaluateBridge} from './readiness.mjs';
import {runEvidenceTask} from './codex.mjs';
import {taskSchema,answerSchema,outputSchema,taskPrompt} from './task.mjs';
const token=process.env.SLATE_AI_LOCAL_TOKEN,model=process.env.SLATE_AI_MODEL;
if(!token||token.length<32||!model)throw new Error('SLATE_AI_LOCAL_TOKEN (32+ characters) and SLATE_AI_MODEL are required.');
const evaluation=await evaluateBridge(model);
let running=false,activeController=null;
const server=createServer(async(req,res)=>{
 const auth=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${token}`);
 const fail=(status,code)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({code}));};
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||auth.length!==expected.length||!timingSafeEqual(auth,expected))return fail(401,'UNAUTHENTICATED');
 if(req.method==='GET'&&req.url==='/v1/readiness'&&!req.headers.origin){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(evaluation));}
 if(req.method!=='POST'||req.url!=='/v1/evidence'||req.headers.origin)return fail(404,'NOT_FOUND');if(running)return fail(429,'BRIDGE_BUSY');
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>512000)return fail(413,'PAYLOAD_TOO_LARGE');chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{return fail(400,'INVALID_JSON');}
 const parsed=taskSchema.safeParse(body);if(!parsed.success||body.model!==model)return fail(400,'INVALID_TASK');
 running=true;const controller=new AbortController();activeController=controller;res.on('close',()=>{if(!res.writableEnded)controller.abort();});try{const result=await runEvidenceTask({model,prompt:taskPrompt(parsed.data),schema:outputSchema,signal:controller.signal});answerSchema.parse(result.output);const issued=new Set(parsed.data.evidence.map(e=>e.id));if([...result.output.statements,...result.output.proposedChanges].some(s=>s.evidenceIds.some(id=>!issued.has(id))))throw new Error('Invalid evidence');res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch{fail(503,'LOCAL_INFERENCE_FAILED');}finally{running=false;activeController=null;}
});
server.listen(Number(process.env.SLATE_AI_LOCAL_PORT??4397),'127.0.0.1',()=>console.log('Slate evidence-only local inference bridge listening on loopback.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{activeController?.abort();server.close(()=>process.exit(0));});
