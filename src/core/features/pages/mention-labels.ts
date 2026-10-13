/**
 * LINK-004: a page mention stores the target's title as it was when written. Every
 * door that hands content to a reader replaces that text with the label this
 * reader may see, so stored titles never leave the server.
 */
export function labelPageMentions<T>(value:T,label:(id:string)=>string):T {
    if(Array.isArray(value))return value.map(item=>labelPageMentions(item,label)) as T;
    if(!value||typeof value!=='object')return value;
    const record=value as Record<string,any>;
    if(record.mention?.kind==='page'&&typeof record.mention.id==='string'){const text=label(record.mention.id);return {...record,text,mention:{...record.mention,label:text}} as T;}
    return Object.fromEntries(Object.entries(record).map(([key,item])=>[key,labelPageMentions(item,label)])) as T;
}
