import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { builtInProfile } from "../src/workflow-profile-builtins";
import {
  GUIDE_RECIPE_IDS,
  GUIDE_REF_E_SOP_02_CLAUSES,
  runBoundedProcess,
  validateAndRunGuideRecipes,
  validateGuideHtml,
} from "./helpers/boulder-guide.js";
import { runBoulder } from "./helpers/cli";

const repoRoot = join(import.meta.dir, "..");
const guidePath = join(repoRoot, "docs", "boulder-guide.ko.html");
const csp =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; media-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'";

function fixtureHtml(): string {
  const markers = GUIDE_RECIPE_IDS.map((id) => `<span data-recipe-id="${id}">${id}</span>`).join("");
  const lifecycle = [
    '<section data-lifecycle-stage="intake"><code data-command-family="inspect">inspect</code><code data-command-family="onboard">onboard</code><code data-command-family="bootstrap interview">bootstrap interview</code><span>local read/discovery</span></section>',
    '<section data-lifecycle-stage="plan"><code data-command-family="plan analyze">plan analyze</code><code data-command-family="plan show">plan show</code><code data-command-family="plan validate">plan validate</code><span>read-only preview/validation</span></section>',
    '<section data-lifecycle-stage="execute"><code data-command-family="handoff packet">handoff packet</code><code data-command-family="handoff review">handoff review</code><code data-command-family="handoff send">handoff send</code><code data-command-family="v2 execute">v2 execute</code><span>handoff send is approval-gated; v2 execute is explicitly v2-gated and is never the default</span></section>',
    '<section data-lifecycle-stage="verify"><code data-command-family="verify">verify</code><code data-command-family="doctor">doctor</code><code data-command-family="release-check">release-check</code><code data-command-family="product-readiness">product-readiness</code><code data-command-family="service-readiness">service-readiness</code><code data-command-family="replay-check">replay-check</code><span>local verification/evidence gate</span></section>',
    '<section data-lifecycle-stage="record"><code data-command-family="record field-readiness">record field-readiness</code><span>explicit repo-local evidence write</span></section>',
  ].join("");
  return `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>:root{color-scheme:light dark}@media (max-width: 900px){}@media (prefers-reduced-motion: reduce){}@media print{}</style></head><body><a class="skip-link" href="#main">skip</a><nav aria-label="fixture"><a href="#main">main</a></nav><main id="main"><h1>Guide</h1><section id="architecture" data-concept-id="architecture">${markers}${lifecycle}</section><section><h2 class="ref-title">REF-E-SOP-02</h2><p>${GUIDE_REF_E_SOP_02_CLAUSES.join(" ")}</p></section><a href="https://github.com/min9lin9/boulder">source</a></main></body></html>`;
}

