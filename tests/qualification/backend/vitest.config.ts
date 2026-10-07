import base from '../../../vitest.config.ts';
export default {...base,test:{...base.test,include:['tests/qualification/backend/**/*.test.ts']}};
