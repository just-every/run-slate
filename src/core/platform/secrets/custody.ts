import { ApiProblem } from '../../app/problems';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function key(secret:string){if(secret.length<32)throw new ApiProblem(503,'CREDENTIAL_KEY_INVALID','CONNECTOR_CREDENTIALS_KEY must contain at least 32 characters.');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
/** AAD binds ciphertext to workspace/provider/connection identity. Never pass plaintext to clients or logs. */
export async function encryptSecret(secret:string,plaintext:string,scope:string):Promise<string>{const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(scope)},await key(secret),encoder.encode(plaintext));return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;}
export async function decryptSecret(secret:string,envelope:string,scope:string):Promise<string>{const [v,iv,payload]=envelope.split('.');if(v!=='v1'||!iv||!payload)throw new ApiProblem(503,'CREDENTIAL_UNAVAILABLE','The stored credential is unavailable.');try{return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:encoder.encode(scope)},await key(secret),decode(payload)));}catch{throw new ApiProblem(503,'CREDENTIAL_UNAVAILABLE','The stored credential cannot be opened for this connection.');}}
