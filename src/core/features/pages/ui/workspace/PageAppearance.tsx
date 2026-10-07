import {useState} from 'react';
import {ActionDialog} from '../../../../app/ui/ActionDialog';
import {request,mutate,operationKey} from '../../../../client/transport';
import type {DocumentView} from '../../../../client/content';
type Cover={kind:'gallery';id:string}|{kind:'link';url:string};
export const galleries:Record<string,string>={sand:'linear-gradient(120deg,#ead3b0,#b07c55)',ocean:'linear-gradient(120deg,#87bfce,#275c77)',forest:'linear-gradient(120deg,#a6bb98,#36553b)',sunset:'linear-gradient(120deg,#e6b875,#a74b5c)',lavender:'linear-gradient(120deg,#d5c7e8,#7b6a9a)',slate:'linear-gradient(120deg,#bbc3cb,#4e5967)'};
export function StoredIcon({icon}:{icon:unknown}){return typeof icon!=='string'||!icon?null:icon.startsWith('file:')?<img className="stored-page-icon" src={`/api/media/${encodeURIComponent(icon.slice(5))}?display=inline`} alt="Page icon"/>:<span className="stored-page-icon" aria-hidden="true">{icon}</span>;}
export function PageAppearance({document,revision,onSaved}:{document:DocumentView;revision:string;onSaved:(revisionId:string)=>void}){
 const props=document.properties as (NonNullable<DocumentView['properties']>&{cover?:Cover|null})|undefined;
 const [edit,setEdit]=useState<'icon'|'cover'|null>(null),[mode,setMode]=useState('gallery'),[remote,setRemote]=useState(false);
 const cover=props?.cover;
 async function save(properties:object){const result=await mutate<{value:{revisionId:string}}>(`/api/pages/${document.page.id}`,{operationKey:operationKey(),expectedRevisionId:revision,properties},'PATCH');onSaved(result.value.revisionId);}
 return <div className="page-appearance">{props?.coverFileId?<img className="page-cover-image" src={`/api/media/${encodeURIComponent(props.coverFileId)}?display=inline`} alt="Page cover"/>:cover?.kind==='gallery'?<div className="page-cover-image" role="img" aria-label={`${cover.id} gallery cover`} style={{background:galleries[cover.id]}}/>:cover?.kind==='link'?remote?<img className="page-cover-image" src={cover.url} alt="Linked page cover"/>:<button onClick={()=>setRemote(true)}>Load cover from {new URL(cover.url).hostname}</button>:null}
 <StoredIcon icon={props?.icon}/>{document.permissions.canEdit?<div className="page-appearance-actions"><button onClick={()=>{setMode('gallery');setEdit('icon');}}>{props?.icon?'Change icon':'Add icon'}</button><button onClick={()=>{setMode('gallery');setEdit('cover');}}>{cover||props?.coverFileId?'Change cover':'Add cover'}</button></div>:null}
 {edit?<ActionDialog title={edit==='icon'?'Page icon':'Page cover'} action="Save appearance" onClose={()=>setEdit(null)} onSubmit={async form=>{
 if(form.get('remove')==='on'){await save(edit==='icon'?{icon:null}:{cover:null,coverFileId:null});return;}
 if(mode==='upload'){const upload=new FormData();upload.set('file',form.get('file')!);upload.set('pageId',document.page.id);upload.set('operationKey',operationKey());const result=await request<{value:{id:string}}>('/api/media',{method:'POST',body:upload});await save(edit==='icon'?{icon:`file:${result.value.id}`}:{coverFileId:result.value.id});}
 else if(edit==='icon')await save({icon:String(form.get('icon'))});
 else await save({cover:mode==='gallery'?{kind:'gallery',id:String(form.get('gallery'))}:{kind:'link',url:String(form.get('url'))}});
 }}>{edit==='cover'?<label>Cover source<select aria-label="Cover source" value={mode} onChange={e=>setMode(e.target.value)}><option value="gallery">Gallery</option><option value="upload">Upload</option><option value="link">Link</option></select></label>:<label>Icon source<select aria-label="Icon source" value={mode} onChange={e=>setMode(e.target.value)}><option value="gallery">Emoji or supplied symbol</option><option value="upload">Upload</option></select></label>}
 {mode==='upload'?<label>Image<input name="file" type="file" accept="image/*"/></label>:edit==='icon'?<label>Icon<input name="icon" list="page-icon-symbols" defaultValue={typeof props?.icon==='string'?props.icon:''}/><datalist id="page-icon-symbols">{['📄','📚','💡','⭐','🧭','✅'].map(icon=><option key={icon} value={icon}/>)}</datalist></label>:mode==='gallery'?<label>Gallery<select aria-label="Gallery" name="gallery" defaultValue={cover?.kind==='gallery'?cover.id:'sand'}>{Object.keys(galleries).map(id=><option key={id}>{id}</option>)}</select></label>:<label>Cover HTTPS link<input type="url" pattern="https://.*" name="url" defaultValue={cover?.kind==='link'?cover.url:''}/></label>}
 <label><input type="checkbox" name="remove"/>Remove {edit}</label></ActionDialog>:null}
 </div>;
}
