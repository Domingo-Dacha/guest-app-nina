import { z } from "zod";

export const serviceIdSchema = z.enum(["furako", "breakfast", "late-checkout"]);
export type ServiceId = z.infer<typeof serviceIdSchema>;
export type CategoryId =
  "food" | "bath" | "experiences" | "occasion" | "comfort";
export type PaymentStatus = "paid" | "refund_pending" | "refunded";
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
  price: number;
  unit: string;
  confirmation: "automatic" | "manual";
  times: string[];
  addon?: { name: string; price: number };
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
  quantity: z.number().int().min(1).max(6),
  decoration: z.boolean(),
});
export type Selection = z.infer<typeof selectionSchema>;
export type CartItem = Selection & { unitPrice: number; addonPrice: number };
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
    total: z.number().int().min(1),
  }),
  z.object({
    action: z.literal("checkout"),
    version,
    key: z.uuid(),
    total: z.number().int().min(1),
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
