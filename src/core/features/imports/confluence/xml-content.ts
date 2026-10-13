import {nameMatches,property,propertyId,propertyIds,referenceIds,type ConfluenceEntity} from './xml-entities';
import {xmlText} from '../xml';
import {reportUnmapped} from '../report';
import type {ImportReport} from '../types';

/** Resolve Server/DC entity references before converting body or label text. */
export function xmlContent(entities:ConfluenceEntity[], report:ImportReport) {
  const byId=new Map(entities.map(entity=>[entity.id,entity]));
  const bodies=new Map<string,ConfluenceEntity[]>();
  const assignedLabels=new Map<string,Set<string>>();
  const add=(content:string,label:string)=>{const labels=assignedLabels.get(content)??new Set<string>();labels.add(label);assignedLabels.set(content,labels);};
  for(const entity of entities){
    if(nameMatches(entity,'BodyContent')){
      for(const owner of propertyIds(entity,'content','contentId','page','pageId')){const list=bodies.get(owner)??[];list.push(entity);bodies.set(owner,list);}
    }
    if(nameMatches(entity,'Labelling')){
      const owner=propertyId(entity,'content','contentId','page','pageId');
      const label=byId.get(propertyId(entity,'label','labelId')??'');
      const name=label&&property(label,'name');if(owner&&name)add(owner,name);
    }
  }
  return {
    body(entity:ConfluenceEntity):string {
      const refs=[...new Set([...propertyIds(entity,'bodyContents','bodyContent','bodyContentId'),...referenceIds(entity.properties.get('body'))])];
      const candidates=[...(bodies.get(entity.id)??[]),...refs.map(id=>byId.get(id)).filter((item):item is ConfluenceEntity=>!!item&&nameMatches(item,'BodyContent'))];
      const unique=[...new Set(candidates)];
      const inconsistent=refs.some(id=>!byId.has(id)||!nameMatches(byId.get(id)!,'BodyContent'))||unique.some(item=>propertyIds(item,'content','contentId','page','pageId').some(id=>id!==entity.id));
      if(unique.length>1||inconsistent){reportUnmapped(report,'Confluence body references are ambiguous or unresolved',`confluence-page:${entity.id}`,`BodyContent references: ${[...new Set([...refs,...unique.map(item=>item.id)])].join(', ')}. Original retained; body not published.`);return '';}
      const linked=unique[0];
      return linked?property(linked,'body','bodyAsString')??'':property(entity,'bodyAsString')??(referenceIds(entity.properties.get('body')).length?'':property(entity,'body')??'');
    },
    labels(entity:ConfluenceEntity):string[] {
      const result=new Set(assignedLabels.get(entity.id)??[]);
      for(const name of ['labels','label','labellings']){
        const value=entity.properties.get(name);if(!value)continue;
        const refs=referenceIds(value);
        for(const id of refs){const target=byId.get(id);if(!target)continue;const label=nameMatches(target,'Labelling')?byId.get(propertyId(target,'label','labelId')??''):target;const text=label&&nameMatches(label,'Label')?property(label,'name'):undefined;if(text)result.add(text);}
        if(!refs.length){const text=xmlText(value).trim();if(text&&text.length<256)result.add(text);}
      }
      return [...result];
    },
  };
}
