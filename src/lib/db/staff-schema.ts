import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { TransferStatus } from "@/data/contracts/staff";
const scope = () => ({
  teamSlug: text("team_slug").notNull(),
  stayId: text("stay_id").notNull(),
  orderId: uuid("order_id").notNull(),
});
const actor = () => ({
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
});
const date = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const staffTaskEvents = pgTable("staff_task_events", {
  id: uuid("id").primaryKey(),
  ...scope(),
  itemId: uuid("item_id").notNull(),
  ...actor(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: date(),
});
export const staffTransferRecords = pgTable(
  "staff_transfer_records",
  {
    ...scope(),
    status: text("status").$type<TransferStatus>().notNull().default("pending"),
    version: integer("version").notNull().default(0),
    bookingReference: text("booking_reference").notNull().default(""),
    recordReference: text("record_reference").notNull().default(""),
    note: text("note").notNull().default(""),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamSlug, t.orderId] })],
);
export const staffTransferEvents = pgTable("staff_transfer_events", {
  id: uuid("id").primaryKey(),
  ...scope(),
  ...actor(),
  status: text("status").$type<TransferStatus>().notNull(),
  bookingReference: text("booking_reference").notNull(),
  recordReference: text("record_reference").notNull(),
  note: text("note").notNull(),
  createdAt: date(),
});
