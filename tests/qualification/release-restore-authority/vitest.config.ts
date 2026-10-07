import base from '../authority/vitest.config';
export default {...base,server:{port:56900,strictPort:true},test:{...base.test,include:['tests/qualification/release-restore-authority/*.test.ts']}};
