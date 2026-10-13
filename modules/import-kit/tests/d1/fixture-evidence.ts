import { chmodSync, closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, realpathSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';

type Fixture = { native(): DatabaseSync };
const inside=(parent:string,child:string):boolean=>{
  const path=relative(parent,child);
  return path!==''&&!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep);
};

/** Evidence is opt-in and confined to the evidence sibling of the configured
 * test scratch directory. Reject symlinks instead of following another tree. */
function outputDirectory(requested:string):string{
  const allowed=realpathSync(resolve(tmpdir(),'..','evidence')), output=resolve(requested);
  if(!inside(allowed,output))throw new Error('IMPORT_TEST_EVIDENCE_PATH');
  let current=allowed;
  for(const part of relative(allowed,output).split(sep)){
    current=join(current,part);
    try{mkdirSync(current,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    const stat=lstatSync(current);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('IMPORT_TEST_EVIDENCE_PATH');
    chmodSync(current,0o700);
  }
  return output;
}

function copyPrivateFile(source:string,destination:string):void{
  const input=openSync(source,'r');
  try{
    const output=openSync(destination,'wx',0o600);
    try{
      const buffer=Buffer.allocUnsafe(64*1024);let bytes:number;
      while((bytes=readSync(input,buffer,0,buffer.length,null))>0){
        let written=0;while(written<bytes)written+=writeSync(output,buffer,written,bytes-written);
      }
    }finally{closeSync(output);}
  }finally{closeSync(input);}
}

function copyDirectory(source:string,destination:string):void{
  for(const entry of readdirSync(source,{withFileTypes:true})){
    const from=join(source,entry.name),to=join(destination,entry.name);
    if(entry.isDirectory()){
      mkdirSync(to,{mode:0o700});copyDirectory(from,to);
    }else if(entry.isFile()){
      copyPrivateFile(from,to);
    }else throw new Error('IMPORT_TEST_EVIDENCE_FILE');
  }
}

function capture(fixture:Fixture,output:string):void{
  const native=fixture.native();
  if(native.isTransaction)throw new Error('IMPORT_TEST_EVIDENCE_ACTIVE_TRANSACTION');
  // Resolve the actual current connection, including after a fixture reopen.
  const databases=native.prepare('PRAGMA database_list').all();
  const main=databases.find(row=>row.name==='main');
  if(!main||typeof main.file!=='string'||!main.file)throw new Error('IMPORT_TEST_EVIDENCE_DATABASE');
  const source=realpathSync(dirname(main.file)),scratch=realpathSync(tmpdir());
  if(!inside(scratch,source)||!lstatSync(join(source,basename(main.file))).isFile())throw new Error('IMPORT_TEST_EVIDENCE_DATABASE');
  const destination=mkdtempSync(join(output,'sqlite-'));chmodSync(destination,0o700);
  // Synchronous copying happens with no fixture operation in flight, before
  // close/removal. Include every file in this exact directory, including WAL/SHM.
  copyDirectory(source,destination);
}

/** Preserve the factory and its cleanup callback. Only the opt-in wrapper adds
 * a synchronous quiescent witness immediately before the original after hook. */
export function withFixtureEvidence<T extends Fixture>(factory:(t:any)=>Promise<T>):(t:any)=>Promise<T>{
  return async t=>{
    const requested=process.env.IMPORT_KIT_TEST_EVIDENCE_DIR;
    if(!requested)return factory(t);
    const output=outputDirectory(requested);let fixture:T|undefined,captured=false;
    const context=new Proxy(t,{get(target,key,receiver){
      if(key!=='after')return Reflect.get(target,key,receiver);
      return (callback:(...args:any[])=>unknown,options?:unknown)=>target.after(function(this:unknown,...args:any[]){
        try{
          if(!captured){
            if(!fixture)throw new Error('IMPORT_TEST_EVIDENCE_FACTORY_INCOMPLETE');
            capture(fixture,output);captured=true;
          }
        }catch(error){
          // A witness failure must not suppress the unchanged cleanup or turn
          // an unavailable witness into a successful evidence claim.
          return Promise.resolve().then(()=>callback.apply(this,args)).then(()=>{throw error;});
        }
        return callback.apply(this,args);
      },options);
    }});
    fixture=await factory(context);
    return fixture;
  };
}
