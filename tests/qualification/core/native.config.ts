import base from '../../../vitest.config';
const port=Number(process.env.QUAL_APP_PORT);
if(!Number.isInteger(port)||port<8700||port>8799)throw Error('Explicit qualification application port required');
export default {...base,server:{...base.server,port,strictPort:true},test:{...base.test,include:['tests/flagship/core/**/*.test.ts','tests/qualification/backend/**/*.test.ts','tests/qualification/core/*.test.ts','tests/qualification/inquiry/provider-mechanics.test.ts']}};
