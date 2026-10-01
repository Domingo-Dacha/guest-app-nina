// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extrasFixture as catalog } from "@/data/fixtures/extras";
import { PostgresExtrasRepository } from "@/data/repositories/postgres-extras-repository";
import type { ExtrasCommand, StayContext } from "@/data/contracts/extras";

let db: PGlite;
const now = new Date("2026-10-16T10:00:00Z");
const stay: StayContext = {
  id: "stay",
  guestName: "Тестовый гость",
  contact: "guest@example.test",
  houseName: "Дом у сосен",
  checkIn: "2026-10-16",
  checkOut: "2026-10-18",
  checkInTime: "15:00",
  checkOutTime: "12:00",
  guests: 4,
};
const repo = (team: string) =>
  new PostgresExtrasRepository(
    async (sql, params) =>
      (await db.query<Record<string, unknown>>(sql, params)).rows,
    team,
  );
async function add(
  team: string,
  serviceId: "furako" | "breakfast" = "furako",
  version = 0,
) {
  await repo(team).execute(
    {
      action: "save",
      version,
      item: {
        id: randomUUID(),
        serviceId,
        date: "2026-10-17",
        time: serviceId === "furako" ? "19:00" : "09:00–09:30",
        quantity: 1,
        decoration: serviceId === "furako",
      },
    },
    stay,
    catalog,
    now,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/0002_extras.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("extras PostgreSQL persistence (isolated, no server or external database)", () => {
  it("saves two services and clears the cart atomically, preserving separate confirmation and payment statuses", async () => {
    await add("checkout");
    await add("checkout", "breakfast", 1);
    const command: ExtrasCommand = {
      action: "checkout",
      version: 2,
      total: 990000,
      comment: "Демонстрация",
      key: randomUUID(),
    };
    const order = await repo("checkout").execute(command, stay, catalog, now);
    expect(order?.total).toBe(990000);
    expect(order?.paymentStatus).toBe("paid");
    expect(
      order?.items.find((i) => i.serviceId === "furako")?.fulfillmentStatus,
    ).toBe("awaiting_approval");
    expect(
      order?.items.find((i) => i.serviceId === "breakfast")?.fulfillmentStatus,
    ).toBe("confirmed");
    expect(
      order?.items.find((i) => i.serviceId === "breakfast")?.confirmedTime,
    ).toBe("09:00–09:30");
    expect((await repo("checkout").getCart(stay)).items).toHaveLength(0);
    expect(
      (await repo("checkout").execute(command, stay, catalog, now))?.id,
    ).toBe(order?.id);
    expect(
      (
        await repo("checkout").execute(
          { ...command, key: randomUUID() },
          stay,
          catalog,
          now,
        )
      )?.id,
    ).toBe(order?.id);
    expect(await repo("checkout").listOrders(stay)).toHaveLength(1);
  });
  it("isolates carts and orders by team AND stay, including colliding item IDs", async () => {
    await add("isolation");
    expect((await repo("other-team").getCart(stay)).items).toHaveLength(0);
    expect(
      (await repo("isolation").getCart({ ...stay, id: "other-stay" })).items,
    ).toHaveLength(0);
    expect(await repo("other-team").listOrders(stay)).toHaveLength(0);
    expect(
      await repo("checkout").listOrders({ ...stay, id: "other-stay" }),
    ).toHaveLength(0);
  });
  it("rejects stale cart edits instead of overwriting newer selections", async () => {
    await add("revision");
    const cart = await repo("revision").getCart(stay);
    await expect(
      repo("revision").execute(
        { action: "remove", version: 0, id: cart.items[0].id },
        stay,
        catalog,
        now,
      ),
    ).rejects.toThrow("Корзина изменилась");
    expect((await repo("revision").getCart(stay)).items).toHaveLength(1);
    await repo("revision").execute(
      {
        action: "save",
        version: 1,
        item: { ...cart.items[0], decoration: false },
      },
      stay,
      catalog,
      now,
    );
    expect((await repo("revision").getCart(stay)).items[0].addonPrice).toBe(0);
  });
  it("keeps the cart if checkout fails validation and reprices only after explicit acceptance", async () => {
    await add("deadline", "breakfast");
    await expect(
      repo("deadline").execute(
        {
          action: "checkout",
          key: randomUUID(),
          total: 190000,
          comment: "",
          version: 1,
        },
        stay,
        catalog,
        new Date("2026-10-16T15:00:00Z"),
      ),
    ).rejects.toThrow("Приём заказов");
    expect((await repo("deadline").getCart(stay)).items).toHaveLength(1);
    const updated = structuredClone(catalog);
    updated.services.find((s) => s.id === "breakfast")!.price = 210000;
    await expect(
      repo("deadline").execute(
        { action: "review", version: 1, total: 190000 },
        stay,
        updated,
        now,
      ),
    ).rejects.toThrow("Цены изменились");
    await repo("deadline").execute(
      { action: "reprice", version: 1 },
      stay,
      updated,
      now,
    );
    expect((await repo("deadline").getCart(stay)).items[0].unitPrice).toBe(
      210000,
    );
  });
  it("does not lose the cart or leave a partial order when the database rejects an order line", async () => {
    await add("rollback");
    await db.exec(
      "alter table extras_order_items add constraint test_rejection check (team_slug <> 'rollback')",
    );
    await expect(
      repo("rollback").execute(
        {
          action: "checkout",
          version: 1,
          total: 800000,
          key: randomUUID(),
          comment: "",
        },
        stay,
        catalog,
        now,
      ),
    ).rejects.toThrow("test_rejection");
    expect((await repo("rollback").getCart(stay)).version).toBe(1);
    expect((await repo("rollback").getCart(stay)).items).toHaveLength(1);
    expect(await repo("rollback").listOrders(stay)).toHaveLength(0);
  });
  it("deduplicates simultaneous checkout calls with different keys", async () => {
    await add("concurrent");
    const command = {
      action: "checkout" as const,
      version: 1,
      total: 800000,
      comment: "",
    };
    const orders = await Promise.all([
      repo("concurrent").execute(
        { ...command, key: randomUUID() },
        stay,
        catalog,
        now,
      ),
      repo("concurrent").execute(
        { ...command, key: randomUUID() },
        stay,
        catalog,
        now,
      ),
    ]);
    expect(orders[0]?.id).toBe(orders[1]?.id);
    expect(await repo("concurrent").listOrders(stay)).toHaveLength(1);
  });
});
