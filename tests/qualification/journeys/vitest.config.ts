import {mergeConfig} from 'vitest/config';
import base from '../../../vitest.config';
base.test!.include=['tests/qualification/journeys/*.test.ts','tests/qualification/inquiry/trial-loop.test.ts'];
export default mergeConfig(base,{server:{port:8744,strictPort:true},test:{include:['tests/qualification/journeys/*.test.ts','tests/qualification/inquiry/trial-loop.test.ts']}});
