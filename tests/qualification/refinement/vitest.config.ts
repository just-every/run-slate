import {mergeConfig} from 'vitest/config';
import base from '../../../vitest.config';
const include=['tests/qualification/refinement/*.test.ts','tests/qualification/journeys/learning-composition.test.ts','tests/qualification/authority/*.test.ts','tests/qualification/inquiry/*evaluation.test.ts','tests/qualification/inquiry/retained-skill.test.ts','tests/qualification/inquiry/lifecycle.test.ts','tests/qualification/run-attempts/*.test.ts','tests/flagship/intelligence/skills.test.ts','tests/flagship/intelligence/lifecycle.test.ts'];
base.test!.include=include;
export default mergeConfig(base,{server:{port:8746,strictPort:true},test:{include}});
