import federation from '../../flagship/federation/vitest.config.ts';
export default {...federation,test:{...federation.test,include:['tests/qualification/tree-archive/**/*.test.ts']}};
