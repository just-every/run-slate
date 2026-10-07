import {test,expect} from 'vitest';
import {scenario,key,rows} from '../policies/helpers';
import {createPage} from '../../../src/core/features/pages/service';
import {saveDecision,acceptDecision,removeDecision,getDecision} from '../../../src/core/features/decisions/service';
import {gatherEvidence} from '../../../src/core/features/ai/gather';
import {resolveEvidence} from '../../../src/core/features/ai/evidence';

test('DEC AI-013 discovery selects the exact current accepted revision after three removed layers at tied acceptance times',async()=>{
 const {owner,containerId}=await scenario();
 const p=await createPage(owner,{operationKey:key('gather-page'),containerId,title:'Current decisions'});
 const base={pageId:p.value.pageId,question:'Which option?',options:['A','B'],outcome:'A',rationale:'Evidence',ownerId:owner.actor.id,decidedAt:null,reviewAt:null,citations:[]};
 const removed=[];
 for(let i=0;i<3;i++){
  const draft=await saveDecision(owner,{...base,operationKey:key('gather-old')});
  const accepted=await acceptDecision(owner,{id:draft.value.id,operationKey:key('gather-accept-old'),expectedRevisionId:draft.value.revisionId});
  await removeDecision(owner,{id:draft.value.id,operationKey:key('gather-remove'),expectedRevisionId:accepted.value.revisionId});removed.push({id:draft.value.id,revisionId:accepted.value.revisionId});
 }
 const draft=await saveDecision(owner,{...base,operationKey:key('gather-current')});
 const accepted=await acceptDecision(owner,{id:draft.value.id,operationKey:key('gather-accept-current'),expectedRevisionId:draft.value.revisionId});
 const reference={kind:'decision' as const,sourceId:draft.value.id,revisionId:accepted.value.revisionId};
 expect(await resolveEvidence(owner,[reference],[owner.actor.id],{current:true})).toHaveLength(1);
 const gathered=await gatherEvidence(owner,p.value.pageId,'',[],[owner.actor.id]);
 expect(gathered.refs.filter(r=>r.kind==='decision')).toEqual([reference]);
 expect(new Set((await rows("SELECT created_at FROM intelligence_revisions WHERE entity_kind='decision-acceptance' AND entity_id IN (SELECT id FROM knowledge_decisions WHERE page_id=?)",p.value.pageId)).map(r=>r.created_at)).size).toBe(1);
 for(const old of removed){expect((await getDecision(owner,old.id,old.revisionId)).viewedRevisionId).toBe(old.revisionId);}
});
