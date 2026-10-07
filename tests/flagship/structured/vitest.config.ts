import base from "../../../vitest.config.ts";
export default {
  ...base,
  test: {
    ...base.test,
    testTimeout: 30000,
    include: ["tests/flagship/structured/**/*.test.ts"],
  },
};
