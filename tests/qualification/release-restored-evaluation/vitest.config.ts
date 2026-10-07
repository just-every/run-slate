import base from '../authority/vitest.config.ts';
export default {...base, server: {port: Number(process.env.SLATE_TEST_PORT ?? 55510), strictPort: true}, test: {...base.test, include: ['tests/qualification/release-restored-evaluation/*.test.ts']}};
