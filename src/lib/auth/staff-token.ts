import { createHmac, timingSafeEqual } from "node:crypto";
import { staffRoleSchema, type StaffRole } from "@/data/contracts/staff";
export const STAFF_COOKIE = "domingo_staff_demo";
export const STAFF_TTL = 12 * 60 * 60;
const sign = (payload: string, secret: string) =>
  createHmac("sha256", `${secret}:staff-demo`).update(payload).digest();
export function createStaffToken(
  role: StaffRole,
  team: string,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({ role, team, exp: Math.floor(now / 1000) + STAFF_TTL }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}
export function readStaffToken(
  token: string,
  team: string,
  secret: string,
  now = Date.now(),
): StaffRole | null {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const actual = Buffer.from(signature, "base64url"),
      expected = sign(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const role = staffRoleSchema.safeParse(data.role);
    return role.success &&
      data.team === team &&
      Number.isInteger(data.exp) &&
      data.exp > Math.floor(now / 1000)
      ? role.data
      : null;
  } catch {
    return null;
  }
}
