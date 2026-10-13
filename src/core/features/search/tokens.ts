/** ASCII tokens over UTF-16 units preserve JavaScript's literal substring semantics.
 * Fold before encoding. Tokenizers must never interpret user punctuation or Unicode.
 */
function grams(value:string,width:number):string[] {
 const tokens=new Set<string>();
 for(let i=0;i<=value.length-width;i++)tokens.add('g'+width+'x'+Array.from({length:width},(_,j)=>value.charCodeAt(i+j).toString(16).padStart(4,'0')).join('x'));
 return [...tokens];
}
export function indexTokens(title:string,text:string):string {
 return [...new Set([title,text].flatMap(value=>[...grams(value,1),...grams(value,2)]))].join(' ');
}
/** At most 16 necessary anchors; exact matching still checks every original term. */
export function candidateMatch(terms:string[]):string {
 const tokens=terms.flatMap(term=>{
  const values=grams(term,term.length===1?1:2);
  return [values[0],values[Math.floor(values.length/3)],values[Math.floor(2*values.length/3)],values.at(-1)];
 });
 return [...new Set(tokens.filter((v):v is string=>!!v))].slice(0,16).map(v=>'"'+v+'"').join(' AND ');
}
