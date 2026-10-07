import base from '../../../vitest.config';
const port=Number(process.env.SLATE_TEST_PORT??15222);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('SLATE_TEST_PORT must be a valid explicit port');
export default {...base,server:{port,strictPort:true},test:{...base.test,fileParallelism:false,testTimeout:60000,include:[
 'tests/qualification/refinement/legacy-prepared.test.ts',
 'tests/qualification/refinement/expected-outcome.test.ts',
 'tests/qualification/refinement/selection.test.ts',
 'tests/qualification/authority/evaluation-boundaries.test.ts',
 'tests/qualification/inquiry/recovery-evaluation.test.ts',
]}};
