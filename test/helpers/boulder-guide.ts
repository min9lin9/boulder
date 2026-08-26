export const GUIDE_RECIPE_IDS = ["case-1", "case-2", "case-3", "case-4"] as const;
export type GuideRecipeId = (typeof GUIDE_RECIPE_IDS)[number];
export const GUIDE_REF_E_SOP_02_CLAUSES = [
  "static-candidate",
  "executionPerformed:false",
  "k1-execution-wiring:false",
  "k2-k4-authority:false",
] as const;
export const GUIDE_LIFECYCLE = [
  { stage: "intake", families: ["inspect", "onboard", "bootstrap interview"], label: "local read/discovery" },
  { stage: "plan", families: ["plan analyze", "plan show", "plan validate"], label: "read-only preview/validation" },
  { stage: "execute", families: ["handoff packet", "handoff review", "handoff send", "v2 execute"], label: "handoff send is approval-gated; v2 execute is explicitly v2-gated and is never the default" },
  { stage: "verify", families: ["verify", "doctor", "release-check", "product-readiness", "service-readiness", "replay-check"], label: "local verification/evidence gate" },
  { stage: "record", families: ["record field-readiness"], label: "explicit repo-local evidence write" },
] as const;
export type GuideLifecycleStage = (typeof GUIDE_LIFECYCLE)[number]["stage"];

export const GUIDE_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; media-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'";

export interface GuideHtmlContract {
  readonly ids: readonly string[];
  readonly lifecycleFamilies: Readonly<Record<GuideLifecycleStage, readonly string[]>>;
  readonly lifecycleStages: readonly GuideLifecycleStage[];
  readonly refESop02HeadingCount: number;
  readonly recipeIds: readonly GuideRecipeId[];
  readonly visibleText: string;
}
export interface BoundedRunOptions {
  readonly timeoutMs: number; readonly outputCapBytes: number; readonly escalationMs: number; readonly closureMs: number;
  readonly cwd?: string; readonly env?: Readonly<Record<string, string>>;
}
export interface BoundedRunResult {
  readonly exitCode: number | null; readonly signal: string | null; readonly timedOut: boolean;
  readonly outputOverflow: boolean; readonly stdout: string; readonly stderr: string;
}
interface RewriterElement {
  readonly tagName: string; readonly attributes: Iterable<readonly [string, string]>;
  getAttribute(name: string): string | null;
}
interface RewriterText { readonly text: string }
interface RewriterHandlers { element?(element: RewriterElement): void; text?(text: RewriterText): void }
interface GuideHtmlRewriter { on(selector: string, handlers: RewriterHandlers): GuideHtmlRewriter; transform(response: Response): Response }
declare const HTMLRewriter: { new (): GuideHtmlRewriter };
interface GuideReadable {
  on(event: "data", listener: (chunk: Uint8Array) => void): GuideReadable;
  once(event: "error", listener: (error: Error) => void): GuideReadable;
  once(event: "end", listener: () => void): GuideReadable;
}
interface GuideChild {
  readonly pid?: number;
  readonly stdout: GuideReadable | null; readonly stderr: GuideReadable | null;
  once(event: "error", listener: (error: Error) => void): GuideChild;
  once(event: "exit", listener: (code: number | null, signal: string | null) => void): GuideChild;
  kill(signal: "SIGTERM" | "SIGKILL"): boolean;
}
type SpawnChild = (
  command: string,
  args: readonly string[],
  options: Readonly<Record<string, unknown>>,
) => GuideChild;

const allowedElements = new Set([
  "a", "article", "aside", "body", "br", "caption", "code", "dd", "details", "div", "dl", "dt", "em", "footer",
  "h1", "h2", "h3", "h4", "head", "header", "hr", "html", "kbd", "li", "main", "meta", "nav", "ol", "p", "pre",
  "samp", "section", "small", "span", "strong", "style", "summary", "table", "tbody", "td", "th", "thead", "title", "tr", "ul",
]);
const allowedAttributes = new Set([
  "aria-describedby", "aria-label", "aria-labelledby", "charset", "class", "colspan", "content", "data-concept-id",
  "data-command-family", "data-lifecycle-stage", "data-recipe-id", "dir", "href", "http-equiv", "id", "lang", "name", "open", "role", "rowspan", "scope", "title",
]);

const safeExternalHref = "https://github.com/min9lin9/boulder";

