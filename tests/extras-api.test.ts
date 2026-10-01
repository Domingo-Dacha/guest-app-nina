// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  writable: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/auth/server-session", () => ({
  hasValidSession: mocks.session,
}));
vi.mock("@/lib/env", () => ({
  demoWritesEnabled: mocks.writable,
  getTeamSlug: () => "nina",
}));
vi.mock("@/lib/db/client", () => ({
  getSqlClient: () => ({ query: mocks.query }),
}));
import { GET, POST } from "@/app/api/extras/route";

beforeEach(() => {
  mocks.session.mockResolvedValue(true);
  mocks.writable.mockReturnValue(true);
  mocks.query.mockReset();
});
describe("extras API access boundary", () => {
  it("does not read or write data without a valid server session", async () => {
    mocks.session.mockResolvedValue(false);
    expect((await GET()).status).toBe(401);
    expect(
      (
        await POST(
          new Request("https://guest.test/api/extras", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("blocks writes in read-only deployments", async () => {
    mocks.writable.mockReturnValue(false);
    expect(
      (
        await POST(
          new Request("https://guest.test/api/extras", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes and malformed selections before reaching the database", async () => {
    const crossOrigin = new Request("https://guest.test/api/extras", {
      method: "POST",
      headers: { origin: "https://other.test" },
      body: "{}",
    });
    expect((await POST(crossOrigin)).status).toBe(403);
    const incomplete = new Request("https://guest.test/api/extras", {
      method: "POST",
      body: JSON.stringify({
        action: "save",
        version: 0,
        item: { serviceId: "furako" },
      }),
    });
    expect((await POST(incomplete)).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not expose database errors", async () => {
    mocks.query.mockRejectedValue(new Error("private database details"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database details");
  });
});
