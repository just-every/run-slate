import base from '../../../vitest.config.ts';
export default {...base,server:{...base.server,port:8738,strictPort:true},test:{...base.test,include:['tests/qualification/portability-jobs/**/*.test.ts'],fileParallelism:false,testTimeout:60000}};
