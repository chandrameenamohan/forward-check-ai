import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe(".env.example WhatsApp configuration", () => {
  const envExamplePath = resolve(
    import.meta.dirname,
    "../../../.env.example",
  );
  const envExampleContent = readFileSync(envExamplePath, "utf-8");

  const requiredWhatsAppVars = [
    "WHATSAPP_ENABLED",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "PHONE_HASH_SALT",
  ];

  it("should contain WhatsApp configuration section header", () => {
    expect(envExampleContent).toContain(
      "# WhatsApp Configuration (optional",
    );
  });

  for (const varName of requiredWhatsAppVars) {
    it(`should contain ${varName} variable`, () => {
      const pattern = new RegExp(`^${varName}=`, "m");
      expect(envExampleContent).toMatch(pattern);
    });
  }

  it("should contain inline comments explaining where to find values", () => {
    expect(envExampleContent).toContain("Meta Business Manager");
  });

  it("should default WHATSAPP_ENABLED to false", () => {
    expect(envExampleContent).toMatch(/^WHATSAPP_ENABLED=false$/m);
  });

  it("should default PHONE_HASH_SALT to forwardcheck-ai-v1", () => {
    expect(envExampleContent).toMatch(
      /^PHONE_HASH_SALT=forwardcheck-ai-v1$/m,
    );
  });

  it("should contain app secret comment mentioning webhook signature verification", () => {
    expect(envExampleContent).toContain("webhook signature verification");
  });

  it("should have WhatsApp section after the core config sections", () => {
    const whatsappIndex = envExampleContent.indexOf("WHATSAPP_ENABLED");
    const anthropicIndex = envExampleContent.indexOf("ANTHROPIC_API_KEY");
    const telegramIndex = envExampleContent.indexOf("TELEGRAM_BOT_TOKEN");
    expect(whatsappIndex).toBeGreaterThan(anthropicIndex);
    expect(whatsappIndex).toBeGreaterThan(telegramIndex);
  });
});
