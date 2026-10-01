// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldMigrateDeployment } from "../scripts/lib/deployment-migrations";

describe("deployment migration boundary", () => {
  const production = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    DEMO_WRITES_ENABLED: "true",
    DATABASE_URL: "postgresql://demo:example@localhost/test",
  };
  it("allows configured writable Vercel production builds", () => {
    expect(shouldMigrateDeployment(production)).toBe(true);
  });
  it("does not migrate local verification or preview builds", () => {
    expect(shouldMigrateDeployment({})).toBe(false);
    expect(
      shouldMigrateDeployment({ ...production, VERCEL_ENV: "preview" }),
    ).toBe(false);
    expect(shouldMigrateDeployment({ ...production, VERCEL: undefined })).toBe(
      false,
    );
  });
  it("fails closed for read-only production builds", () => {
    expect(() =>
      shouldMigrateDeployment({ ...production, DEMO_WRITES_ENABLED: "false" }),
    ).toThrow("DEMO_WRITES_ENABLED");
  });
  it("rejects placeholders and invalid URLs without logging the secret", () => {
    for (const value of [
      "[SENSITIVE]",
      "secret-that-must-not-be-logged",
      "https://example.test",
      "",
    ]) {
      expect(() =>
        shouldMigrateDeployment({ ...production, DATABASE_URL: value }),
      ).toThrow(
        "DATABASE_URL must be available inside the Vercel production build.",
      );
    }
  });
});
