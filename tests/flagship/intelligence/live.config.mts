import base from '../../../vitest.config.ts';
import {defineConfig} from 'vitest/config';
if(!process.env.SLATE_LIVE_URL||!process.env.SLATE_LIVE_TOKEN)throw new Error('Run the explicit live bridge proof launcher.');
export default defineConfig({...base,define:{...base.define,__SLATE_PROOF_URL__:JSON.stringify(process.env.SLATE_PROOF_URL),__SLATE_LIVE_URL__:JSON.stringify(process.env.SLATE_LIVE_URL),__SLATE_LIVE_TOKEN__:JSON.stringify(process.env.SLATE_LIVE_TOKEN)},test:{...base.test,include:['tests/flagship/intelligence/worker-bridge.live.mts'],testTimeout:300000}});
