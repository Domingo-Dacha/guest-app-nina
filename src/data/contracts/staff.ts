import { z } from "zod";
import type { PaymentStatus, ServiceId } from "./extras";

export const staffRoleSchema = z.enum(["manager", "kitchen", "bath", "other"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;
export type Department = Exclude<StaffRole, "manager">;
export type StaffProfile = { id: string; name: string; role: StaffRole };
export type WorkStatus = "new" | "in_progress" | "ready" | "completed";
export type TaskStatus =
  WorkStatus | "awaiting_approval" | "cancelled" | "payment_hold";
export type TransferStatus =
  "pending" | "transferred" | "needs_review" | "error";
export type StaffEvent = {
  id: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
};
export type StaffTask = {
  id: string;
  orderId: string;
  orderNumber: string;
  department: Department;
  serviceId: ServiceId;
  name: string;
  houseName: string;
  guests: number;
  date: string;
  requestedTime: string;
  confirmedTime: string | null;
  quantity: number;
  robes: number;
  decoration: boolean;
  fir: boolean;
  durationDays: number;
  durationHours: number | null;
  amount: number;
  paidAmount: number | null;
  paymentStatus: PaymentStatus;
  status: TaskStatus;
  version: number;
  comment: string;
  history: StaffEvent[];
};
export type TransferRecord = {
  orderId: string;
  orderNumber: string;
  houseName: string;
  total: number;
  paymentStatus: PaymentStatus;
  status: TransferStatus;
  version: number;
  bookingReference: string;
  recordReference: string;
  note: string;
  updatedBy: string | null;
  updatedAt: string | null;
};
export type StaffSnapshot = {
  profile: StaffProfile | null;
  tasks: StaffTask[];
  transfers: TransferRecord[];
  profiles: StaffProfile[];
  writable: boolean;
  serverNow: string;
};
const version = z.number().int().min(0);
export const staffCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), role: staffRoleSchema }),
  z.object({
    action: z.literal("advance"),
    orderId: z.uuid(),
    id: z.uuid(),
    version,
  }),
  z.object({
    action: z.literal("confirm"),
    orderId: z.uuid(),
    id: z.uuid(),
    version,
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?:–(?:[01]\d|2[0-3]):[0-5]\d)?$/),
  }),
  z.object({
    action: z.literal("transfer"),
    orderId: z.uuid(),
    version,
    status: z.enum(["pending", "transferred", "needs_review", "error"]),
    bookingReference: z.string().trim().max(120),
    recordReference: z.string().trim().max(160),
    note: z.string().trim().max(1000),
  }),
]);
export type StaffCommand = z.infer<typeof staffCommandSchema>;
export type StaffMutation = Exclude<StaffCommand, { action: "profile" }>;
export interface StaffRepository {
  snapshot(
    profile: StaffProfile,
    from: string,
    to: string,
  ): Promise<{ tasks: StaffTask[]; transfers: TransferRecord[] }>;
  execute(profile: StaffProfile, command: StaffMutation): Promise<void>;
}
