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
  await db.exec(`
    insert into extras_carts (team_slug, stay_id) values ('legacy', 'stay');
    insert into extras_orders (id,team_slug,stay_id,cart_version,idempotency_key,guest_name,guest_contact,house_name,check_in,check_out,check_in_time,check_out_time,guests,total,payment_status)
    values ('10000000-0000-4000-8000-000000000001','legacy','stay',0,'10000000-0000-4000-8000-000000000002','Тест','guest@example.test','Дом у сосен','2026-10-16','2026-10-18','15:00','12:00',4,600000,'paid');
    insert into extras_order_items (team_slug,stay_id,order_id,id,service_id,name,service_date,requested_time,quantity,decoration,unit_price,addon_price,fulfillment_status)
    values ('legacy','stay','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','furako','Фурако','2026-10-17','19:00',1,false,600000,0,'awaiting_approval');
  `);
  await db.exec(
    await readFile("db/migrations/0003_extras_catalog.sql", "utf8"),
  );
  await db.exec(await readFile("db/migrations/0004_extras_burger.sql", "utf8"));
  await db.exec(await readFile("db/migrations/0005_bath_packages.sql", "utf8"));
  await db.exec(
    await readFile("db/migrations/0007_breakfast_per_person.sql", "utf8"),
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("extras PostgreSQL persistence (isolated, no server or external database)", () => {
  it("stores new sauna tariffs, extensions and robes as paid order snapshots", async () => {
    const meridianStay = { ...stay, houseName: "Меридиан" };
    for (const [serviceId, total] of [
      ["bath-gavshino", 1100000],
      ["bath-paradise", 1350000],
      ["furako-vensky", 700000],
    ] as const) {
      const repository = repo(serviceId);
      await repository.execute(
        {
          action: "save",
          version: 0,
          item: {
            id: randomUUID(),
            serviceId,
            date: "2026-10-17",
            time: "16:00",
            quantity: 1,
            decoration: false,
            robes: 2,
            ...(serviceId !== "furako-vensky" ? { durationHours: 4 } : {}),
          },
        },
        meridianStay,
        catalog,
        now,
      );
      await repository.execute(
        {
          action: "checkout",
          version: 1,
          total,
          key: randomUUID(),
          comment: "",
        },
        meridianStay,
        catalog,
        now,
      );
      const [order] = await repository.listOrders(meridianStay);
      expect(order.total).toBe(total);
      expect(order.items[0]).toMatchObject({
        robes: 2,
        robePrice: 50000,
        fulfillmentStatus: "awaiting_approval",
      });
      expect(order.items[0].durationHours).toBe(
        serviceId === "furako-vensky" ? undefined : 4,
      );
    }
  });
  it("persists bath package duration, robes and decoration together with firewood quantities", async () => {
    const packageItem = {
      id: randomUUID(),
      serviceId: "bath-vensky-furako" as const,
      date: "2026-10-17",
      time: "16:00",
      quantity: 1,
      decoration: true,
      robes: 2,
      durationHours: 3,
    };
    await repo("package").execute(
      { action: "save", version: 0, item: packageItem },
      stay,
      catalog,
      now,
    );
    await repo("package").execute(
      {
        action: "save",
        version: 1,
        item: {
          id: randomUUID(),
          serviceId: "firewood",
          date: "2026-10-17",
          time: "По согласованию",
          quantity: 2,
          decoration: false,
        },
      },
      stay,
      catalog,
      now,
    );
    const cart = await repo("package").getCart(stay);
    expect(
      cart.items.find((i) => i.serviceId === "bath-vensky-furako"),
    ).toMatchObject({
      durationHours: 3,
      robes: 2,
      unitPrice: 1550000,
      addonPrice: 200000,
      robePrice: 50000,
    });
    await repo("package").execute(
      {
        action: "checkout",
        version: 2,
        key: randomUUID(),
        total: 2050000,
        comment: "",
      },
      stay,
      catalog,
      now,
    );
    const [order] = await repo("package").listOrders(stay);
    expect(order.total).toBe(2050000);
    expect(
      order.items.find((i) => i.serviceId === "bath-vensky-furako"),
    ).toMatchObject({
      durationHours: 3,
      robes: 2,
      decoration: true,
      fulfillmentStatus: "awaiting_approval",
    });
    expect(order.items.find((i) => i.serviceId === "firewood")).toMatchObject({
      quantity: 2,
      unitPrice: 100000,
    });
    expect((await repo("package").getCart(stay)).items).toHaveLength(0);
  });
  it("preserves historical order prices while migrating defaults for new options", async () => {
    const [order] = await repo("legacy").listOrders(stay);
    expect(order.total).toBe(600000);
    expect(order.items[0]).toMatchObject({
      unitPrice: 600000,
      durationDays: 1,
      fir: false,
      robes: 0,
    });
  });
  it("persists two-day furako and extra prices, then restores exactly the same order", async () => {
    await repo("options").execute(
      {
        action: "save",
        version: 0,
        item: {
          id: randomUUID(),
          serviceId: "furako",
          date: "2026-10-16",
          time: "19:00",
          quantity: 1,
          decoration: true,
          durationDays: 2,
          fir: true,
          robes: 2,
        },
      },
      stay,
      catalog,
      now,
    );
    expect((await repo("options").getCart(stay)).items[0]).toMatchObject({
      durationDays: 2,
      firPrice: 200000,
      robePrice: 50000,
      robes: 2,
    });
    await repo("options").execute(
      {
        action: "checkout",
        version: 1,
        key: randomUUID(),
        comment: "",
        total: 1300000,
      },
      stay,
      catalog,
      now,
    );
    expect((await repo("options").listOrders(stay))[0].items[0]).toMatchObject({
      durationDays: 2,
      fir: true,
      robes: 2,
      unitPrice: 800000,
      addonPrice: 200000,
      firPrice: 200000,
      robePrice: 50000,
    });
  });
  it("keeps historical free bicycle orders readable after retiring the service", async () => {
    const legacyCatalog = structuredClone(catalog);
    legacyCatalog.services.find((s) => s.id === "bicycles")!.retired = false;
    await repo("free").execute(
      {
        action: "save",
        version: 0,
        item: {
          id: randomUUID(),
          serviceId: "bicycles",
          date: "2026-10-17",
          time: "По согласованию",
          quantity: 2,
          decoration: false,
        },
      },
      stay,
      legacyCatalog,
      now,
    );
    const command = {
      action: "checkout" as const,
      version: 1,
      key: randomUUID(),
      comment: "",
      total: 0,
    };
    const order = await repo("free").execute(command, stay, legacyCatalog, now);
    expect(order).toMatchObject({ total: 0, paymentStatus: "not_required" });
    expect(order?.items[0].fulfillmentStatus).toBe("awaiting_approval");
    expect((await repo("free").getCart(stay)).items).toHaveLength(0);
    expect((await repo("free").listOrders(stay))[0].items[0].name).toBe(
      "Велосипеды",
    );
    expect((await repo("free").execute(command, stay, catalog, now))?.id).toBe(
      order?.id,
    );
  });
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
          total: 90000,
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
        { action: "review", version: 1, total: 90000 },
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
          total: 900000,
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
      total: 900000,
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

it("converts an old unpaid breakfast cart to people without losing portions, then snapshots the new tariff", async () => {
  const team = "legacy-breakfast-cart";
  await add(team, "breakfast");
  await db.query(
    "update extras_cart_items set quantity=6,unit_price=190000,servings_per_unit=null where team_slug=$1",
    [team],
  );
  const old = await repo(team).getCart(stay);
  expect(old.items[0]).toMatchObject({
    quantity: 6,
    unitPrice: 190000,
    servingsPerUnit: 2,
  });
  await expect(
    repo(team).execute(
      { action: "review", version: 1, total: 1140000 },
      stay,
      catalog,
      now,
    ),
  ).rejects.toThrow("Цены изменились");
  await repo(team).execute(
    { action: "reprice", version: 1 },
    stay,
    catalog,
    now,
  );
  const updated = await repo(team).getCart(stay);
  expect(updated.items[0]).toMatchObject({
    quantity: 12,
    unitPrice: 90000,
    servingsPerUnit: 1,
  });
  const order = await repo(team).execute(
    {
      action: "checkout",
      version: 2,
      key: randomUUID(),
      total: 1080000,
      comment: "",
    },
    stay,
    catalog,
    now,
  );
  expect(order!.items[0]).toMatchObject({
    quantity: 12,
    unitPrice: 90000,
    servingsPerUnit: 1,
  });
  expect(order!.total).toBe(1080000);
  expect((await repo(team).getCart(stay)).items).toEqual([]);
});
