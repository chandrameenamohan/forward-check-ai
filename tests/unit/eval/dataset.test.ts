import { describe, it, expect } from "vitest";

describe("Eval dataset", () => {
  it("all 15 claims validate against EvalClaimSchema", async () => {
    const { EvalClaimSchema, evalClaims } = await import(
      "../../../eval/dataset.js"
    );

    expect(evalClaims).toHaveLength(15);

    for (const claim of evalClaims) {
      const result = EvalClaimSchema.safeParse(claim);
      expect(
        result.success,
        `Claim "${claim.id}" failed validation: ${
          !result.success ? JSON.stringify(result.error.issues) : ""
        }`,
      ).toBe(true);
    }
  });

  it("dataset has correct distribution: 4 false, 3 true, 3 partial, 3 non-factual, 2 adversarial", async () => {
    const { evalClaims } = await import("../../../eval/dataset.js");

    const groups: Record<string, number> = {};
    for (const claim of evalClaims) {
      const prefix = claim.id.split("-")[0]!;
      groups[prefix] = (groups[prefix] ?? 0) + 1;
    }

    expect(groups["false"]).toBe(4);
    expect(groups["true"]).toBe(3);
    expect(groups["partial"]).toBe(3);
    expect(groups["nonfactual"]).toBe(3);
    expect(groups["adversarial"]).toBe(2);
  });

  it("no duplicate claim IDs", async () => {
    const { evalClaims } = await import("../../../eval/dataset.js");

    const ids = evalClaims.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all harmWeights are 1, 2, or 3", async () => {
    const { evalClaims } = await import("../../../eval/dataset.js");

    for (const claim of evalClaims) {
      expect(
        [1, 2, 3].includes(claim.harmWeight),
        `Claim "${claim.id}" has invalid harmWeight: ${String(claim.harmWeight)}`,
      ).toBe(true);
    }
  });
});
