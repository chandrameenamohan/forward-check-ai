import { describe, it, expect } from "vitest";

describe("Production dependencies", () => {
  it("should import grammy", async () => {
    const mod = await import("grammy");
    expect(mod.Bot).toBeDefined();
  });

  it("should import express", async () => {
    const mod = await import("express");
    expect(mod.default).toBeDefined();
  });

  it("should import better-sqlite3", async () => {
    const mod = await import("better-sqlite3");
    expect(mod.default).toBeDefined();
  });

  it("should import @anthropic-ai/sdk", async () => {
    const mod = await import("@anthropic-ai/sdk");
    expect(mod.default).toBeDefined();
  });

  it("should import zod", async () => {
    const { z } = await import("zod");
    expect(z.object).toBeDefined();
    expect(z.string).toBeDefined();
  });

  it("should import nanoid", async () => {
    const { nanoid } = await import("nanoid");
    expect(typeof nanoid).toBe("function");
    const id = nanoid();
    expect(id.length).toBeGreaterThan(0);
  });

  it("should import pino", async () => {
    const mod = await import("pino");
    expect(mod.default).toBeDefined();
  });

  it("should import pino-pretty", async () => {
    const mod = await import("pino-pretty");
    expect(mod.default).toBeDefined();
  });

  it("should import ejs", async () => {
    const mod = await import("ejs");
    expect(mod.render).toBeDefined();
  });
});
