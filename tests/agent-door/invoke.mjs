export default async function({worker,name,args,who}) {
 const native=await worker('SlateAgentOperations');
 return native.invoke(name,args,who);
}
