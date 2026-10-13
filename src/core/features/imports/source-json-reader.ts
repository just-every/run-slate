/** A retained source is a JSON object containing a small manifest and an array
 * of independently bounded units. Parse values across transport chunks without
 * ever joining the outer object or its units array into one string. */
export class SourceJsonReader {
 private readonly reader:ReadableStreamDefaultReader<Uint8Array>;
 private readonly decoder=new TextDecoder('utf-8',{fatal:true});
 private buffer='';private position=0;private done=false;
 constructor(body:ReadableStream<Uint8Array>){this.reader=body.getReader();}
 private async available():Promise<boolean>{
  while(this.position===this.buffer.length&&!this.done){
   const next=await this.reader.read();this.position=0;
   if(next.done){this.done=true;this.buffer=this.decoder.decode();}
   else this.buffer=this.decoder.decode(next.value,{stream:true});
  }
  return this.position<this.buffer.length;
 }
 async peek():Promise<string>{
  while(await this.available()){
   while(this.position<this.buffer.length&&/[ \t\r\n]/.test(this.buffer[this.position]!))this.position++;
   if(this.position<this.buffer.length)return this.buffer[this.position]!;
  }
  return '';
 }
 async expect(character:string){if(await this.peek()!==character)throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');this.position++;}
 async value():Promise<unknown>{
  const first=await this.peek();if(!first)throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
  const parts:string[]=[];let depth=0,string=false,escape=false,started=false;
  const structured=first==='{'||first==='[',quoted=first==='"';
  for(;;){
   if(!await this.available())throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');
   const start=this.position;
   while(this.position<this.buffer.length){
    const character=this.buffer[this.position]!;
    if(!string&&!structured&&!quoted&&started&&/[ \t\r\n,\]}:]/.test(character)){parts.push(this.buffer.slice(start,this.position));return JSON.parse(parts.join(''));}
    this.position++;started=true;
    if(string){if(escape)escape=false;else if(character==='\\')escape=true;else if(character==='"')string=false;}
    else if(character==='"')string=true;
    else if(character==='{'||character==='[')depth++;
    else if(character==='}'||character===']')depth--;
    if((structured&&depth===0)||(quoted&&!string)){
     parts.push(this.buffer.slice(start,this.position));return JSON.parse(parts.join(''));
    }
   }
   parts.push(this.buffer.slice(start,this.position));
  }
 }
 async end(){if(await this.peek())throw new Error('IMPORT_NATIVE_SOURCE_CHANGED');}
 async close(){await this.reader.cancel();this.reader.releaseLock();}
}
