import base from './existing.config.ts';
export default {...base,test:{...base.test,include:[...base.test.include,'tests/qualification/portability-jobs/**/*.test.ts','tests/qualification/core/audit-effects.test.ts']}};
