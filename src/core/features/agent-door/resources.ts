import type {ResourceDefinition} from '../../../../modules/agent-door/index.ts';
import type {AppBindings} from '../../app/types';
import {readPage} from '../pages/service';
import {readContainer} from '../containers/service';
import {nativeContext,nativeJson} from './context';
import {recordClasses} from './risk';
import {ApiProblem} from '../../app/problems';
export function wikiResources(env:AppBindings):ResourceDefinition[]{
 return ['pages','containers'].map(kind=>({uriTemplate:`slate://${kind}/{id}`,name:kind,mimeType:'application/json',scope:'slate:read',classes:['standard','sensitive'],classify:record=>recordClasses(record.json),
  async read(uri,ctx){
   const match=new RegExp(`^slate://${kind}/([^/?#]+)$`).exec(uri);
   if(!match)return null;
   try{const c=await nativeContext(env,ctx),id=decodeURIComponent(match[1]!);return {json:nativeJson(kind==='pages'?await readPage(c,id):await readContainer(c,id)),untrusted:true};}
   catch(error){if(error instanceof ApiProblem&&(error.status===403||error.status===404))return null;throw error;}
  },
 }));
}
