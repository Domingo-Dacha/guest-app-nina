// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  profile: vi.fn(),
  query: vi.fn(),
  writable: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/lib/auth/server-session", () => ({
  hasValidSession: mocks.session,
}));
vi.mock("@/lib/auth/staff-session", () => ({ getStaffProfile: mocks.profile }));
vi.mock("@/lib/db/client", () => ({
  getSqlClient: () => ({ query: mocks.query }),
}));
vi.mock("@/lib/env", () => ({
  getTeamSlug: () => "nina",
  demoWritesEnabled: mocks.writable,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookie }),
}));
import { GET, POST } from "@/app/api/staff/route";
import { staffProfiles } from "@/data/fixtures/staff";
const request = (body: unknown, origin?: string) =>
  new Request("https://guest.test/api/staff", {
    method: "POST",
    headers: origin ? { origin } : undefined,
    body: JSON.stringify(body),
  });
const command = {
  action: "advance",
  orderId: "10000000-0000-4000-8000-000000000001",
  id: "10000000-0000-4000-8000-000000000002",
  version: 0,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(true);
  mocks.profile.mockResolvedValue(staffProfiles[0]);
  mocks.writable.mockReturnValue(true);
  mocks.query.mockResolvedValue([]);
});
describe("staff API boundaries", () => {
  it("requires the guest gate and selected signed demo role before reading or changing tasks", async () => {
    mocks.session.mockResolvedValue(false);
    expect(
      (await GET(new Request("https://guest.test/api/staff"))).status,
    ).toBe(401);
    expect((await POST(request(command))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue(true);
    mocks.profile.mockResolvedValue(null);
    expect((await POST(request(command))).status).toBe(403);
    const result = await GET(new Request("https://guest.test/api/staff"));
    expect((await result.json()).tasks).toEqual([]);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("blocks preview and cross-origin writes, invalid forms and unbounded date ranges", async () => {
    mocks.writable.mockReturnValue(false);
    expect((await POST(request(command))).status).toBe(403);
    mocks.writable.mockReturnValue(true);
    expect((await POST(request(command, "https://other.test"))).status).toBe(
      403,
    );
    expect(
      (await POST(request({ ...command, action: "confirm", time: "99:99" })))
        .status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request(
            "https://guest.test/api/staff?from=2026-01-01&to=2026-12-31",
          ),
        )
      ).status,
    ).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not leak database errors and does not accept a body-supplied employee identity", async () => {
    mocks.profile.mockResolvedValue(staffProfiles[1]);
    const denied = await POST(
      request({
        action: "transfer",
        orderId: command.orderId,
        version: 0,
        status: "pending",
        bookingReference: "",
        recordReference: "",
        note: "",
        role: "manager",
      }),
    );
    expect(denied.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.query.mockRejectedValue(new Error("private connection credentials"));
    const result = await GET(new Request("https://guest.test/api/staff"));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private");
  });
});
