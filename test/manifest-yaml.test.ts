import { describe, expect, test } from "bun:test";
import { yamlBool, yamlList, yamlNestedGroupScalar, yamlNestedScalar, yamlScalar, yamlSectionLines } from "../src/manifest-yaml";

describe("manifest yaml parser", () => {
  test("keeps scalar and list parsing inside the requested section", () => {
    const text = [
      "name: fixture",
      "workflows:",
      "  - issue-triage",
      "  - release-planning",
      "providers:",
      "  default: codex",
      ""
    ].join("\n");

    expect(yamlScalar(text, "name")).toBe("fixture");
    expect(yamlList(text, "workflows")).toEqual(["issue-triage", "release-planning"]);
    expect(yamlSectionLines(text, "workflows")).toEqual(["  - issue-triage", "  - release-planning"]);
  });

  test("keeps nested groups inside their parent boundary", () => {
    const text = [
      "executors:",
      "  planning:",
      "    preferred: gajae-code",
      "    mode: detect-and-suggest",
      "  execution:",
      "    preferred: lazycodex",
      "providers:",
      "  default: codex",
      "  externalAllowed: false",
      ""
    ].join("\n");

    expect(yamlNestedGroupScalar(text, "executors", "planning", "preferred")).toBe("gajae-code");
    expect(yamlNestedGroupScalar(text, "executors", "execution", "preferred")).toBe("lazycodex");
    expect(yamlNestedScalar(text, "providers", "externalAllowed")).toBe("false");
    expect(yamlNestedGroupScalar(text, "providers", "planning", "preferred")).toBeNull();
  });

  test("parses booleans without accepting arbitrary text", () => {
    expect(yamlBool("true")).toBe(true);
    expect(yamlBool("false")).toBe(false);
    expect(yamlBool("yes")).toBeNull();
  });
});
