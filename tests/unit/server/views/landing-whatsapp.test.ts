import { describe, it, expect } from "vitest";
import ejs from "ejs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsDir = join(__dirname, "../../../../src/server/views");

function renderLanding(data: Record<string, unknown>): string {
  const template = readFileSync(join(viewsDir, "landing.ejs"), "utf-8");
  return ejs.render(template, {
    recentInvestigationId: null,
    telegramBotUsername: "forward_check_beta_bot",
    whatsappEnabled: false,
    whatsappPhoneNumber: null,
    ...data,
  }, { filename: join(viewsDir, "landing.ejs") });
}

describe("Landing page — WhatsApp integration", () => {
  it("should render landing page without WhatsApp section when disabled", () => {
    const html = renderLanding({ whatsappEnabled: false });

    // Should NOT contain the WhatsApp CTA button
    expect(html).not.toContain('class="fc-cta-whatsapp"');
    // Should still contain the Telegram CTA
    expect(html).toContain("Try it on Telegram");
  });

  it("should render landing page with WhatsApp section when enabled", () => {
    const html = renderLanding({
      whatsappEnabled: true,
      whatsappPhoneNumber: "15551234567",
    });

    // Should contain the WhatsApp CTA button
    expect(html).toContain('class="fc-cta-whatsapp"');
    expect(html).toContain("WhatsApp");
    // Should still contain the Telegram CTA
    expect(html).toContain("Try it on Telegram");
  });

  it("should include wa.me deep link", () => {
    const html = renderLanding({
      whatsappEnabled: true,
      whatsappPhoneNumber: "15551234567",
    });

    expect(html).toContain("https://wa.me/15551234567");
  });

  it("should use WhatsApp brand color for the button", () => {
    const html = renderLanding({
      whatsappEnabled: true,
      whatsappPhoneNumber: "15551234567",
    });

    // WhatsApp brand color #25D366 should be present in styles
    expect(html).toContain("#25D366");
  });

  it("should include WhatsApp button in the final CTA section", () => {
    const html = renderLanding({
      whatsappEnabled: true,
      whatsappPhoneNumber: "15551234567",
    });

    // There should be two wa.me links: one in the hero CTAs and one in the final CTA
    const waLinks = html.match(/https:\/\/wa\.me\/15551234567/g);
    expect(waLinks).not.toBeNull();
    expect(waLinks!.length).toBe(2);

    // The final CTA section contains "Open in WhatsApp" text
    expect(html).toContain("Open in WhatsApp");
  });

  it("should not render WhatsApp button in final CTA when disabled", () => {
    const html = renderLanding({ whatsappEnabled: false });

    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("Open in WhatsApp");
  });
});
