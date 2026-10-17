import {useState} from 'react';
import {galleries} from '../../pages/ui/workspace/PageAppearance';
import type {PostFeedItem} from '../types';

/** Linked covers keep the page's explicit consent before contacting another site. */
export function PostCover({post}:{post:PostFeedItem}) {
 const [loadRemote,setLoadRemote]=useState(false),cover=post.cover;
 const style={width:'100%',height:180,objectFit:'cover' as const,borderRadius:8};
 if(post.coverUrl)return <img src={post.coverUrl} alt="Post cover" loading="lazy" style={style}/>;
 if(cover?.kind==='gallery'&&galleries[cover.id])return <div role="img" aria-label={`${cover.id} gallery cover`} style={{...style,background:galleries[cover.id]}}/>;
 if(cover?.kind==='link') {
  let url:URL;try{url=new URL(cover.url);}catch{return null;}
  if(url.protocol!=='https:')return null;
  return loadRemote?<img src={url.href} alt="Linked post cover" style={style}/>:<button type="button" onClick={()=>setLoadRemote(true)}>Load cover from {url.hostname}</button>;
 }
 return null;
}
