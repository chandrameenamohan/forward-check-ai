import type { BraveSearchResponse } from "../../src/tools/brave-search.js";
import type { GoogleFactCheckResponse } from "../../src/tools/google-factcheck.js";

/**
 * Canned Brave Search results for a known false viral claim about PM Modi's
 * Rs 5000 scheme. Useful for integration tests with mock search tools.
 */
export function makeCannedBraveResults(): BraveSearchResponse {
  return {
    results: [
      {
        title: "Fact Check: Viral claim about PM Modi Rs 5000 transfer is FALSE",
        url: "https://www.altnews.in/fact-check-pm-modi-rs-5000-direct-transfer",
        description:
          "No such scheme announced by PM Modi. The viral WhatsApp message claiming Rs 5000 direct transfer to all citizens is fabricated. PIB Fact Check has debunked this.",
        age: "2024-03-15",
      },
      {
        title: "PIB Fact Check: No Rs 5000 direct transfer scheme announced",
        url: "https://pib.gov.in/factcheck/2024/03/no-rs-5000-transfer",
        description:
          "The Press Information Bureau (PIB) confirms that no such scheme has been announced by the Government of India. Citizens are advised not to forward unverified messages.",
        age: "2024-03-12",
      },
      {
        title: "BoomLive: Fake WhatsApp Forward Claims PM Modi Rs 5000 Scheme",
        url: "https://www.boomlive.in/fact-check/modi-rs-5000-scheme-fake",
        description:
          "A viral WhatsApp message claiming PM Narendra Modi has announced Rs 5000 direct transfer to all Indian citizens is fake. Similar messages have circulated since 2020.",
        age: "2024-03-10",
      },
      {
        title: "PM Kisan Yojana: What is the actual government transfer scheme?",
        url: "https://www.india.gov.in/pm-kisan-samman-nidhi",
        description:
          "PM-KISAN provides Rs 6000 per year (in 3 installments of Rs 2000) to eligible farmer families. This is the only active direct transfer scheme by the central government.",
        age: "2024-02-01",
      },
      {
        title: "Snopes: Recirculated Indian government benefit scams",
        url: "https://www.snopes.com/fact-check/india-government-transfer-scam/",
        description:
          "Multiple viral messages claiming Indian government direct transfers are recycled hoaxes targeting WhatsApp users. These often include links to phishing sites.",
        age: "2024-01-20",
      },
    ],
  };
}

/**
 * Canned Google Fact Check results for the same PM Modi Rs 5000 claim.
 */
export function makeCannedFactCheckResults(): GoogleFactCheckResponse {
  return {
    claims: [
      {
        text: "PM Modi announced Rs 5000 direct transfer to all citizens",
        claimant: "WhatsApp viral message",
        claimReviewMarkup: {
          url: "https://www.altnews.in/fact-check-pm-modi-rs-5000",
          title: "No, PM Modi did not announce Rs 5000 transfer",
          publisher: "AltNews",
          rating: "False",
        },
      },
      {
        text: "Indian government giving Rs 5000 to every citizen",
        claimant: "Social media posts",
        claimReviewMarkup: {
          url: "https://www.boomlive.in/fact-check/modi-scheme-false",
          title: "Fake: No Rs 5000 government scheme",
          publisher: "BoomLive",
          rating: "False",
        },
      },
    ],
  };
}
