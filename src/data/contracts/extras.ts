import { z } from "zod";

export const serviceIdSchema = z.enum([
  "furako",
  "breakfast",
  "late-checkout",
  "farm-basket",
  "lunch",
  "burger",
  "dinner",
  "bath-vensky",
  "bath-vensky-furako",
  "furako-vensky",
  "bath-gavshino",
  "bath-paradise",
  "sup",
  "bicycles",
  "firewood",
  "robe",
]);
export type ServiceId = z.infer<typeof serviceIdSchema>;
export type CategoryId =
  "food" | "bath" | "experiences" | "occasion" | "comfort";
export type PaymentStatus =
  "paid" | "not_required" | "refund_pending" | "refunded";
export type FulfillmentStatus =
  "awaiting_approval" | "confirmed" | "completed" | "cancelled";
export type StayContext = {
  id: string;
  guestName: string;
  contact: string;
  houseName: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  guests: number;
};
export type ExtraService = {
  id: ServiceId;
  category: CategoryId;
  name: string;
  summary: string;
  description: string;
  includes: string[];
  conditions: string;
  price: number | null;
  unit: string;
  confirmation: "automatic" | "manual";
  times: string[];
  deliveryWindow?: string;
  retired?: boolean;
  telegramOrder?: { username: string };
  addon?: {
    name: string;
    price: number;
    image?: { src: string; alt: string };
  };
  firAddon?: {
    name: string;
    price: number;
    image?: { src: string; alt: string };
  };
  robeAddon?: {
    name: string;
    price: number;
    image?: { src: string; alt: string };
  };
  durations?: { days: 1 | 2; price: number }[];
  hourly?: { included: number; extraHourPrice: number; max: number };
  sessionHours?: number;
  packageServiceId?: ServiceId;
  priceByDate?: Record<string, number>;
  newYearPrice?: number;
  images?: { src: string; alt: string }[];
  allowedHouses?: string[];
  timing?: "agreement";
  quantityLabel?: string;
};
export type ExtrasCatalog = {
  categories: { id: CategoryId; name: string }[];
  services: ExtraService[];
  rules: { timeZone: string; breakfastDeadline: string; maxSets: number };
};
export const selectionSchema = z.object({
  id: z.uuid(),
  serviceId: serviceIdSchema,
  date: z.iso.date(),
  time: z.string().min(1).max(20),
  quantity: z.number().int().min(1).max(12),
  decoration: z.boolean(),
  durationDays: z.union([z.literal(1), z.literal(2)]).optional(),
  fir: z.boolean().optional(),
  robes: z.number().int().min(0).max(6).optional(),
  durationHours: z.number().int().min(2).max(12).optional(),
});
export type Selection = z.infer<typeof selectionSchema>;
export type CartItem = Selection & {
  unitPrice: number;
  servingsPerUnit?: number;
  addonPrice: number;
  firPrice?: number;
  robePrice?: number;
};
export type Cart = { version: number; items: CartItem[] };
export type OrderItem = CartItem & {
  name: string;
  addonName: string | null;
  fulfillmentStatus: FulfillmentStatus;
  confirmedTime: string | null;
};
export type ExtraOrder = {
  id: string;
  number: string;
  createdAt: string;
  paymentStatus: PaymentStatus;
  total: number;
  comment: string;
  stay: StayContext;
  items: OrderItem[];
};
export type ExtrasSnapshot = {
  catalog: ExtrasCatalog;
  stay: StayContext;
  cart: Cart;
  orders: ExtraOrder[];
  serverNow: string;
  writable: boolean;
};
const version = z.number().int().min(0);
export const extrasCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), version, item: selectionSchema }),
  z.object({ action: z.literal("remove"), version, id: z.uuid() }),
  z.object({ action: z.literal("reprice"), version }),
  z.object({
    action: z.literal("review"),
    version,
    total: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("checkout"),
    version,
    key: z.uuid(),
    total: z.number().int().min(0),
    comment: z.string().trim().max(1000),
  }),
]);
export type ExtrasCommand = z.infer<typeof extrasCommandSchema>;
export interface ExtrasRepository {
  getCart(stay: StayContext): Promise<Cart>;
  listOrders(stay: StayContext): Promise<ExtraOrder[]>;
  execute(
    command: ExtrasCommand,
    stay: StayContext,
    catalog: ExtrasCatalog,
    now?: Date,
  ): Promise<ExtraOrder | null>;
}
