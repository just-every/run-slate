import base from './vitest.config';
export default {...base,test:{...base.test,include:[
 'tests/qualification/authority/**/*.test.ts',
 'tests/qualification/inquiry/recovery-evaluation.test.ts',
]}};
