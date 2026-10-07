import {mergeConfig} from 'vitest/config';
import base from '../../../vitest.config';
base.test!.include=['tests/flagship/intelligence/*.test.ts','tests/qualification/authority/**/*.test.ts','tests/qualification/inquiry/*.test.ts','tests/qualification/journeys/*.test.ts'];
export default mergeConfig(base,{server:{port:8764,strictPort:true},test:{testTimeout:60000,maxWorkers:4}});
