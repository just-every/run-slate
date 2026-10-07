import base from '../../../vitest.config.ts';
export default {...base,server:{...base.server,port:8736,strictPort:true},test:{...base.test,include:['tests/qualification/decisions/migration.test.ts'],setupFiles:['tests/qualification/decisions/migration-setup.ts']}};
