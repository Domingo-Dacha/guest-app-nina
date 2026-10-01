import { randomUUID } from "node:crypto";
import type {
  Cart,
  CartItem,
  ExtraOrder,
  ExtrasCatalog,
  ExtrasCommand,
  ExtrasRepository,
  OrderItem,
  StayContext,
} from "@/data/contracts/extras";
import {
  ExtrasError,
  pricedItem,
  repriceItem,
  serviceFor,
  validateCheckout,
  validateSelection,
} from "@/lib/extras-rules";

type Row = Record<string, unknown>;
export type ExtrasQuery = (query: string, values?: unknown[]) => Promise<Row[]>;
function itemFromRow(row: Row): CartItem {
  return {
    id: String(row.id),
    serviceId: row.service_id as CartItem["serviceId"],
    date: String(row.service_date).slice(0, 10),
    time: String(row.requested_time),
    quantity: Number(row.quantity),
    decoration: Boolean(row.decoration),
    unitPrice: Number(row.unit_price),
    servingsPerUnit: Number(
      row.servings_per_unit ?? (row.service_id === "breakfast" ? 2 : 1),
    ),
    addonPrice: Number(row.addon_price),
    durationDays: Number(row.duration_days ?? 1) as 1 | 2,
    fir: Boolean(row.fir),
    robes: Number(row.robes ?? 0),
    firPrice: Number(row.fir_price ?? 0),
    robePrice: Number(row.robe_price ?? 0),
    durationHours:
      row.duration_hours == null ? undefined : Number(row.duration_hours),
  };
}
// Every read and write is scoped to both the team and the existing demo stay.
// A cart revision gates each mutation. Checkout writes the order, its line items
// and removes the cart lines in ONE PostgreSQL statement, so they commit together.
export class PostgresExtrasRepository implements ExtrasRepository {
  constructor(
    private query: ExtrasQuery,
    private team: string,
  ) {}
  async getCart(stay: StayContext): Promise<Cart> {
    const rows = await this.query(
      `select c.version, i.*, i.service_date::text as service_date from extras_carts c left join extras_cart_items i using (team_slug, stay_id) where c.team_slug=$1 and c.stay_id=$2 order by i.created_at, i.id`,
      [this.team, stay.id],
    );
    return {
      version: Number(rows[0]?.version ?? 0),
      items: rows.filter((r) => r.id).map(itemFromRow),
    };
  }
  async listOrders(stay: StayContext): Promise<ExtraOrder[]> {
    const rows = await this.query(
      `select *, check_in::text as check_in, check_out::text as check_out from extras_orders where team_slug=$1 and stay_id=$2 order by created_at desc`,
      [this.team, stay.id],
    );
    const items = await this.query(
      `select *, service_date::text as service_date from extras_order_items where team_slug=$1 and stay_id=$2 order by extras_order_items.service_date, requested_time, id`,
      [this.team, stay.id],
    );
    return rows.map((row) => ({
      id: String(row.id),
      number: `DG-${String(row.id).replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      createdAt: new Date(row.created_at as string).toISOString(),
      paymentStatus: row.payment_status as ExtraOrder["paymentStatus"],
      total: Number(row.total),
      comment: String(row.comment),
      stay: {
        id: stay.id,
        guestName: String(row.guest_name),
        contact: String(row.guest_contact),
        houseName: String(row.house_name),
        checkIn: String(row.check_in).slice(0, 10),
        checkOut: String(row.check_out).slice(0, 10),
        checkInTime: String(row.check_in_time),
        checkOutTime: String(row.check_out_time),
        guests: Number(row.guests),
      },
      items: items
        .filter((i) => i.order_id === row.id)
        .map((i) => ({
          ...itemFromRow(i),
          name: String(i.name),
          addonName: i.addon_name as string | null,
          fulfillmentStatus:
            i.fulfillment_status as OrderItem["fulfillmentStatus"],
          confirmedTime: i.confirmed_time as string | null,
        })),
    }));
  }
  async execute(
    command: ExtrasCommand,
    stay: StayContext,
    catalog: ExtrasCatalog,
    now = new Date(),
  ): Promise<ExtraOrder | null> {
    if (command.action === "checkout") {
      const repeated = await this.query(
        `select id from extras_orders where team_slug=$1 and stay_id=$2 and (idempotency_key=$3 or cart_version=$4)`,
        [this.team, stay.id, command.key, command.version],
      );
      if (repeated.length)
        return (await this.listOrders(stay)).find(
          (o) => o.id === repeated[0].id,
        )!;
    }
    const cart = await this.getCart(stay);
    if (cart.version !== command.version)
      throw new ExtrasError(
        "CART_CHANGED",
        "Корзина изменилась в другой вкладке. Проверьте её ещё раз.",
      );
    if (command.action === "review") {
      validateCheckout(cart.items, stay, catalog, command.total, now);
      return null;
    }
    const gate = `with gate as (update extras_carts set version=version+1 where team_slug=$1 and stay_id=$2 and version=$3 returning team_slug, stay_id)`;
    const scope: unknown[] = [this.team, stay.id, command.version];
    let result: Row[];
    if (command.action === "save") {
      const reason = validateSelection(command.item, stay, catalog, now);
      if (reason) throw new ExtrasError("UNAVAILABLE", reason);
      if (
        cart.items.length >= 20 &&
        !cart.items.some((i) => i.id === command.item.id)
      )
        throw new ExtrasError(
          "CART_LIMIT",
          "В корзине может быть не более 20 позиций.",
        );
      const item = pricedItem(command.item, catalog);
      await this.query(
        `insert into extras_carts (team_slug, stay_id) values ($1,$2) on conflict do nothing`,
        [this.team, stay.id],
      );
      result = await this.query(
        `${gate}
        insert into extras_cart_items (team_slug,stay_id,id,service_id,service_date,requested_time,quantity,decoration,unit_price,addon_price,duration_days,fir,robes,fir_price,robe_price,duration_hours,servings_per_unit)
        select team_slug,stay_id,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18 from gate
        on conflict (team_slug,stay_id,id) do update set service_id=excluded.service_id,service_date=excluded.service_date,requested_time=excluded.requested_time,quantity=excluded.quantity,decoration=excluded.decoration,unit_price=excluded.unit_price,addon_price=excluded.addon_price,duration_days=excluded.duration_days,fir=excluded.fir,robes=excluded.robes,fir_price=excluded.fir_price,robe_price=excluded.robe_price,duration_hours=excluded.duration_hours,servings_per_unit=excluded.servings_per_unit returning id`,
        [
          ...scope,
          item.id,
          item.serviceId,
          item.date,
          item.time,
          item.quantity,
          item.decoration,
          item.unitPrice,
          item.addonPrice,
          item.durationDays,
          item.fir,
          item.robes,
          item.firPrice,
          item.robePrice,
          item.durationHours ?? null,
          item.servingsPerUnit,
        ],
      );
    } else if (command.action === "remove") {
      result = await this.query(
        `${gate}, removed as (delete from extras_cart_items i using gate g where i.team_slug=g.team_slug and i.stay_id=g.stay_id and i.id=$4 returning i.id) select * from gate`,
        [...scope, command.id],
      );
    } else if (command.action === "reprice") {
      const prices = cart.items.map((i) => repriceItem(i, catalog));
      result = await this.query(
        `${gate}, updated as (update extras_cart_items i set quantity=p.quantity,servings_per_unit=p."servingsPerUnit",unit_price=p."unitPrice",addon_price=p."addonPrice",fir_price=p."firPrice",robe_price=p."robePrice" from gate g, jsonb_to_recordset($4::jsonb) as p(id uuid,quantity integer,"servingsPerUnit" integer,"unitPrice" integer,"addonPrice" integer,"firPrice" integer,"robePrice" integer) where i.team_slug=g.team_slug and i.stay_id=g.stay_id and i.id=p.id returning i.id) select * from gate`,
        [...scope, JSON.stringify(prices)],
      );
    } else {
      validateCheckout(cart.items, stay, catalog, command.total, now);
      const orderId = randomUUID();
      const lines = cart.items.map((item) => {
        const service = serviceFor(catalog, item.serviceId);
        return {
          ...item,
          name: service.name,
          addonName: item.decoration ? service.addon!.name : null,
          fulfillmentStatus:
            service.confirmation === "automatic"
              ? "confirmed"
              : "awaiting_approval",
          confirmedTime:
            service.confirmation === "automatic" ? item.time : null,
        };
      });
      result = await this.query(
        `${gate}, new_order as (
        insert into extras_orders (id,team_slug,stay_id,cart_version,idempotency_key,guest_name,guest_contact,house_name,check_in,check_out,check_in_time,check_out_time,guests,comment,total,payment_status)
        select $4,team_slug,stay_id,$3,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,case when $15::integer=0 then 'not_required' else 'paid' end from gate returning *
      ), saved_items as (
        insert into extras_order_items (team_slug,stay_id,order_id,id,service_id,name,addon_name,service_date,requested_time,confirmed_time,quantity,decoration,unit_price,addon_price,fulfillment_status,duration_days,fir,robes,fir_price,robe_price,duration_hours,servings_per_unit)
        select o.team_slug,o.stay_id,o.id,p.id,p."serviceId",p.name,p."addonName",p.date,p.time,p."confirmedTime",p.quantity,p.decoration,p."unitPrice",p."addonPrice",p."fulfillmentStatus",p."durationDays",p.fir,p.robes,p."firPrice",p."robePrice",p."durationHours",p."servingsPerUnit" from new_order o,
        jsonb_to_recordset($16::jsonb) as p(id uuid,"serviceId" text,name text,"addonName" text,date date,time text,"confirmedTime" text,quantity integer,decoration boolean,"unitPrice" integer,"addonPrice" integer,"fulfillmentStatus" text,"durationDays" integer,fir boolean,robes integer,"firPrice" integer,"robePrice" integer,"durationHours" integer,"servingsPerUnit" integer) returning id
      ), cleared as (
        delete from extras_cart_items i using new_order o where i.team_slug=o.team_slug and i.stay_id=o.stay_id and (select count(*) from saved_items)>0 returning i.id
      ) select id from new_order`,
        [
          ...scope,
          orderId,
          command.key,
          stay.guestName,
          stay.contact,
          stay.houseName,
          stay.checkIn,
          stay.checkOut,
          stay.checkInTime,
          stay.checkOutTime,
          stay.guests,
          command.comment,
          command.total,
          JSON.stringify(lines),
        ],
      );
      // A concurrent checkout can win the revision. Return that same order,
      // even when a second tab supplied a different idempotency key.
      if (!result.length) {
        const existing = await this.query(
          `select id from extras_orders where team_slug=$1 and stay_id=$2 and cart_version=$3`,
          scope,
        );
        if (existing.length)
          return (await this.listOrders(stay)).find(
            (o) => o.id === existing[0].id,
          )!;
      } else
        return (await this.listOrders(stay)).find(
          (o) => o.id === result[0].id,
        )!;
    }
    if (!result.length)
      throw new ExtrasError(
        "CART_CHANGED",
        "Корзина изменилась. Обновите её и повторите действие.",
      );
    return null;
  }
}
