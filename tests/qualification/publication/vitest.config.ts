import base from '../../../vitest.config.ts';
export default { ...base, test: { ...base.test, include: ['tests/qualification/publication/**/*.test.ts'], testTimeout: 60000 } };
