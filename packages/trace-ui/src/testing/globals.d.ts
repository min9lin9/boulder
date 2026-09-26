/// <reference path="../../../../src/globals.d.ts" />

// Bun's built-in HTML parser is used only by SSR component tests. Keep the
// small exercised surface typed, like the repository's bun:test declarations.
declare class HTMLRewriter {
  on(selector: string, handlers: { element(element: { getAttribute(name: string): string | null }): void }): this;
  transform(response: Response): Response;
}
