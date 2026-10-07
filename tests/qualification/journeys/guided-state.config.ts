import {mergeConfig} from 'vitest/config';
import base from '../../../vitest.config';
base.test!.include=['tests/qualification/journeys/native-guided.test.ts','tests/qualification/journeys/owning-state*.test.ts'];
export default mergeConfig(base,{server:{port:8764,strictPort:true}});
