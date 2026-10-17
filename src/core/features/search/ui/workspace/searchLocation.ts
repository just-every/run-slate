import {emptyRefinements} from './SearchRefinements';

/** Retain a user's submitted search through reload and browser Back, never its results or authority. */
export function searchLocation(search:string){
 const params=new URLSearchParams(search);
 return {query:params.get('q')??'',submitted:params.has('q')?params.get('q')??'':undefined,
  kind:params.get('kind')??'',archived:params.get('includeArchived')==='true',
  refinements:{...emptyRefinements,
   containerId:params.get('containerId')??'',contributorId:params.get('contributorId')??'',
   status:params.get('status')??'',label:params.get('label')??'',sort:params.get('sort')??'',updatedFrom:params.get('updatedFrom')??'',updatedTo:params.get('updatedTo')??'',
   includeTrashed:params.get('includeTrashed')==='true'}};
}

export function submittedSearch(query:string,kind:string,archived:boolean,refinements:typeof emptyRefinements){
 const params=new URLSearchParams({q:query});
 if(kind)params.set('kind',kind);
 if(archived)params.set('includeArchived','true');
 for(const [key,value] of Object.entries(refinements))if(value!==''&&value!==false)params.set(key,String(value));
 return params.toString();
}
