import {createHash} from 'node:crypto';
import {compactSqlValues,type StoredSqlValues} from './compact-sql-values';

const bucket=(key:string)=>{
 const bytes=createHash('sha256').update(key).digest();
 return ((bytes[0]!&0x3f)*0x1000000)+(bytes[1]!*0x10000)+(bytes[2]!*0x100)+bytes[3]!;
};
const detach=(value:string)=>JSON.parse(JSON.stringify(value)) as string;
const slotsPerPage=65536;

/** Exact insertion-ordered string ledger. A small numeric bucket index locates
 * compressed keys; every lookup compares the full key, including collisions.
 * UTF-8 hash collisions (including distinct lone-surrogate strings) retain
 * distinct keys because the original JavaScript strings decide equality. */
export class CompactStringMap implements Iterable<[string,string]> {
 private readonly values=compactSqlValues();
 private readonly pages:{page:StoredSqlValues['page'];count:number}[]=[];
 private readonly index=new Map<number,number|number[]>();
 private readonly updates=new Map<number,string>();
 private count=0;
 constructor(initial:Iterable<readonly [string,string]>=[]){for(const [key,value]of initial)this.set(key,value);}
 get size(){return this.count;}
 private read(position:number):[string,string]{
  const page=this.pages[Math.floor(position/slotsPerPage)]!.page,index=position%slotsPerPage;
  return this.values.read({page,index}) as [string,string];
 }
 private find(key:string,hash=bucket(key)):number|undefined {
  const candidates=this.index.get(hash);if(candidates===undefined)return undefined;
  for(const position of typeof candidates==='number'?[candidates]:candidates)if(this.read(position)[0]===key)return position;
  return undefined;
 }
 has(key:string){return this.find(key)!==undefined;}
 get(key:string):string|undefined {const position=this.find(key);return position===undefined?undefined:detach(this.updates.get(position)??this.read(position)[1]);}
 set(key:string,value:string):this {
  const hash=bucket(key),prior=this.find(key,hash);
  if(prior!==undefined){this.updates.set(prior,detach(value));return this;}
  const retained=this.values.add([key,value]);
  if(this.pages.at(-1)?.page!==retained.page)this.pages.push({page:retained.page,count:0});
  const last=this.pages.at(-1)!;last.count++;
  if(retained.index>=slotsPerPage)throw new Error('Native string ledger page overflow.');
  const position=(this.pages.length-1)*slotsPerPage+retained.index,candidates=this.index.get(hash);
  this.index.set(hash,candidates===undefined?position:typeof candidates==='number'?[candidates,position]:[...candidates,position]);this.count++;return this;
 }
 *[Symbol.iterator]():Iterator<[string,string]>{
  for(let page=0;page<this.pages.length;page++)for(let index=0;index<this.pages[page]!.count;index++){
   const position=page*slotsPerPage+index,[key,value]=this.read(position);
   yield [detach(key),detach(this.updates.get(position)??value)];
  }
 }
}
