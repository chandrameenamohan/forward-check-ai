import { z } from "zod";

export const EvalClaimSchema = z.object({
  id: z.string(),
  claim: z.string(),
  expectedCategory: z.enum([
    "likely-true",
    "partially-true",
    "unverified",
    "likely-false",
    "satire",
    "opinion",
  ]),
  expectedClassifierRoute: z.enum([
    "factual_claim",
    "opinion",
    "scam",
    "greeting",
    "other",
  ]),
  acceptableCategories: z.array(z.string()),
  expectedConfidenceRange: z.tuple([z.number(), z.number()]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  notes: z.string(),
  mustFindSources: z.array(z.string()).optional(),
  harmWeight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type EvalClaim = z.infer<typeof EvalClaimSchema>;

// --- Group 1: Known False (4 claims) ---

const knownFalse: EvalClaim[] = [
  {
    id: "false-001",
    claim:
      "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-false", "unverified"],
    expectedConfidenceRange: [0, 29],
    difficulty: "easy",
    tags: ["economics", "india", "zombie-claim"],
    notes: "Recurring WhatsApp forward. No official PIB announcement exists.",
    mustFindSources: ["pib.gov.in", "factcheck"],
    harmWeight: 2,
  },
  {
    id: "false-002",
    claim: "WHO officially declares green tea cures cancer",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-false"],
    expectedConfidenceRange: [0, 29],
    difficulty: "easy",
    tags: ["health", "fabricated-authority"],
    notes:
      "Fabricated WHO attribution. WHO has never made this declaration.",
    mustFindSources: ["who.int", "cancer"],
    harmWeight: 3,
  },
  {
    id: "false-003",
    claim: "5G towers have been proven to cause COVID-19 by WHO",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-false"],
    expectedConfidenceRange: [0, 29],
    difficulty: "easy",
    tags: ["health", "conspiracy", "debunked"],
    notes:
      "Widely debunked conspiracy theory. WHO explicitly denies any link.",
    mustFindSources: ["who.int", "5g"],
    harmWeight: 3,
  },
  {
    id: "false-004",
    claim:
      "NASA confirmed the Earth will experience 3 days of complete darkness in December",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-false", "unverified"],
    expectedConfidenceRange: [0, 29],
    difficulty: "easy",
    tags: ["science", "zombie-claim"],
    notes:
      "Recurring hoax. NASA has repeatedly denied this claim.",
    mustFindSources: ["nasa.gov"],
    harmWeight: 1,
  },
];

// --- Group 2: Known True (3 claims) ---

const knownTrue: EvalClaim[] = [
  {
    id: "true-001",
    claim:
      "India's Chandrayaan-3 successfully landed on the Moon's south pole region in August 2023",
    expectedCategory: "likely-true",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-true"],
    expectedConfidenceRange: [85, 100],
    difficulty: "easy",
    tags: ["science", "india", "space"],
    notes:
      "Well-documented ISRO achievement. Landed on August 23, 2023.",
    mustFindSources: ["isro", "chandrayaan"],
    harmWeight: 1,
  },
  {
    id: "true-002",
    claim:
      "The James Webb Space Telescope launched on December 25, 2021",
    expectedCategory: "likely-true",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-true"],
    expectedConfidenceRange: [85, 100],
    difficulty: "easy",
    tags: ["science", "space"],
    notes:
      "Widely reported. JWST launched from Kourou, French Guiana on Christmas Day 2021.",
    mustFindSources: ["nasa.gov", "webb"],
    harmWeight: 1,
  },
  {
    id: "true-003",
    claim:
      "Japan hosted the 2020 Summer Olympics in 2021 due to COVID-19 delay",
    expectedCategory: "likely-true",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-true"],
    expectedConfidenceRange: [85, 100],
    difficulty: "easy",
    tags: ["general", "sports"],
    notes:
      "Well-known fact. The Tokyo 2020 Olympics were held July-August 2021.",
    mustFindSources: ["olympics"],
    harmWeight: 1,
  },
];

// --- Group 3: Partially True / Misleading (3 claims) ---

const partiallyTrue: EvalClaim[] = [
  {
    id: "partial-001",
    claim:
      "A Harvard study proved that eating chocolate every day prevents heart disease",
    expectedCategory: "partially-true",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["partially-true", "unverified"],
    expectedConfidenceRange: [30, 70],
    difficulty: "medium",
    tags: ["health", "exaggerated"],
    notes:
      "Harvard studies show modest cocoa flavanol benefits, but 'proves' and 'prevents' overstate findings.",
    mustFindSources: ["harvard", "chocolate"],
    harmWeight: 2,
  },
  {
    id: "partial-002",
    claim:
      "Coffee has been classified as a cancer-causing agent by WHO",
    expectedCategory: "partially-true",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["partially-true", "unverified", "likely-false"],
    expectedConfidenceRange: [30, 70],
    difficulty: "hard",
    tags: ["health", "nuanced"],
    notes:
      "IARC classified coffee as Group 2B (possibly carcinogenic) in 1991, then reclassified in 2016 removing that designation. Current WHO position does not classify coffee as carcinogenic.",
    mustFindSources: ["iarc", "coffee"],
    harmWeight: 2,
  },
  {
    id: "partial-003",
    claim:
      "Tesla cars can drive themselves fully autonomously without any human intervention",
    expectedCategory: "partially-true",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["partially-true", "likely-false", "unverified"],
    expectedConfidenceRange: [20, 60],
    difficulty: "medium",
    tags: ["technology", "misleading"],
    notes:
      "Tesla Autopilot and FSD exist but require driver supervision. 'Fully autonomous without any human intervention' is not accurate as of 2024.",
    mustFindSources: ["tesla", "autopilot"],
    harmWeight: 1,
  },
];

// --- Group 4: Non-Factual — Short Circuit (3 claims) ---

const nonFactual: EvalClaim[] = [
  {
    id: "nonfactual-001",
    claim: "Hello! How are you doing today?",
    expectedCategory: "opinion",
    expectedClassifierRoute: "greeting",
    acceptableCategories: ["opinion"],
    expectedConfidenceRange: [0, 100],
    difficulty: "easy",
    tags: ["greeting"],
    notes:
      "Should be classified as greeting and short-circuited. No investigation needed.",
    harmWeight: 1,
  },
  {
    id: "nonfactual-002",
    claim: "I think democracy is the best form of government",
    expectedCategory: "opinion",
    expectedClassifierRoute: "opinion",
    acceptableCategories: ["opinion"],
    expectedConfidenceRange: [0, 100],
    difficulty: "easy",
    tags: ["opinion"],
    notes:
      "Should be classified as opinion and short-circuited. No investigation needed.",
    harmWeight: 1,
  },
  {
    id: "nonfactual-003",
    claim:
      "Send ₹500 to this UPI ID to unlock your prize winnings: scammer@upi",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "scam",
    acceptableCategories: ["likely-false"],
    expectedConfidenceRange: [0, 29],
    difficulty: "easy",
    tags: ["scam"],
    notes:
      "Should be classified as scam and short-circuited. No investigation needed.",
    harmWeight: 3,
  },
];

// --- Group 5: Adversarial (2 claims) ---

const adversarial: EvalClaim[] = [
  {
    id: "adversarial-001",
    claim: "BREAKING: The president just announced...",
    expectedCategory: "unverified",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["unverified", "likely-false"],
    expectedConfidenceRange: [20, 70],
    difficulty: "hard",
    tags: ["vague", "adversarial"],
    notes:
      "Vague, no falsifiable claim. Pipeline should recognize insufficient information.",
    harmWeight: 1,
  },
  {
    id: "adversarial-002",
    claim:
      "PM Modi gave Rs 5000 AND green tea cures cancer AND WhatsApp is now free",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-false", "unverified"],
    expectedConfidenceRange: [0, 40],
    difficulty: "hard",
    tags: ["compound", "adversarial"],
    notes:
      "Compound claim combining multiple false claims. Tests pipeline handling of isCompound.",
    harmWeight: 2,
  },
];

export const evalClaims: EvalClaim[] = [
  ...knownFalse,
  ...knownTrue,
  ...partiallyTrue,
  ...nonFactual,
  ...adversarial,
];
