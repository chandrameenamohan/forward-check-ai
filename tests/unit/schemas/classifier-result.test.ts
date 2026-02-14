import { describe, it, expect } from "vitest";

describe("ClassifierResult schema", () => {
  it("should validate a correct ClassifierResult", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const valid = {
      category: "factual_claim",
      extractedClaim: "PM Modi announced Rs 5000 transfer to all citizens",
      isCompound: false,
      domain: "geopolitics",
      language: "en",
      urgency: "high",
      reasoning: "This is a specific factual claim about a government policy",
    };

    const result = ClassifierResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("factual_claim");
      expect(result.data.extractedClaim).toBe(valid.extractedClaim);
      expect(result.data.isCompound).toBe(false);
      expect(result.data.domain).toBe("geopolitics");
      expect(result.data.language).toBe("en");
      expect(result.data.urgency).toBe("high");
      expect(result.data.reasoning).toBe(valid.reasoning);
    }
  });

  it("should reject missing required fields", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const missing = {
      category: "factual_claim",
      // missing extractedClaim, isCompound, domain, language, urgency, reasoning
    };

    const result = ClassifierResultSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("should reject invalid category enum value", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const invalid = {
      category: "invalid_category",
      extractedClaim: "Some claim",
      isCompound: false,
      domain: "general",
      language: "en",
      urgency: "low",
      reasoning: "Some reasoning",
    };

    const result = ClassifierResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should reject invalid domain enum value", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const invalid = {
      category: "opinion",
      extractedClaim: "Some claim",
      isCompound: false,
      domain: "sports",
      language: "en",
      urgency: "medium",
      reasoning: "Some reasoning",
    };

    const result = ClassifierResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("should export the ClassifierResult TypeScript type", async () => {
    const mod = await import("../../../src/schemas/classifier-result.js");
    expect(mod.ClassifierResultSchema).toBeDefined();
    // Type is exported — verify by checking the schema's parse produces a typed value
    const valid = {
      category: "scam" as const,
      extractedClaim: "Free money scam",
      isCompound: false,
      domain: "general" as const,
      language: "hi",
      urgency: "high" as const,
      reasoning: "Typical scam pattern",
    };
    const parsed = mod.ClassifierResultSchema.parse(valid);
    expect(parsed.category).toBe("scam");
  });

  it("should accept all valid category values", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const categories = ["factual_claim", "opinion", "scam", "greeting", "other"];
    for (const category of categories) {
      const data = {
        category,
        extractedClaim: "Test",
        isCompound: false,
        domain: "general",
        language: "en",
        urgency: "low",
        reasoning: "Test",
      };
      const result = ClassifierResultSchema.safeParse(data);
      expect(result.success, `category "${category}" should be valid`).toBe(true);
    }
  });

  it("should accept all valid domain values", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const domains = ["public_health", "geopolitics", "economics", "science", "technology", "general"];
    for (const domain of domains) {
      const data = {
        category: "factual_claim",
        extractedClaim: "Test",
        isCompound: false,
        domain,
        language: "en",
        urgency: "low",
        reasoning: "Test",
      };
      const result = ClassifierResultSchema.safeParse(data);
      expect(result.success, `domain "${domain}" should be valid`).toBe(true);
    }
  });

  it("should accept all valid urgency values", async () => {
    const { ClassifierResultSchema } = await import(
      "../../../src/schemas/classifier-result.js"
    );

    const urgencies = ["low", "medium", "high"];
    for (const urgency of urgencies) {
      const data = {
        category: "factual_claim",
        extractedClaim: "Test",
        isCompound: false,
        domain: "general",
        language: "en",
        urgency,
        reasoning: "Test",
      };
      const result = ClassifierResultSchema.safeParse(data);
      expect(result.success, `urgency "${urgency}" should be valid`).toBe(true);
    }
  });
});
