import {WorkerEntrypoint} from 'cloudflare:workers';
import type {AppBindings} from '../../app/types';
import type {InvocationIdentity} from '../../../../modules/agent-door/index.ts';
import {runtimeConfigFor} from '../../app/runtime-gate';
import {slateAgentDoor} from './index';

/** A trusted native service binding, never a browser or verification HTTP door.
 * The shared door re-reads person, policy, scopes, pause and originating consent. */
export class SlateAgentOperations extends WorkerEntrypoint<AppBindings> {
  async invoke(name:string,args:Record<string,unknown>,who:InvocationIdentity) {
    const origin=new URL(this.env.APP_URL!);
    return (await slateAgentDoor(this.env,runtimeConfigFor(this.env,origin.hostname))).invoke(name,args,who);
  }
}
