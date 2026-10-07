import base from './native.config';
export default {...base,test:{...base.test,include:['tests/qualification/core/audit-*.test.ts','tests/qualification/core/instrumentation.test.ts']}};
