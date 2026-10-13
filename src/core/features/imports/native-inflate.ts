import {inflateSync} from 'fflate';

/** Decode into a fixed caller-owned buffer. The extra sentinel byte makes an
 * overflow observable even when the decoder caps its returned view at the
 * buffer boundary. Never expose a truncated or short value to JSON parsing. */
export function inflateNativeValue(bytes:Uint8Array,expectedBytes:number):Uint8Array {
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<0)throw new Error('Invalid native value size.');
 const decoded=inflateSync(bytes,{out:new Uint8Array(expectedBytes+1)});
 if(decoded.byteLength!==expectedBytes)throw new Error('Native compressed value length changed.');
 return decoded;
}
