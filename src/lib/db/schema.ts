import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export {
  extrasCarts,
  extrasCartItems,
  extrasOrders,
  extrasOrderItems,
} from "./extras-schema";
export {
  staffTaskEvents,
  staffTransferRecords,
  staffTransferEvents,
} from "./staff-schema";

export const guestRequests = pgTable(
  "guest_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamSlug: text("team_slug").notNull(),
    kind: text("kind").notNull(),
    guestName: text("guest_name"),
    message: text("message").notNull(),
    status: text("status").notNull().default("new"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("guest_requests_team_idempotency_idx").on(
      table.teamSlug,
      table.idempotencyKey,
    ),
    index("guest_requests_team_created_idx").on(
      table.teamSlug,
      table.createdAt,
    ),
  ],
);

export const pinAccessAttempts = pgTable(
  "pin_access_attempts",
  {
    teamSlug: text("team_slug").notNull(),
    fingerprint: text("fingerprint").notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.teamSlug, table.fingerprint] }),
    index("pin_access_attempts_blocked_idx").on(
      table.teamSlug,
      table.blockedUntil,
    ),
  ],
);
