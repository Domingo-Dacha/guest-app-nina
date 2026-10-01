// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresStaffRepository } from "@/data/repositories/postgres-staff-repository";
import { PostgresExtrasRepository } from "@/data/repositories/postgres-extras-repository";
import { extrasFixture } from "@/data/fixtures/extras";
import { staffProfiles } from "@/data/fixtures/staff";
import { cartTotal } from "@/lib/extras-rules";
import type { StayContext } from "@/data/contracts/extras";
let db: PGlite;
const manager = staffProfiles[0],
  kitchen = staffProfiles[1],
  bath = staffProfiles[2];
const stay: StayContext = {
  id: "test-stay",
  guestName: "Тестовый гость",
  contact: "guest@example.test",
  houseName: "Дом у сосен",
  checkIn: "2026-10-16",
  checkOut: "2026-10-18",
  checkInTime: "15:00",
  checkOutTime: "12:00",
  guests: 4,
};
const now = new Date("2026-10-16T10:00:00Z");
const query = async (sql: string, params?: unknown[]) =>
  (await db.query<Record<string, unknown>>(sql, params)).rows;
const staff = (team = "nina") => new PostgresStaffRepository(query, team);
const snapshot = (profile = manager, team = "nina") =>
  staff(team).snapshot(profile, "2026-10-16", "2026-10-18");
