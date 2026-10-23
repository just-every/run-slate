import {z} from 'zod';
import {ApiProblem} from '../../../app/problems';
import {validateValue,type Field} from '../values';
export const formFieldTypes=['text','number','checkbox','date','select','status','multi-select','url','email','phone','place'] as const;
const condition=z.object({fieldId:z.string().min(1).max(160),equals:z.union([z.string().max(10000),z.number().finite(),z.boolean()])}).strict();
export const formDefinitionSchema=z.object({
 members:z.boolean(),anonymous:z.boolean(),guestIds:z.array(z.string().min(1).max(160)).max(100),
 questions:z.array(z.object({fieldId:z.string().min(1).max(160),label:z.string().trim().min(1).max(200),help:z.string().max(2000).default(''),required:z.boolean(),when:condition.nullable()}).strict()).max(40)
}).strict();
export type FormDefinition=z.infer<typeof formDefinitionSchema>;
export function validateDefinition(definition:FormDefinition,fields:Field[]){
 const seen=new Map<string,FormDefinition['questions'][number]>();
 for(const question of definition.questions){
  const field=fields.find(f=>f.id===question.fieldId);
  if(!field||!formFieldTypes.some(type=>type===field.type)||seen.has(field.id))throw new ApiProblem(400,'INVALID_FORM','Choose distinct supported database fields.');
  if(question.when){
   const source=seen.get(question.when.fieldId),sourceField=fields.find(f=>f.id===question.when!.fieldId);
   if(!source||source.when||!sourceField||sourceField.type==='multi-select')throw new ApiProblem(400,'INVALID_FORM','A condition must use an earlier unconditional question.');
   validateValue(sourceField,question.when.equals);
  }
  seen.set(field.id,question);
 }
}
export function visibleQuestion(question:FormDefinition['questions'][number],values:Record<string,unknown>){return !question.when||values[question.when.fieldId]===question.when.equals;}
export function formValues(definition:FormDefinition,fields:Field[],input:Record<string,unknown>){
 validateDefinition(definition,fields);
 const selected=new Set(definition.questions.map(q=>q.fieldId));
 if(Object.keys(input).some(id=>!selected.has(id)))throw new ApiProblem(400,'INVALID_FORM_ANSWER','Only published questions can be submitted.');
 const values:Record<string,unknown>={};
 for(const q of definition.questions){
  if(!visibleQuestion(q,values)){if(Object.hasOwn(input,q.fieldId))throw new ApiProblem(400,'INVALID_FORM_ANSWER','A hidden question cannot be submitted.');continue;}
  const field=fields.find(f=>f.id===q.fieldId)!,value=validateValue(field,input[q.fieldId]);
  if(q.required&&(value===null||Array.isArray(value)&&!value.length))throw new ApiProblem(400,'FORM_REQUIRED',`Answer ${q.label}.`);
  if(typeof value==='string'&&value.length>10000)throw new ApiProblem(400,'INVALID_FORM_ANSWER','An answer is too long.');
  if(value!==null)values[q.fieldId]=value;
 }
 return values;
}
