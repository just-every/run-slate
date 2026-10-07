import base from '../../../vitest.config.ts';
export default { ...base, test: { ...base.test, include: ['tests/qualification/publication-relocation/**/*.test.ts'], fileParallelism: false, testTimeout: 60000 } };
