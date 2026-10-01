import "server-only";
import { cookies } from "next/headers";
import { staffProfiles } from "@/data/fixtures/staff";
import { getTeamSlug } from "@/lib/env";
import { readStaffToken, STAFF_COOKIE } from "./staff-token";
export async function getStaffProfile() {
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!secret || !token) return null;
  const role = readStaffToken(token, getTeamSlug(), secret);
  return staffProfiles.find((p) => p.role === role) ?? null;
}
