/** Semantic identifier slots shared by retained intelligence and legacy snapshots.
 * Traverse nested objects without treating prose (instructions, questions, text,
 * findings, names or statements) as provenance. Keep both deployed SQL-column
 * spellings and the camel-case API snapshot spellings. No ID-shape heuristics.
 */
const identifierFields = [
 'sourceId','revisionId','sourceRevisionId','passageId','pageId','pageRevisionId','sourcePageId',
 'skillId','skillRevisionId','methodRevisionId','runId','parentRunId','parentInquiryId',
 'inquiryId','hypothesisId','experimentId','effectId','decisionId','targetId','entityId',
 'candidateRunId','genericRunId','expertRunId','judgeRunId','caseSetId','evaluationId',
 'evaluationCaseSetId','trialId','scopeId','ambientEventId','eventId','rankedEventId',
 'guidedTaskId','taskId','stepId','versionId','methodRevision','workingRevisionId',
 'expectedPageRevisionId','expectedRevisionId',
 'supersedesId','previousRevisionId','newRevisionId',
 'source_id','revision_id','source_revision_id','page_id','page_revision_id',
 'skill_id','skill_revision_id','method_revision_id','run_id','parent_id','inquiry_id',
 'hypothesis_id','experiment_id','effect_id','decision_id','target_id','entity_id',
 'current_revision_id',
];
const identifierArrays = [
 'sourceIds','revisionIds','pageIds','sourcePageIds','runIds','records',
 'refs','references','citations','inputRevisions','refs_json','source_refs_json',
 'input_revisions_json','source_scope_json','records_json',
];
const sqlList=(values:string[])=>values.map(value=>`'${value}'`).join(',');

/** The parent join distinguishes strings in ID arrays from strings in prose arrays. */
export function referenceValues(document:string,rootIds=false){
 return `SELECT j.value FROM json_tree(${document}) j LEFT JOIN json_tree(${document}) p ON p.id=j.parent WHERE j.type='text' AND (j.key IN (${sqlList(identifierFields)}) OR (typeof(j.key)='integer' AND (p.key IN (${sqlList(identifierArrays)})${rootIds?" OR p.fullkey='$'":''})))`;
}

export function referencesAny(document:string,idsSql:string,rootIds=false){
 return `EXISTS(SELECT 1 FROM (${referenceValues(document,rootIds)}) WHERE value IN (${idsSql}))`;
}
