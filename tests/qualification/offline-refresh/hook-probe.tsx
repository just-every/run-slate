import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useResource} from '../../../src/core/client/useResource';
import {TransportError} from '../../../src/core/client/transport';

declare global {interface Window {probe:any;mode:string;releases:((value:Response)=>void)[];}}
window.mode='ok';window.releases=[];
// Explicit test-only transport fixture; the hook and browser renderer are production modules.
window.fetch=async(path)=>{
 if(window.mode==='transport')throw new TypeError('offline fixture');
 if(window.mode==='programmer')throw new Error('programmer fixture');
 if(window.mode==='delayed')return new Promise(resolve=>window.releases.push(resolve));
 return new Response(window.mode==='malformed'?'{':JSON.stringify({path}),{status:window.mode==='denial'?403:window.mode==='server'?500:200});
};
function ResourceProbe({path,retain}:{path:string|null;retain:boolean}) {
 const value=useResource<{path:string}>(path,{retainOnTransportFailure:retain});
 window.probe.resource=value;
 return <output>{JSON.stringify({data:value.data,loading:value.loading,error:value.error?(value.error instanceof TransportError?'transport':String(value.error)):null})}</output>;
}
function App() {
 const [path,setPath]=useState<string|null>('/api/A'),[retain,setRetain]=useState(false),[mounted,setMounted]=useState(true),[identity,setIdentity]=useState('member-A');
 window.probe={...window.probe,setPath,setRetain,setMounted,setIdentity};
 return mounted?<ResourceProbe key={identity} path={path} retain={retain}/>:<p>Unmounted</p>;
}
createRoot(document.getElementById('root')!).render(<App/>);
