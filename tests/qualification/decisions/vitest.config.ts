import base from '../../../vitest.config.ts';
export default {...base,server:{...base.server,port:8736,strictPort:true},test:{...base.test,include:['tests/qualification/decisions/mechanics.test.ts','tests/qualification/decisions/closure.test.ts','tests/flagship/intelligence/authority.test.ts','tests/flagship/intelligence/claims.test.ts']}};
