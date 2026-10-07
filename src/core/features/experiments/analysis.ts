import { z } from 'zod';
import { ApiProblem } from '../../app/problems';
export const seriesSchema=z.array(z.number().finite()).min(2).max(10000);
export function describe(values:number[]){seriesSchema.parse(values);const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n,variance=values.reduce((sum,x)=>sum+(x-mean)**2,0)/(n-1);return {n,mean,variance};}
/** Two-sided 95% conservative t bound; df=floor(min(n1,n2)-1), not a normal bound for tiny samples. */
export function compare(treatment:number[],comparison:number[]){const t=describe(treatment),c=describe(comparison);const df=Math.min(t.n,c.n)-1;const critical=df<2?12.706:df<3?4.303:df<4?3.182:df<5?2.776:df<6?2.571:df<8?2.447:df<10?2.365:df<15?2.262:df<20?2.145:df<30?2.093:df<60?2.045:2;const effect=c.mean-t.mean;const halfWidth=critical*Math.sqrt(t.variance/t.n+c.variance/c.n);return {treatment:t,comparison:c,effect,lower:effect-halfWidth,upper:effect+halfWidth,halfWidth,confidence:0.95,engine:'difference-means-conservative-t-v1'};}
export interface OutcomeInput {treatment:number[];comparison:number[];meaningfulEffect:number;maximumHalfWidth:number;guardrailBreached:boolean;completeExposure:boolean;instrumentationUnchanged:boolean;windowEnded:boolean}
export function classifyOutcome(input:OutcomeInput){
 if(!input.windowEnded)throw new ApiProblem(409,'WINDOW_OPEN','The predeclared observation window has not ended.');
 if(input.guardrailBreached)return {classification:'adverse' as const,disconfirms:false,reason:'The predeclared support guardrail was breached.'};
 if(!input.completeExposure||!input.instrumentationUnchanged||input.treatment.length<2||input.comparison.length<2)return {classification:'inconclusive' as const,disconfirms:false,reason:'Exposure, measurement stability or sample coverage is incomplete.'};
 const estimate=compare(input.treatment,input.comparison);
 if(estimate.upper<0)return {classification:'adverse' as const,disconfirms:true,estimate,reason:'The interval supports a harmful effect.'};
 if(estimate.lower>=input.meaningfulEffect&&estimate.halfWidth<=input.maximumHalfWidth)return {classification:'benefit' as const,disconfirms:false,estimate,reason:'The interval supports the predeclared meaningful improvement.'};
 if(estimate.upper<input.meaningfulEffect&&estimate.halfWidth<=input.maximumHalfWidth)return {classification:'null' as const,disconfirms:true,estimate,reason:'The test is precise enough to rule out the predeclared meaningful benefit.'};
 return {classification:'inconclusive' as const,disconfirms:false,estimate,reason:'The interval does not resolve the predeclared meaningful effect.'};
}
export function allocate(items:{id:string;cost:number;value:number}[],capacity:number){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>100000||items.length>200||items.some(i=>!Number.isSafeInteger(i.cost)||i.cost<1||!Number.isFinite(i.value)))throw new ApiProblem(400,'INVALID_ALLOCATION','Use bounded integer capacity and finite values.');
 const dp:{value:number;ids:string[]}[]=Array.from({length:capacity+1},()=>({value:0,ids:[]}));for(const item of items)for(let cap=capacity;cap>=item.cost;cap--){const prior=dp[cap-item.cost]!;if(prior.value+item.value>dp[cap]!.value)dp[cap]={value:prior.value+item.value,ids:[...prior.ids,item.id]};}return {engine:'knapsack-01-v1',capacity,...dp[capacity],feasibilityOnly:true};
}
