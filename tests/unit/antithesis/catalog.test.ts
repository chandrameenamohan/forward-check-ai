import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROPERTIES, judge, parseSdkOutput, claimMessage, guardMessage } from "../../../deploy/antithesis/driver/properties.js";

const DIR = join(__dirname, "../../../antithesis/scratchbook/properties");

/** A property file's front matter, as written. */
function frontMatter(name: string): Record<string, string> {
  const text = readFileSync(join(DIR, name), "utf8");
  const block = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  return Object.fromEntries(block.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
}

describe("Antithesis property catalog", () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith(".md"));

  it("should hold exactly the properties the harness asserts", () => {
    expect(files.map((name) => name.replace(/\.md$/, "")).sort()).toEqual(PROPERTIES.map((property) => property.slug).sort());
  });

  it.each(PROPERTIES.map((property) => [property.slug, property] as const))("should describe %s the way the harness asserts it", (slug, property) => {
    const fm = frontMatter(`${slug}.md`);
    expect(fm["id"]).toBe(slug);
    expect(fm["type"]).toBe(property.kind);
    expect(fm["priority"]).toBe(property.priority);
    for (const field of ["observable", "site", "evidence"]) expect(fm[field], field).toBeTruthy();
    // Every property that can pass by doing nothing needs a guard that proves its path ran.
    if (property.kind === "sometimes" || property.kind === "reachability") {
      expect(property.guard).toBeUndefined();
    } else {
      expect(fm["guard"]).toBe(`Sometimes("${property.guard ?? ""}")`);
      expect(fm["guard_site"]).toBeTruthy();
    }
  });

  it("should not count an always that was never evaluated as a pass", () => {
    const rows = judge([]);
    expect(rows.find((row) => row.slug === "verdict-never-inverts-the-judge")?.verdict).toBe("NOT RUN");
    expect(rows.find((row) => row.slug === "no-investigation-from-unsigned-webhook")?.verdict).toBe("PASS");
  });

  it("should fail a property on one false and report a guard that fired", () => {
    const slug = "verdict-never-inverts-the-judge";
    const line = (message: string, condition: boolean): string => JSON.stringify({ antithesis_assert: { message, hit: true, condition } });
    const rows = judge(parseSdkOutput([line(claimMessage(slug), true), line(claimMessage(slug), false), line(guardMessage(slug), true), "half a li"].join("\n")));
    const row = rows.find((entry) => entry.slug === slug);
    expect(row?.verdict).toBe("FAIL");
    expect(row?.guard).toBe("hit");
  });
});
