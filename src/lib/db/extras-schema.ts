import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  FulfillmentStatus,
  PaymentStatus,
  ServiceId,
} from "@/data/contracts/extras";

const scope = () => ({
  teamSlug: text("team_slug").notNull(),
  stayId: text("stay_id").notNull(),
});
const selection = () => ({
  id: uuid("id").notNull(),
  serviceId: text("service_id").$type<ServiceId>().notNull(),
  serviceDate: date("service_date").notNull(),
  requestedTime: text("requested_time").notNull(),
  quantity: integer("quantity").notNull(),
  decoration: boolean("decoration").notNull(),
  unitPrice: integer("unit_price").notNull(),
  addonPrice: integer("addon_price").notNull(),
});
export const extrasCarts = pgTable(
  "extras_carts",
  { ...scope(), version: integer("version").notNull().default(0) },
  (t) => [primaryKey({ columns: [t.teamSlug, t.stayId] })],
);
export const extrasCartItems = pgTable(
  "extras_cart_items",
  {
    ...scope(),
    ...selection(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamSlug, t.stayId, t.id] })],
);
export const extrasOrders = pgTable(
  "extras_orders",
  {
    ...scope(),
    id: uuid("id").primaryKey(),
    cartVersion: integer("cart_version").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    guestName: text("guest_name").notNull(),
    guestContact: text("guest_contact").notNull(),
    houseName: text("house_name").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    checkInTime: text("check_in_time").notNull(),
    checkOutTime: text("check_out_time").notNull(),
    guests: integer("guests").notNull(),
    comment: text("comment").notNull().default(""),
    total: integer("total").notNull(),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("extras_orders_cart_version_idx").on(
      t.teamSlug,
      t.stayId,
      t.cartVersion,
    ),
    uniqueIndex("extras_orders_key_idx").on(
      t.teamSlug,
      t.stayId,
      t.idempotencyKey,
    ),
  ],
);
export const extrasOrderItems = pgTable(
  "extras_order_items",
  {
    ...scope(),
    ...selection(),
    orderId: uuid("order_id").notNull(),
    name: text("name").notNull(),
    addonName: text("addon_name"),
    confirmedTime: text("confirmed_time"),
    fulfillmentStatus: text("fulfillment_status")
      .$type<FulfillmentStatus>()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamSlug, t.stayId, t.orderId, t.id] })],
);
