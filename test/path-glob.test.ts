import { describe, expect, test } from "bun:test";
import { globMatches, globPatternsIntersect, protectedPathsReferencedByTask } from "../src/path-glob";

describe("path glob boundaries", () => {
  test("extracts normalized concrete task paths without accepting prose or root escapes", () => {
    const protectedPaths = ["src/config/**", "secrets/**", ".env*"];
    expect(protectedPathsReferencedByTask(
      "Update `./src\\config/../config/settings.ts:42`, secrets/, and .env.local. Ignore ../secrets/token.ts and ordinary prose.",
      protectedPaths
    )).toEqual(["src/config/**", "secrets/**", ".env*"]);
  });

  test("matches protected directories behind wildcard prefixes", () => {
    expect(protectedPathsReferencedByTask(
      "Update src/app/secrets/ with tests and verification.",
      ["src/*/secrets/**"]
    )).toEqual(["src/*/secrets/**"]);
  });

  test("recognizes manifest-protected extensionless and punctuated root names", () => {
    expect(protectedPathsReferencedByTask(
      "Update Dockerfile and CODEOWNERS with foo+bar@v1.",
      ["Dockerfile", "CODEOWNERS", "foo+bar@v1"]
    )).toEqual(["Dockerfile", "CODEOWNERS", "foo+bar@v1"]);
  });

  test("matches canonicalized concrete paths", () => {
    expect(globMatches("./src/**", "src\\feature/../feature/index.ts")).toBe(true);
    expect(globMatches("src/**", "../src/index.ts")).toBe(false);
  });

  test("finds wildcard witnesses while keeping disjoint scopes separate", () => {
    expect(globPatternsIntersect("src/*/config.ts", "src/**/config.*")).toBe(true);
    expect(globPatternsIntersect("src/**/config.ts", "src/a/b/**")).toBe(true);
    expect(globPatternsIntersect("src/config.ts", "src/**/config.ts")).toBe(true);
    expect(globPatternsIntersect("src/a/config.ts", "src/**/config.ts")).toBe(true);
    expect(globPatternsIntersect("src/**", "docs/**")).toBe(false);
  });
});
