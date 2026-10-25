import base from './vitest.config.ts';
export default {...base,server:{...base.server,port:8736,strictPort:true},test:{...base.test,include:['tests/qualification/run-attempts/*.test.ts','tests/qualification/core/instrumentation.test.ts','tests/qualification/portability-jobs/**/*.test.ts']}};
