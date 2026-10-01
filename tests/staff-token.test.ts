// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createStaffToken,
  readStaffToken,
  STAFF_TTL,
} from "@/lib/auth/staff-token";
import { createSessionToken, verifySessionToken } from "@/lib/auth/token";
describe("demo staff role cookie", () => {
  it("rejects edits, different teams, expiry and guest/staff token interchange", () => {
    const token = createStaffToken("kitchen", "nina", "secret", 1000000);
    expect(readStaffToken(token, "nina", "secret", 1000000)).toBe("kitchen");
    expect(readStaffToken(token, "other", "secret", 1000000)).toBeNull();
    expect(readStaffToken(token, "nina", "wrong", 1000000)).toBeNull();
    expect(
      readStaffToken(token, "nina", "secret", 1000000 + STAFF_TTL * 1000),
    ).toBeNull();
    const [payload, sig] = token.split(".");
    const edited = JSON.parse(Buffer.from(payload, "base64url").toString());
    edited.role = "manager";
    expect(
      readStaffToken(
        `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${sig}`,
        "nina",
        "secret",
        1000000,
      ),
    ).toBeNull();
    expect(
      readStaffToken(
        createSessionToken("nina", "secret", 1000000),
        "nina",
        "secret",
        1000000,
      ),
    ).toBeNull();
    expect(verifySessionToken(token, "nina", "secret", 1000000)).toBe(false);
  });
});
