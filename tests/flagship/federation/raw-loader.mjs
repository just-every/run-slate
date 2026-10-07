import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({load(url,context,next){if(url.endsWith('?raw'))return {format:'module',source:`export default ${JSON.stringify(readFileSync(new URL(url.split('?')[0]),'utf8'))}`,shortCircuit:true};return next(url,context);}});
