/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  // src must be in roots as well as test: with only test/ here, Jest never
  // crawls src/ and silently omits files no test imports, instead of counting
  // them as 0%. That inflates the coverage number the Phase 1 ratchet reads.
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  // json-summary is what the Phase 1 coverage ratchet will read.
  coverageReporters: ["text", "json-summary", "lcov"],
  clearMocks: true,
  restoreMocks: true,
};