async function checkout(team = "nina") {
  const guest = new PostgresExtrasRepository(query, team);
  for (const [index, serviceId] of (["breakfast", "furako"] as const).entries())
    await guest.execute(
      {
        action: "save",
        version: index,
        item: {
          id: randomUUID(),
          serviceId,
          date: "2026-10-17",
          time: serviceId === "breakfast" ? "09:00–09:30" : "19:00",
          quantity: serviceId === "breakfast" ? 2 : 1,
          decoration: serviceId === "furako",
          robes: serviceId === "furako" ? 2 : 0,
        },
      },
      stay,
      extrasFixture,
      now,
    );
  const cart = await guest.getCart(stay);
  return (await guest.execute(
    {
      action: "checkout",
      version: 2,
      key: randomUUID(),
      total: cartTotal(cart.items),
      comment: "Соус отдельно",
    },
    stay,
    extrasFixture,
    now,
  ))!;
}
beforeAll(async () => {
  db = new PGlite();
  for (const file of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("truncate extras_carts cascade");
});
afterAll(async () => {
  await db.close();
});
describe("staff dashboard persistence and authorization", () => {
  it("splits mixed orders by direction and isolates teams, finances and amounts", async () => {
    const order = await checkout();
    await checkout("other");
    const all = await snapshot();
    expect(all.tasks).toHaveLength(2);
    expect(all.transfers).toHaveLength(1);
    expect(all.transfers[0].total).toBe(order.total);
    const food = await snapshot(kitchen),
      sauna = await snapshot(bath);
    expect(food.tasks).toHaveLength(1);
    expect(food.transfers).toEqual([]);
    expect(sauna.transfers).toEqual([]);
    expect(food.tasks[0]).toMatchObject({
      amount: 180000,
      paidAmount: 180000,
      quantity: 2,
      status: "new",
      comment: "Соус отдельно",
    });
    expect(sauna.tasks[0]).toMatchObject({
      amount: 1000000,
      paidAmount: 1000000,
      robes: 2,
      status: "awaiting_approval",
    });
    expect(food.tasks[0].orderId).toBe(sauna.tasks[0].orderId);
    expect(JSON.stringify(food)).not.toContain("guest@example.test");
    expect((await snapshot(manager, "empty")).tasks).toEqual([]);
    expect(
      (await staff().snapshot(manager, "2026-10-18", "2026-10-18")).tasks,
    ).toEqual([]);
  });
  it("persists staged kitchen work without closing its sibling or changing payment", async () => {
    const order = await checkout();
    let task = (await snapshot(kitchen)).tasks[0];
    for (const status of ["in_progress", "ready", "completed"]) {
      await staff().execute(kitchen, {
        action: "advance",
        orderId: task.orderId,
        id: task.id,
        version: task.version,
      });
      task = (await snapshot(kitchen)).tasks[0];
      expect(task.status).toBe(status);
    }
    expect(task.history.map((h) => h.actor)).toEqual([
      kitchen.name,
      kitchen.name,
      kitchen.name,
    ]);
    expect(task.history).toHaveLength(3);
    const guest = new PostgresExtrasRepository(query, "nina");
    const saved = (await guest.listOrders(stay))[0];
    expect(saved.total).toBe(order.total);
    expect(saved.paymentStatus).toBe("paid");
    expect(
      saved.items.find((i) => i.serviceId === "breakfast")!.fulfillmentStatus,
    ).toBe("completed");
    expect(
      saved.items.find((i) => i.serviceId === "furako")!.fulfillmentStatus,
    ).toBe("awaiting_approval");
  });
  it("requires manager agreement and rejects wrong roles, duplicate updates and foreign teams", async () => {
    await checkout();
    const task = (await snapshot(bath)).tasks[0];
    await expect(
      staff().execute(bath, {
        action: "advance",
        orderId: task.orderId,
        id: task.id,
        version: 0,
      }),
    ).rejects.toThrow("Сначала");
    await expect(
      staff().execute(bath, {
        action: "confirm",
        orderId: task.orderId,
        id: task.id,
        version: 0,
        time: "18:00",
      }),
    ).rejects.toThrow("управляющему");
    await expect(
      staff().execute(kitchen, {
        action: "advance",
        orderId: task.orderId,
        id: task.id,
        version: 0,
      }),
    ).rejects.toThrow("недоступно");
    await expect(
      staff("other").execute(manager, {
        action: "confirm",
        orderId: task.orderId,
        id: task.id,
        version: 0,
        time: "18:00",
      }),
    ).rejects.toThrow("недоступно");
    await staff().execute(manager, {
      action: "confirm",
      orderId: task.orderId,
      id: task.id,
      version: 0,
      time: "18:00",
    });
    expect((await snapshot(bath)).tasks[0]).toMatchObject({
      status: "new",
      confirmedTime: "18:00",
      version: 1,
    });
    const command = {
      action: "advance" as const,
      orderId: task.orderId,
      id: task.id,
      version: 1,
    };
    const results = await Promise.allSettled([
      staff().execute(bath, command),
      staff().execute(bath, command),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await snapshot(bath)).tasks[0].history).toHaveLength(2);
  });
  it("holds refunded orders and cancelled items without producing work or audit events", async () => {
    const order = await checkout();
    const task = (await snapshot(kitchen)).tasks[0];
    await db.query(
      "update extras_orders set payment_status='refund_pending' where id=$1",
      [order.id],
    );
    expect((await snapshot(kitchen)).tasks[0]).toMatchObject({
      status: "payment_hold",
      paidAmount: null,
    });
    await expect(
      staff().execute(kitchen, {
        action: "advance",
        orderId: task.orderId,
        id: task.id,
        version: 0,
      }),
    ).rejects.toThrow("оплату");
    await db.query(
      "update extras_orders set payment_status='paid' where id=$1",
      [order.id],
    );
    await db.query(
      "update extras_order_items set fulfillment_status='cancelled' where id=$1",
      [task.id],
    );
    await expect(
      staff().execute(kitchen, {
        action: "advance",
        orderId: task.orderId,
        id: task.id,
        version: 0,
      }),
    ).rejects.toThrow();
    expect((await snapshot(kitchen)).tasks[0].history).toEqual([]);
  });
  it("records manual transfer references with revision checks without creating a payment", async () => {
    const order = await checkout();
    const command = {
      action: "transfer" as const,
      orderId: order.id,
      version: 0,
      status: "transferred" as const,
      bookingReference: "TEST-BOOKING-1",
      recordReference: "TEST-RECORD-1",
      note: "Тестовая отметка",
    };
    await expect(staff().execute(kitchen, command)).rejects.toThrow(
      "управляющему",
    );
    await expect(
      staff().execute(manager, { ...command, bookingReference: "" }),
    ).rejects.toThrow("номер брони");
    await staff().execute(manager, command);
    expect((await snapshot()).transfers[0]).toMatchObject({
      status: "transferred",
      version: 1,
      updatedBy: manager.name,
      bookingReference: "TEST-BOOKING-1",
    });
    await expect(staff().execute(manager, command)).rejects.toThrow(
      "изменилась",
    );
    await expect(staff("other").execute(manager, command)).rejects.toThrow(
      "изменилась",
    );
    expect(await query("select * from staff_transfer_events")).toHaveLength(1);
    expect(
      (await snapshot()).tasks.every((t) => t.paymentStatus === "paid"),
    ).toBe(true);
    expect(
      (await query("select count(*)::int as n from extras_orders"))[0].n,
    ).toBe(1);
  });
});

it("shows a paid future breakfast in all dates immediately and keeps dated views precise", async () => {
  const order = await checkout();
  expect(
    (await staff().snapshot(kitchen, "2026-10-01", "2026-10-01")).tasks,
  ).toEqual([]);
  const all = await staff().snapshot(kitchen, null, null);
  expect(all.tasks).toHaveLength(1);
  expect(all.tasks[0]).toMatchObject({
    orderId: order.id,
    date: "2026-10-17",
    quantity: 2,
    servingsPerUnit: 1,
    amount: 180000,
    status: "new",
  });
  expect(
    (await staff("another-team").snapshot(kitchen, null, null)).tasks,
  ).toEqual([]);
});

it("preserves the price and portions of breakfast paid before the new tariff", async () => {
  const order = await checkout();
  await db.query(
    "update extras_order_items set unit_price=190000,servings_per_unit=null where order_id=$1 and service_id='breakfast'",
    [order.id],
  );
  await db.query("update extras_orders set total=1380000 where id=$1", [
    order.id,
  ]);
  const task = (await staff().snapshot(kitchen, null, null)).tasks[0];
  expect(task).toMatchObject({
    quantity: 2,
    servingsPerUnit: 2,
    amount: 380000,
    paidAmount: 380000,
  });
  await staff().execute(kitchen, {
    action: "advance",
    orderId: task.orderId,
    id: task.id,
    version: task.version,
  });
  const guestOrder = (
    await new PostgresExtrasRepository(query, "nina").listOrders(stay)
  )[0];
  expect(guestOrder.total).toBe(1380000);
  expect(
    guestOrder.items.find((i) => i.serviceId === "breakfast"),
  ).toMatchObject({ quantity: 2, servingsPerUnit: 2, unitPrice: 190000 });
});
