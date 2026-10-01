import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { staffCommandSchema } from "@/data/contracts/staff";
import { staffProfiles } from "@/data/fixtures/staff";
import { PostgresStaffRepository } from "@/data/repositories/postgres-staff-repository";
import { hasValidSession } from "@/lib/auth/server-session";
import { getStaffProfile } from "@/lib/auth/staff-session";
import {
  createStaffToken,
  STAFF_COOKIE,
  STAFF_TTL,
} from "@/lib/auth/staff-token";
import { getSqlClient } from "@/lib/db/client";
import { demoWritesEnabled, getTeamSlug } from "@/lib/env";
import { moscowDate, StaffError } from "@/lib/staff-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const repository = () => {
  const sql = getSqlClient();
  return new PostgresStaffRepository(
    (query, values) => sql.query(query, values),
    getTeamSlug(),
  );
};
export async function GET(request: Request) {
  if (!(await hasValidSession()))
    return json({ error: "Войдите с PIN команды." }, 401);
  const params = new URL(request.url).searchParams;
  const range = z.object({ from: z.iso.date(), to: z.iso.date() }).safeParse({
    from: params.get("from") ?? moscowDate(new Date()),
    to: params.get("to") ?? params.get("from") ?? moscowDate(new Date()),
  });
  if (
    !range.success ||
    range.data.to < range.data.from ||
    Date.parse(range.data.to) - Date.parse(range.data.from) > 30 * 86400000
  )
    return json({ error: "Выберите период не более 31 дня." }, 400);
  try {
    const profile = await getStaffProfile();
    const snapshot = profile
      ? await repository().snapshot(profile, range.data.from, range.data.to)
      : { tasks: [], transfers: [] };
    return json({
      ...snapshot,
      profile,
      profiles: staffProfiles,
      writable: demoWritesEnabled(),
      serverNow: new Date().toISOString(),
    });
  } catch {
    return json(
      { error: "Не удалось загрузить задания. Повторите попытку." },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!(await hasValidSession()))
    return json({ error: "Войдите с PIN команды." }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Обновите страницу приложения." }, 403);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Не удалось прочитать форму." }, 400);
  }
  const parsed = staffCommandSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Проверьте поля формы." }, 400);
  try {
    const command = parsed.data;
    if (command.action === "profile") {
      const secret = process.env.SESSION_SECRET;
      if (!secret) return json({ error: "Доступ пока не настроен." }, 503);
      (await cookies()).set(
        STAFF_COOKIE,
        createStaffToken(command.role, getTeamSlug(), secret),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: STAFF_TTL,
        },
      );
      return json({ ok: true });
    }
    const profile = await getStaffProfile();
    if (!profile)
      return json({ error: "Выберите демонстрационную роль." }, 403);
    if (!demoWritesEnabled())
      return json({ error: "Эта версия доступна только для просмотра." }, 403);
    await repository().execute(profile, command);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof StaffError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          "Не удалось сохранить действие. Обновите список перед повторной попыткой.",
      },
      503,
    );
  }
}
