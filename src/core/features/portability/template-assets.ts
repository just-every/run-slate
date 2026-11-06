import {ApiProblem} from '../../app/problems';

/** Captured templates own immutable originals, including those kept only by history. */
export function retainedTemplateObjectKeys(tables:Record<string,Record<string,unknown>[]>) {
  const keys=new Set<string>();
  function collect(value:unknown) {
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    const snapshot=value as Record<string,unknown>;
    if(snapshot.snapshot)collect(snapshot.snapshot);
    if(Array.isArray(snapshot.assets))for(const asset of snapshot.assets) {
      const key=asset&&typeof asset==='object'?(asset as Record<string,unknown>).storageKey:undefined;
      if(typeof key!=='string'||!key)
        throw new ApiProblem(409,'TEMPLATE_ASSET_MISSING','A retained template attachment is unavailable.');
      keys.add(key);
    }
    if(Array.isArray(snapshot.children))for(const child of snapshot.children)collect(child);
  }
  for(const row of tables.knowledge_templates??[])collect(JSON.parse(String(row.snapshot_json)));
  for(const row of tables.structured_revisions??[])if(row.entity_kind==='template')collect(JSON.parse(String(row.snapshot_json)));
  return keys;
}

/** Only attachment reference fields move; authored content and original identities stay exact. */
export function restoreTemplateAssets(json:string,keys:Map<string,string>) {
  const value=JSON.parse(json);let changed=false;
  function relocate(input:unknown) {
    if(!input||typeof input!=='object'||Array.isArray(input))return;
    const snapshot=input as Record<string,unknown>;
    if(snapshot.snapshot)relocate(snapshot.snapshot);
    if(Array.isArray(snapshot.assets))for(const item of snapshot.assets) {
      if(item&&typeof item==='object') {
        const asset=item as Record<string,unknown>;
        if(typeof asset.storageKey==='string'&&keys.has(asset.storageKey)&&keys.get(asset.storageKey)!==asset.storageKey){asset.storageKey=keys.get(asset.storageKey)!;changed=true;}
      }
    }
    if(Array.isArray(snapshot.children))for(const child of snapshot.children)relocate(child);
  }
  relocate(value);
  return changed?JSON.stringify(value):json;
}
