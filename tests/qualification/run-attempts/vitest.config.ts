import base from '../../../vitest.config';
export default {...base,server:{...base.server,port:8744,strictPort:true},test:{...base.test,include:['tests/qualification/run-attempts/*.test.ts','tests/qualification/core/instrumentation.test.ts']}};