function isGuideRecipeId(value: string): value is GuideRecipeId {
  return GUIDE_RECIPE_IDS.some((id) => id === value);
}

function validateCss(css: string): void {
  if (/(?:url\s*\(|@import\b|@font-face\b)/iu.test(css)) throw new Error("unsafe stylesheet");
  const atRules = css.match(/@[a-z-]+/giu) ?? [];
  if (atRules.some((rule) => !["@media", "@page"].includes(rule.toLowerCase()))) {
    throw new Error("unsafe stylesheet at-rule");
  }
  const pageRules = atRules.filter((rule) => rule.toLowerCase() === "@page");
  if (pageRules.length > 1 || (pageRules.length === 1 && !/@page\s*\{[^}]*size\s*:\s*A4\s+portrait\s*;[^}]*margin\s*:\s*12mm\s*;?[^}]*\}/iu.test(css))) {
    throw new Error("unsafe stylesheet page rule");
  }
  const mediaQueries = [...css.matchAll(/@media\s+([^{]+)\{/giu)].map((match) => match[1]?.trim() ?? "");
  if (mediaQueries.some((query) => !["print", "(max-width: 900px)", "(prefers-reduced-motion: reduce)"].includes(query))) {
    throw new Error("unsafe stylesheet media query");
  }
  const requiredMediaQueries = ["print", "(max-width: 900px)", "(prefers-reduced-motion: reduce)"] as const;
  if (requiredMediaQueries.some((query) => !mediaQueries.includes(query))) throw new Error("missing required media query");
}

export async function validateGuideHtml(html: string): Promise<GuideHtmlContract> {
  const ids: string[] = [];
  const idSet = new Set<string>();
  const recipeIds: GuideRecipeId[] = [];
  const recipeSet = new Set<GuideRecipeId>();
  const lifecycleStages: GuideLifecycleStage[] = [];
  const lifecycleFamilies = Object.fromEntries(
    GUIDE_LIFECYCLE.map(({ stage }) => [stage, [] as string[]]),
  ) as Record<GuideLifecycleStage, string[]>;
  const knownStages = new Set<string>(GUIDE_LIFECYCLE.map(({ stage }) => stage));
  const knownFamilies = new Set<string>(GUIDE_LIFECYCLE.flatMap(({ families }) => families));
  let commandFamilyMarkerCount = 0;
  let cspCount = 0;
  let koreanLanguage = false;
  let viewportCount = 0;
  let labelledNavigationCount = 0;
  let mainCount = 0;
  let headingCount = 0;
  let refESop02HeadingCount = 0;
  let sourceLinkCount = 0;
  const conceptIds = new Set<string>();
  const skipTargets: string[] = [];
  let visibleText = "";
  let css = "";

  const rewriter = new HTMLRewriter()
    .on("*", {
      element(element) {
        const tag = element.tagName.toLowerCase();
        if (!allowedElements.has(tag)) throw new Error(`unsafe element ${tag}`);

        for (const [rawName, value] of element.attributes) {
          const name = rawName.toLowerCase();
          if (name.trim().startsWith("on") || !allowedAttributes.has(name)) {
            throw new Error(`unsafe attribute ${name}`);
          }
          if (/[\u0000-\u001f\u007f\\]/u.test(value)) throw new Error(`unsafe attribute value ${name}`);
        }

        const id = element.getAttribute("id");
        if (id) {
          if (idSet.has(id)) throw new Error(`duplicate id ${id}`);
          idSet.add(id);
          ids.push(id);
        }

        const recipeId = element.getAttribute("data-recipe-id");
        if (recipeId) {
          if (!isGuideRecipeId(recipeId)) throw new Error(`unknown recipe id ${recipeId}`);
          if (recipeSet.has(recipeId)) throw new Error(`duplicate recipe id ${recipeId}`);
          recipeSet.add(recipeId);
          recipeIds.push(recipeId);
        }
        const lifecycleStage = element.getAttribute("data-lifecycle-stage");
        if (lifecycleStage) {
          if (!knownStages.has(lifecycleStage)) throw new Error(`unknown lifecycle stage ${lifecycleStage}`);
          lifecycleStages.push(lifecycleStage as GuideLifecycleStage);
        }
        const commandFamily = element.getAttribute("data-command-family");
        if (commandFamily) {
          if (!knownFamilies.has(commandFamily)) throw new Error(`unknown command family ${commandFamily}`);
          commandFamilyMarkerCount += 1;
        }

        const href = element.getAttribute("href");
        if (href && href !== safeExternalHref && !/^#[A-Za-z][A-Za-z0-9._:-]*$/u.test(href)) {
          throw new Error(`unsafe href ${href}`);
        }

        if (tag === "meta") {
          if (element.getAttribute("name")?.toLowerCase() === "viewport") {
            if (element.getAttribute("content") !== "width=device-width, initial-scale=1") throw new Error("invalid viewport");
            viewportCount += 1;
          }
          const httpEquiv = element.getAttribute("http-equiv")?.toLowerCase();
          if (httpEquiv === "refresh") throw new Error("unsafe meta refresh");
          if (httpEquiv === "content-security-policy") {
            if (element.getAttribute("content") !== GUIDE_CSP) throw new Error("invalid content security policy");
            cspCount += 1;
          }
        }
        if (tag === "html") koreanLanguage = element.getAttribute("lang") === "ko";
        if (tag === "nav" && element.getAttribute("aria-label")) labelledNavigationCount += 1;
        if (tag === "main") mainCount += 1;
        if (tag === "h1") headingCount += 1;
        if (tag === "section" && element.getAttribute("data-concept-id")) conceptIds.add(element.getAttribute("data-concept-id")!);
        if (tag === "a" && href === safeExternalHref) sourceLinkCount += 1;
        if (tag === "a" && element.getAttribute("class")?.split(/\s+/u).includes("skip-link") && href) skipTargets.push(href);
      },
    })
    .on("body", {
      text(text) {
        visibleText += `${text.text} `;
      },
    })
    .on("section h2.ref-title", {
      text(text) {
        if (text.text.trim() === "REF-E-SOP-02") refESop02HeadingCount += 1;
      },
    })
    .on("style", {
      text(text) {
        css += text.text;
      },
    });
  for (const { stage } of GUIDE_LIFECYCLE) {
    rewriter.on(`[data-lifecycle-stage="${stage}"] [data-command-family]`, {
      element(element) {
        lifecycleFamilies[stage].push(element.getAttribute("data-command-family") ?? "");
      },
    });
  }

  await rewriter.transform(new Response(html)).text();
  validateCss(css);
  if (!koreanLanguage) throw new Error("missing Korean language");
  if (viewportCount !== 1) throw new Error(`viewport count ${viewportCount}`);
  if (labelledNavigationCount !== 1) throw new Error(`navigation count ${labelledNavigationCount}`);
  if (mainCount !== 1) throw new Error(`main landmark count ${mainCount}`);
  if (headingCount !== 1) throw new Error(`heading count ${headingCount}`);
  if (conceptIds.size === 0) throw new Error("missing concept");
  if (sourceLinkCount !== 1) throw new Error(`source link count ${sourceLinkCount}`);
  if (skipTargets.length !== 1 || !skipTargets.every((href) => href === "#main") || !idSet.has("main")) throw new Error("invalid skip target");
  if (cspCount !== 1) throw new Error(`content security policy count ${cspCount}`);
  for (const recipeId of GUIDE_RECIPE_IDS) {
    if (!recipeSet.has(recipeId)) throw new Error(`missing recipe id ${recipeId}`);
  }
  const expectedStages = GUIDE_LIFECYCLE.map(({ stage }) => stage);
  if (JSON.stringify(lifecycleStages) !== JSON.stringify(expectedStages)) {
    throw new Error(`lifecycle stage order ${JSON.stringify(lifecycleStages)}`);
  }
  let nestedFamilyCount = 0;
  for (const { stage, families, label } of GUIDE_LIFECYCLE) {
    nestedFamilyCount += lifecycleFamilies[stage].length;
    if (JSON.stringify(lifecycleFamilies[stage]) !== JSON.stringify(families)) {
      throw new Error(`lifecycle families ${stage}`);
    }
    if (!visibleText.includes(label)) throw new Error(`missing lifecycle label ${stage}`);
  }
  if (nestedFamilyCount !== commandFamilyMarkerCount) throw new Error("command family marker outside lifecycle stage");
  const normalizedVisibleText = visibleText.replace(/\s+/gu, " ").trim();
  if (refESop02HeadingCount !== 1) throw new Error(`REF-E-SOP-02 section count ${refESop02HeadingCount}`);
  for (const clause of GUIDE_REF_E_SOP_02_CLAUSES) {
    if (!normalizedVisibleText.includes(clause)) throw new Error(`missing REF-E-SOP-02 clause ${clause}`);
  }
  return {
    ids,
    lifecycleFamilies,
    lifecycleStages,
    refESop02HeadingCount,
    recipeIds,
    visibleText: normalizedVisibleText,
  };
}

export async function validateAndRunGuideRecipes(
  html: string,
  run: (recipeId: GuideRecipeId) => Promise<void>,
): Promise<GuideHtmlContract> {
  const contract = await validateGuideHtml(html);
  for (const recipeId of contract.recipeIds) await run(recipeId);
  return contract;
}

function appendBounded(
  chunks: Uint8Array[],
  chunk: Uint8Array,
  total: number,
  cap: number,
): { readonly total: number; readonly overflow: boolean } {
  const remaining = Math.max(0, cap - total);
  if (remaining > 0) chunks.push(chunk.slice(0, remaining));
  return { total: total + Math.min(chunk.byteLength, remaining), overflow: chunk.byteLength > remaining };
}

function decodeChunks(chunks: readonly Uint8Array[], size: number): string {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function runBoundedProcess(
  argv: readonly [string, ...string[]],
  options: BoundedRunOptions,
): Promise<BoundedRunResult> {
  const childProcess = await import("node:child_process");
  if (!("spawn" in childProcess) || typeof childProcess.spawn !== "function") {
    throw new Error("node:child_process.spawn unavailable");
  }
  const spawnChild = childProcess.spawn as SpawnChild;
  const child = spawnChild(argv[0], argv.slice(1), {
    cwd: options.cwd,
    detached: true,
    env: options.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!child.stdout || !child.stderr) throw new Error("bounded runner pipes unavailable");

  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  let outputOverflow = false;
  let exited = false;
  let terminating = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;

  const processSignal = (process as unknown as {
    kill(pid: number, signal: "SIGTERM" | "SIGKILL"): boolean;
  }).kill;
  const signalGroup = (signal: "SIGTERM" | "SIGKILL"): void => {
    if (child.pid !== undefined) {
      try { processSignal(-child.pid, signal); return; } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "";
        if (code !== "ESRCH") throw error;
      }
    }
    if (!exited) child.kill(signal);
  };
  const terminate = (): void => {
    if (terminating) return;
    terminating = true;
    signalGroup("SIGTERM");
    escalation = setTimeout(() => signalGroup("SIGKILL"), options.escalationMs);
  };

  const exitPromise = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
  });
  const stdoutEnd = new Promise<void>((resolve, reject) => {
    child.stdout?.once("error", reject);
    child.stdout?.once("end", resolve);
  });
  const stderrEnd = new Promise<void>((resolve, reject) => {
    child.stderr?.once("error", reject);
    child.stderr?.once("end", resolve);
  });
  child.stdout.on("data", (chunk: Uint8Array) => {
    const appended = appendBounded(stdoutChunks, chunk, stdoutBytes, options.outputCapBytes);
    stdoutBytes = appended.total;
    if (appended.overflow) {
      outputOverflow = true;
      terminate();
    }
  });
  child.stderr.on("data", (chunk: Uint8Array) => {
    const appended = appendBounded(stderrChunks, chunk, stderrBytes, options.outputCapBytes);
    stderrBytes = appended.total;
    if (appended.overflow) {
      outputOverflow = true;
      terminate();
    }
  });

  const deadline = setTimeout(() => {
    timedOut = true;
    terminate();
  }, options.timeoutMs);
  let exit: { readonly code: number | null; readonly signal: string | null };
  try {
    exit = await exitPromise;
  } finally {
    clearTimeout(deadline);
  }

  let closureTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([stdoutEnd, stderrEnd]),
      new Promise<never>((_, reject) => {
        closureTimer = setTimeout(() => reject(new Error("bounded runner pipe closure timeout")), options.closureMs);
      }),
    ]);
  } catch (error) {
    signalGroup("SIGKILL");
    throw error;
  } finally {
    if (closureTimer) clearTimeout(closureTimer);
    if (escalation) clearTimeout(escalation);
  }

  return {
    exitCode: exit.code,
    signal: exit.signal,
    timedOut,
    outputOverflow,
    stdout: decodeChunks(stdoutChunks, stdoutBytes),
    stderr: decodeChunks(stderrChunks, stderrBytes),
  };
}
