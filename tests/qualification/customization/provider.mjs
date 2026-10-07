import assert from 'node:assert/strict';
import {createServer} from 'node:http';
/** Protocol fixture only. These deliberately labelled records cannot qualify inference quality. */
export async function protocolFixture(port){
 const requests=[];
 const server=createServer(async(req,res)=>{try{
 assert.equal(req.headers.authorization,'Bearer mechanics-only-fixture');
 let input='';for await(const part of req)input+=part;
 const body=input?JSON.parse(input):null;requests.push({path:req.url,body});
 let output;
 if(req.url==='/v1/readiness')output={id:'mechanics-fixture-readiness-not-inference',model:'mechanics-fixture',bridgeVersion:'test-protocol',completedAt:new Date().toISOString(),status:'passed',scope:'grounding-schema-and-capability-isolation',receipts:[{fixture:true},{fixture:true}],monetaryCost:null,hardProviderCap:false};
 else {assert.equal(req.url,'/v1/evidence');assert.ok(body.evidence.length);output={model:body.model,toolEvents:0,environmentAccess:false,providerReceipt:'mechanics-fixture-'+requests.length,usage:{inputTokens:10,outputTokens:10,totalTokens:20},output:{statements:[{text:'Protocol fixture: no inference was performed.',kind:'unknown',evidenceIds:[],limitations:['Transport mechanics only.']}],unresolved:['Actual provider quality is unqualified.'],proposedChanges:[],researchPlan:null,hypothesisAssessment:null}};}
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(output));
 }catch(e){res.writeHead(500);res.end(String(e));}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {requests,close:()=>new Promise(resolve=>server.close(resolve))};
}
