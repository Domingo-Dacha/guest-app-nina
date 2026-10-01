import { NextResponse } from "next/server";
import { extrasCommandSchema } from "@/data/contracts/extras";
import { extrasCatalogRepository } from "@/data/repositories/extras-catalog-repository";
import { PostgresExtrasRepository } from "@/data/repositories/postgres-extras-repository";
import { hasValidSession } from "@/lib/auth/server-session";
import { getSqlClient } from "@/lib/db/client";
import { demoWritesEnabled, getTeamSlug } from "@/lib/env";
import { ExtrasError } from "@/lib/extras-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function context() {
  const [stay, catalog] = await Promise.all([
    extrasCatalogRepository.getStay(),
    extrasCatalogRepository.getCatalog(),
  ]);
  const sql = getSqlClient();
  return {
    stay,
    catalog,
    repository: new PostgresExtrasRepository(
      (query, values) => sql.query(query, values),
      getTeamSlug(),
    ),
  };
}
export async function GET() {
  if (!(await hasValidSession()))
    return json({ error: "Войдите с PIN команды." }, 401);
  try {
    const { stay, catalog, repository } = await context();
    const [cart, orders] = await Promise.all([
      repository.getCart(stay),
      repository.listOrders(stay),
    ]);
    return json({
      stay,
      catalog,
      cart,
      orders,
      serverNow: new Date().toISOString(),
      writable: demoWritesEnabled(),
    });
  } catch {
    return json(
      { error: "Не удалось загрузить корзину и заказы. Попробуйте ещё раз." },
      503,
    );
  }
}
export async function POST(request: Request) {
  if (!(await hasValidSession()))
    return json({ error: "Войдите с PIN команды." }, 401);
  if (!demoWritesEnabled())
    return json(
      {
        error: "В этой версии доступен только просмотр. Оформление выключено.",
      },
      403,
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Обновите страницу приложения." }, 403);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Не удалось прочитать форму." }, 400);
  }
  const command = extrasCommandSchema.safeParse(input);
  if (!command.success)
    return json({ error: "Проверьте обязательные поля и количество." }, 400);
  try {
    const { stay, catalog, repository } = await context();
    const order = await repository.execute(command.data, stay, catalog);
    return json({ order });
  } catch (error) {
    if (error instanceof ExtrasError)
      return json({ error: error.message, code: error.code }, 409);
    return json(
      {
        error:
          "Не удалось сохранить изменения. Корзина не очищена. Повторите действие.",
      },
      503,
    );
  }
}
