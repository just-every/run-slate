import { mergeConfig } from "vitest/config";
import base from "../../../../vitest.config.ts";
base.test!.include = ["tests/flagship/release-clauses/inquiry/*.test.ts"];
export default mergeConfig(base, {
  server: { port: 60600, strictPort: true },
  test: { include: ["tests/flagship/release-clauses/inquiry/*.test.ts"] },
});
