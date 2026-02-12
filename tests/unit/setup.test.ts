import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

describe("Project scaffolding", () => {
  it("tsconfig exists and is valid JSON", () => {
    const raw = readFileSync(resolve(ROOT, "tsconfig.json"), "utf-8");
    const tsconfig = JSON.parse(raw);

    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.module).toBe("NodeNext");
    expect(tsconfig.compilerOptions.moduleResolution).toBe("NodeNext");
    expect(tsconfig.compilerOptions.outDir).toBe("./dist");
    expect(tsconfig.compilerOptions.rootDir).toBe("./src");
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
  });

  it("package.json has type module", () => {
    const raw = readFileSync(resolve(ROOT, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);

    expect(pkg.type).toBe("module");
  });

  it("src/index.ts exists with a placeholder export", async () => {
    const mod = await import("../../src/index.js");
    expect(mod).toBeDefined();
  });
});