function commandFamiliesFromHelp(help: string): ReadonlySet<string> {
  return new Set(help.split("\n").flatMap((line) => {
    const match = /^  boulder (.+?)(?=\s(?:--|\[|\(|<)|$)/u.exec(line);
    return match?.[1] ? [match[1]] : [];
  }));
}

async function readGuide(): Promise<string> {
  try {
    await assertSafeGuideFile(guidePath, join(repoRoot, "docs"));
    return await readFile(guidePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("missing guide: docs/boulder-guide.ko.html");
    }
    throw error;
  }
}

async function assertSafeGuideFile(path: string, docsRoot: string): Promise<void> {
  const candidate = await lstat(path);
  if (candidate.isSymbolicLink() || !candidate.isFile() || candidate.nlink !== 1) {
    throw new Error("unsafe guide file type");
  }
  const [realCandidate, realDocs] = await Promise.all([realpath(path), realpath(docsRoot)]);
  if (dirname(realCandidate) !== realDocs) throw new Error("guide path escaped docs root");
}

async function rejectedMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function expectRejectedBeforeRun(html: string, message: string): Promise<void> {
  let runs = 0;
  let actual = "";
  try {
    await validateAndRunGuideRecipes(html, async () => {
      runs += 1;
    });
  } catch (error) {
    actual = error instanceof Error ? error.message : String(error);
  }
  expect(actual).toContain(message);
  expect(runs).toBe(0);
}

describe("Boulder Korean guide contract", () => {
  test("requires the standalone guide and its source-backed REF-E-SOP-02 contract", async () => {
    const html = await readGuide();
    const runs: string[] = [];
    const contract = await validateAndRunGuideRecipes(html, async (recipeId) => {
      runs.push(recipeId);
    });
    expect(runs).toEqual(GUIDE_RECIPE_IDS);
    expect(contract.refESop02HeadingCount).toBe(1);
    for (const clause of GUIDE_REF_E_SOP_02_CLAUSES) {
      expect(contract.visibleText).toContain(clause);
    }
    const profile = builtInProfile("programming-default", "built-in", null, null, []);
    if (!profile) throw new Error("missing built-in programming profile");
    const help = await runBoulder(["--help"]);
    const helpFamilies = commandFamiliesFromHelp(help.stdout);

    expect(help.exitCode).toBe(0);
    expect(help.stderr).toBe("");
    expect(contract.lifecycleStages).toEqual(profile.surface);
    for (const stage of profile.surface) {
      for (const family of contract.lifecycleFamilies[stage]) {
        expect(helpFamilies.has(family)).toBe(true);
      }
    }
  });

  test("rejects lifecycle command-family drift before recipe execution", async () => {
    await expectRejectedBeforeRun(
      fixtureHtml().replace('data-command-family="inspect"', 'data-command-family="unknown"'),
      "unknown command family unknown",
    );
  });

  test("names the static procedure section with a level-two heading", async () => {
    const contract = await validateGuideHtml(fixtureHtml());
    expect(contract.refESop02HeadingCount).toBe(1);
  });

  for (const [label, mutate, message] of [
    ["Korean language", (html: string) => html.replace('lang="ko"', 'lang="en"'), "Korean language"],
    ["viewport", (html: string) => html.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', ""), "viewport"],
    ["navigation", (html: string) => html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/u, ""), "navigation"],
    ["main landmark", (html: string) => html.replace("<main", "<div").replace("</main>", "</div>"), "main landmark"],
    ["skip target", (html: string) => html.replace('class="skip-link" href="#main"', 'class="skip-link" href="#missing"'), "skip target"],
    ["heading", (html: string) => html.replace("<h1>Guide</h1>", ""), "heading"],
    ["concept", (html: string) => html.replace('data-concept-id="architecture"', ""), "concept"],
    ["source link", (html: string) => html.replace("https://github.com/min9lin9/boulder", "#main"), "source link"],
    ["responsive query", (html: string) => html.replace("@media (max-width: 900px){}", ""), "required media query"],
    ["reduced-motion query", (html: string) => html.replace("@media (prefers-reduced-motion: reduce){}", ""), "required media query"],
    ["print query", (html: string) => html.replace("@media print{}", ""), "required media query"],
  ] as const) {
    test(`requires ${label}`, async () => {
      await expectRejectedBeforeRun(mutate(fixtureHtml()), message);
    });
  }

  test("rejects duplicate recipe ids before any recipe execution", async () => {
    const duplicate = fixtureHtml().replace(
      "</main>",
      '<span data-recipe-id="case-1">duplicate</span></main>',
    );
    await expectRejectedBeforeRun(duplicate, "duplicate recipe id");
  });

  test("rejects unknown recipe ids before any recipe execution", async () => {
    await expectRejectedBeforeRun(fixtureHtml().replace('data-recipe-id="case-4"', 'data-recipe-id="case-5"'), "unknown recipe id");
  });

  test("rejects active content before any recipe execution", async () => {
    await expectRejectedBeforeRun(fixtureHtml().replace("</body>", "<script>alert(1)</script></body>"), "element script");
  });

  test("rejects unsafe links before any recipe execution", async () => {
    await expectRejectedBeforeRun(
      fixtureHtml().replace("https://github.com/min9lin9/boulder", "javascript:alert(1)"),
      "unsafe href",
    );
  });

  test("accepts only the bounded A4 print at-rule", async () => {
    const printable = fixtureHtml().replace(
      ":root{color-scheme:light dark}",
      "@page{size:A4 portrait;margin:12mm}@media print{body{color:black}}@media (max-width: 900px){body{color:black}}@media (prefers-reduced-motion: reduce){body{scroll-behavior:auto}}:root{color-scheme:light dark}",
    );
    const contract = await validateGuideHtml(printable);
    expect(contract.recipeIds).toEqual(GUIDE_RECIPE_IDS);
  });

  for (const tag of ["iframe", "object", "embed", "base", "link", "form", "audio", "video"]) {
    test(`rejects active element ${tag} before any recipe execution`, async () => {
      await expectRejectedBeforeRun(fixtureHtml().replace("</body>", `<${tag}></${tag}></body>`), `element ${tag}`);
    });
  }

  for (const href of ["https://example.com", "/absolute", "//example.com", "vbscript:msgbox(1)", "data:text/html,x", "#%2e%2e"]) {
    test(`rejects unsafe href ${href} before any recipe execution`, async () => {
      await expectRejectedBeforeRun(
        fixtureHtml().replace("https://github.com/min9lin9/boulder", href),
        "unsafe href",
      );
    });
  }

  for (const css of [
    'body{background:url("remote")}',
    '@import "remote";',
    "@font-face{font-family:x}",
    "@supports(display:grid){body{display:grid}}",
  ]) {
    test(`rejects unsafe CSS ${css.split("{")[0]} before any recipe execution`, async () => {
      await expectRejectedBeforeRun(fixtureHtml().replace(":root{color-scheme:light dark}", css), "unsafe stylesheet");
    });
  }

  test("rejects duplicate ids and inline event handlers before execution", async () => {
    await expectRejectedBeforeRun(
      fixtureHtml().replace("</main>", '<span id="main">duplicate</span></main>'),
      "duplicate id",
    );
    await expectRejectedBeforeRun(
      fixtureHtml().replace('<main id="main">', '<main id="main" oNclick="alert(1)">'),
      "unsafe attribute onclick",
    );
  });

  test("rejects traversal, symlink, hardlink, and directory guide targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "boulder-guide-path-contract-"));
    const docs = join(root, "docs");
    const outside = join(root, "outside.html");
    try {
      await mkdir(docs);
      await writeFile(outside, fixtureHtml(), "utf8");
      expect(await rejectedMessage(() => assertSafeGuideFile(join(docs, "..", "outside.html"), docs))).toContain("escaped");
      const symlinkPath = join(docs, "symlink.html");
      const hardlinkPath = join(docs, "hardlink.html");
      const directoryPath = join(docs, "directory.html");
      await symlink(outside, symlinkPath);
      await link(outside, hardlinkPath);
      await mkdir(directoryPath);
      expect(await rejectedMessage(() => assertSafeGuideFile(symlinkPath, docs))).toContain("unsafe");
      expect(await rejectedMessage(() => assertSafeGuideFile(hardlinkPath, docs))).toContain("unsafe");
      expect(await rejectedMessage(() => assertSafeGuideFile(directoryPath, docs))).toContain("unsafe");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("captures an immediately exiting child without losing output", async () => {
    const result = await runBoundedProcess(
      [Bun.argv[0], "--no-env-file", "-e", 'process.stdout.write("ready")'],
      { timeoutMs: 1_000, outputCapBytes: 1_024, escalationMs: 100, closureMs: 1_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.outputOverflow).toBe(false);
    expect(result.stdout).toBe("ready");
  });

  test("terminates a child that exceeds the output cap", async () => {
    const result = await runBoundedProcess(
      [Bun.argv[0], "--no-env-file", "-e", 'process.stdout.write("x".repeat(4096));setInterval(()=>{},1000)'],
      { timeoutMs: 1_000, outputCapBytes: 64, escalationMs: 100, closureMs: 1_000 },
    );
    expect(result.outputOverflow).toBe(true);
    expect(new TextEncoder().encode(result.stdout).byteLength <= 64).toBe(true);
  });

  test("escalates after a timed-out child ignores SIGTERM", async () => {
    const result = await runBoundedProcess(
      [Bun.argv[0], "--no-env-file", "-e", 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],
      { timeoutMs: 100, outputCapBytes: 1_024, escalationMs: 100, closureMs: 1_000 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.signal).toBe("SIGKILL");
  });

  test("terminates the detached process group after timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "boulder-guide-process-group-"));
    const processGroupPath = join(root, "process-group.json");
    const childScript =
      `const {spawn}=require("node:child_process");` +
      `const {writeFileSync}=require("node:fs");` +
      `const grandchild=spawn(process.execPath,["--no-env-file","-e",'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:"inherit"});` +
      `writeFileSync(${JSON.stringify(processGroupPath)},JSON.stringify({processGroup:process.pid,grandchild:grandchild.pid}));` +
      `process.stdout.write("ready");process.on("SIGTERM",()=>{});setInterval(()=>{},1000);`;
    try {
      const result = await runBoundedProcess(
        [Bun.argv[0], "--no-env-file", "-e", childScript],
        { timeoutMs: 1_000, outputCapBytes: 1_024, escalationMs: 100, closureMs: 200 },
      );
      expect(result.timedOut).toBe(true);
      expect(result.signal).toBe("SIGKILL");
      expect(result.stdout).toBe("ready");
    } finally {
      try {
        const { processGroup } = JSON.parse(await readFile(processGroupPath, "utf8")) as { processGroup: number };
        const signal = (process as unknown as { kill(pid: number, signal: "SIGKILL"): boolean }).kill;
        try { signal(-processGroup, "SIGKILL"); } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});
