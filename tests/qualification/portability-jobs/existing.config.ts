import base from './vitest.config.ts';
export default {...base,test:{...base.test,include:['tests/qualification/authority/scheduled-recovery.test.ts','tests/qualification/authority/atomic-search-restore.test.ts','tests/qualification/authority/learned-portability.test.ts','tests/qualification/authority/restored-execution.test.ts','tests/flagship/federation/**/*.test.ts']}};
