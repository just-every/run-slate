import {reportUnmapped,reportWarning} from '../report';
import type {ImportedMember,ImportedPost,ImportReport} from '../types';
import {nameMatches,property,propertyIds,propertyValues,type ConfluenceEntity} from './xml-entities';

function publicationDate(raw:string|undefined,sourceId:string,report:ImportReport):string|undefined {
 if(!raw) {reportUnmapped(report,'Confluence blog publication date is missing; no date was invented',sourceId);return;}
 let value=raw.trim().replace(/^(\d{4}-\d\d-\d\d) /,'$1T');
 if(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)) {
  value+='Z';reportWarning(report,'Confluence blog date has no offset; interpreted as UTC',sourceId,raw);
 }
 const date=new Date(value);
 if(!Number.isFinite(date.getTime())) {reportUnmapped(report,'Confluence blog publication date is invalid; original retained',sourceId,raw);return;}
 return date.toISOString();
}

export function csvPost(row:Record<string,string>,members:ImportedMember[],report:ImportReport):ImportedPost {
 const sourceId=`confluence-page:${row.contentid}`;
 const author=row.creator?.trim();
 const post:ImportedPost={publishedAt:publicationDate(row.creationdate,sourceId,report)};
 if(author) {
  post.authorSourceId=`confluence-member:${author}`;
  const member=members.find(member=>member.sourceId===post.authorSourceId);
  post.authorDisplayName=member?.displayName??author;
  if(!member) {
   members.push({sourceId:post.authorSourceId,sourceIdentityKind:'native',displayName:author,status:'inactive-historical'});
   reportWarning(report,'Confluence blog author has no exported profile; source identity retained as a historical author',sourceId,author);
  }
 } else reportUnmapped(report,'Confluence blog author is missing; importing member was not substituted',sourceId);
 return post;
}

/** Creator object references and scalar user keys are source identities, never account lookups. */
export function xmlPost(entity:ConfluenceEntity,entities:ConfluenceEntity[],members:ImportedMember[],report:ImportReport):ImportedPost {
 const sourceId=`confluence-page:${entity.id}`;
 const post:ImportedPost={publishedAt:publicationDate(property(entity,'creationDate','created'),sourceId,report)};
 const refs=propertyIds(entity,'creator','createdBy');
 if(refs.length!==1) {
  reportUnmapped(report,'Confluence blog author is missing or ambiguous; importing member was not substituted',sourceId,refs.join(', ')||undefined);return post;
 }
 const ref=refs[0]!;
 const users=entities.filter(user=>nameMatches(user,'ConfluenceUserImpl')&&(user.id===ref||propertyValues(user,'key','name','lowerName').includes(ref)));
 if(users.length>1) {reportUnmapped(report,'Confluence blog author references duplicate source identities',sourceId,ref);return post;}
 const user=users[0],keys=user?propertyValues(user,'key'):[],names=user?propertyValues(user,'name'):[],lowerNames=user?propertyValues(user,'lowerName'):[];
 if(keys.length>1||names.length>1||lowerNames.length>1) {reportUnmapped(report,'Confluence blog author has conflicting source identities',sourceId,[...keys,...names,...lowerNames].join(', '));return post;}
 // Match the restriction reader's source identity convention, without matching a destination account.
 const key=keys[0]??names[0]??lowerNames[0]??user?.id??ref;
 post.authorSourceId=`confluence-member:${key}`;
 post.authorDisplayName=user?property(user,'displayName','name')??key:key;
 if(!members.some(member=>member.sourceId===post.authorSourceId))members.push({sourceId:post.authorSourceId,sourceIdentityKind:'native',displayName:post.authorDisplayName,status:'inactive-historical'});
 if(!user)reportWarning(report,'Confluence blog author has no exported profile; source identity retained as a historical author',sourceId,ref);
 return post;
}
